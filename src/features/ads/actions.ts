"use server";

import * as Sentry from "@sentry/nextjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTenantFor, NOT_ALLOWED } from "@/features/tenants";
import { writeAudit } from "@/lib/audit";
import { getSocialProvider } from "@/lib/social";
import { SocialProviderError } from "@/lib/social/types";
import { getServiceClient } from "@/lib/supabase/service";
import { cpcRuleBody, parseBoostForm, readBoostPost, toBoostBody } from "./boost";
import {
  CHATGPT_IMAGE_MAX_BYTES,
  CHATGPT_IMAGE_TYPES,
  parseChatGptAd,
  toChatGptAdBody,
} from "./chatgpt";
import { adConnections, networkAdAccounts, openAiConnection } from "./connection";
import { AD_NETWORKS, isAdNetwork, minDailyFor, type AdNetwork } from "./networks";

export type AdsState = { error?: string; field?: string; savedAt?: number; network?: AdNetwork };

const ADS = "/posts/ads";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The brand's active posting account on a platform (its Zernio id). */
async function postingAccount(tenantId: string, platform: string) {
  const { data } = await getServiceClient()
    .from("social_accounts")
    .select("zernio_account_id")
    .eq("tenant_id", tenantId)
    .eq("platform", platform)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  return data?.zernio_account_id ?? null;
}

/** Connect Meta ads from the brand's Facebook account; Meta's consent page if it's needed. */
export async function connectMetaAdsAction(): Promise<void> {
  const tenant = await getTenantFor("brand.settings");
  if (!tenant?.zernioProfileId) redirect(`${ADS}?ads_error=not_allowed`);
  const fb = await postingAccount(tenant.id, "facebook");
  if (!fb) redirect(`${ADS}?ads_error=no_facebook`);
  const db = getServiceClient();
  let target: string;
  try {
    const r = await getSocialProvider().connectMetaAds({
      profileId: tenant.zernioProfileId,
      facebookAccountId: fb,
      redirectUrl: `${process.env.APP_URL}${ADS}?ads=connected`,
      signal: AbortSignal.timeout(20_000),
    });
    target = "authUrl" in r ? r.authUrl : `${ADS}?ads=connected`;
    await writeAudit(db, {
      tenantId: tenant.id,
      action: "ads_connect_started",
      actor: tenant.userId,
      details: { platform: "metaads", consent: "authUrl" in r },
    });
  } catch (error) {
    Sentry.captureException(error, { extra: { tenantId: tenant.id, step: "connectMetaAds" } });
    const planLimit = error instanceof SocialProviderError && error.details.status === 402;
    redirect(`${ADS}?ads_error=${planLimit ? "plan_limit" : "unavailable"}`);
  }
  redirect(target);
}

/**
 * Connect LinkedIn or Pinterest ads (T79b). Reuses the brand's posting sign-in, so no screen is
 * shown; when that sign-in can't reach ad accounts the owner reconnects the posting account in
 * Settings → Accounts (our own connect flow), never on the partner's page.
 */
export async function connectNetworkAdsAction(formData: FormData): Promise<void> {
  const network = formData.get("network");
  if (network !== "linkedin" && network !== "pinterest") redirect(ADS);
  const tenant = await getTenantFor("brand.settings");
  if (!tenant?.zernioProfileId) redirect(`${ADS}?ads_error=not_allowed`);
  const posting = await postingAccount(tenant.id, network);
  if (!posting) redirect(`${ADS}?ads_error=no_${network}`);
  let target = `${ADS}?ads=connected&network=${network}`;
  try {
    const r = await getSocialProvider().connectSameTokenAds({
      profileId: tenant.zernioProfileId,
      platform: network,
      postingAccountId: posting,
      redirectUrl: `${process.env.APP_URL}${ADS}?ads=connected&network=${network}`,
      signal: AbortSignal.timeout(20_000),
    });
    if ("needsReconnect" in r) target = `${ADS}?ads_error=reconnect_${network}`;
    await writeAudit(getServiceClient(), {
      tenantId: tenant.id,
      action: "ads_connect_started",
      actor: tenant.userId,
      details: { platform: `${network}ads`, needsReconnect: "needsReconnect" in r },
    });
  } catch (error) {
    Sentry.captureException(error, { extra: { tenantId: tenant.id, step: "connectNetworkAds" } });
    const planLimit = error instanceof SocialProviderError && error.details.status === 402;
    target = `${ADS}?ads_error=${planLimit ? "plan_limit" : "unavailable"}`;
  }
  redirect(target);
}

const boostRefused = (network: AdNetwork, error: unknown) => {
  const label = AD_NETWORKS[network].label;
  const s = error instanceof SocialProviderError ? error.details.status : undefined;
  if (network === "linkedin" && s === 422) {
    return "LinkedIn only boosts posts from your Company Page, and the Page may need to allow sponsoring that post first (LinkedIn → Sponsorship permissions).";
  }
  return `${label} didn't take the boost. Check the ad account has a payment method in ${label}, then try again in a few minutes.`;
};

/**
 * Boost a post (T79, T79b). Spends the brand's money: owner/admin only, confirmed in place, and
 * sent once with the form's idempotency key (a double submit replays the same boost).
 */
export async function boostPostAction(_prev: AdsState, formData: FormData): Promise<AdsState> {
  const tenant = await getTenantFor("brand.settings");
  if (!tenant?.zernioProfileId) return { error: NOT_ALLOWED };
  const key = String(formData.get("idempotencyKey") ?? "");
  if (!UUID.test(key)) return { error: "Something went wrong. Reload the page." };
  const picked = readBoostPost(formData.get("post"));
  if (!picked) return { error: "Pick a post to boost.", field: "post" };
  const network = picked.network;
  const label = AD_NETWORKS[network].label;
  try {
    const conn = (await adConnections(tenant.zernioProfileId))[network];
    if (!conn) return { error: `Connect ${label} ads first.` };
    const social = getSocialProvider();
    const accounts = await social.listAdAccounts({
      connectionId: conn.id,
      signal: AbortSignal.timeout(15_000),
    });
    const account = accounts.find((a) => a.id === formData.get("adAccountId") && a.usable);
    if (!account) return { error: "Pick one of your ad accounts.", field: "adAccountId" };
    const parsed = parseBoostForm(formData, { minDailyBudget: minDailyFor(network, account) });
    if (!parsed.ok) return { error: parsed.error, field: parsed.field };

    const db = getServiceClient();
    const { data: post } = await db
      .from("posts")
      .select("content, target_account_ids")
      .eq("tenant_id", tenant.id)
      .eq("zernio_post_id", parsed.value.postId)
      .eq("status", "published")
      .maybeSingle();
    if (!post) return { error: "Pick one of your published posts.", field: "post" };
    // Meta boosts name the ads connection (T79a); LinkedIn and Pinterest name the posting
    // account the post went out on, which must be one of this post's targets.
    let accountId = conn.id;
    if (network !== "meta") {
      const { data: target } = await db
        .from("social_accounts")
        .select("zernio_account_id")
        .eq("tenant_id", tenant.id)
        .eq("platform", parsed.value.postPlatform)
        .in("id", post.target_account_ids)
        .limit(1)
        .maybeSingle();
      if (!target) return { error: "Pick one of your published posts.", field: "post" };
      accountId = target.zernio_account_id;
    }
    const name = `Boost: ${post.content.replace(/\s+/g, " ").trim().slice(0, 40) || "post"}`;
    const ad = await social.boostPost({
      body: toBoostBody(parsed.value, { accountId, name, now: new Date() }),
      idempotencyKey: key,
      signal: AbortSignal.timeout(120_000),
    });
    await writeAudit(db, {
      tenantId: tenant.id,
      action: "post_boosted",
      actor: tenant.userId,
      details: {
        adId: ad.id,
        network,
        goal: parsed.value.goal,
        daily: parsed.value.daily,
        days: parsed.value.days,
        currency: account.currency,
      },
    });
  } catch (error) {
    Sentry.captureException(error, { extra: { tenantId: tenant.id, step: "boostPost", network } });
    return { error: boostRefused(network, error) };
  }
  revalidatePath(ADS);
  return { savedAt: Date.now(), network };
}

/** Pause or resume a boost; only campaigns on this brand's own ads connections. */
export async function setCampaignStatusAction(
  _prev: AdsState,
  formData: FormData,
): Promise<AdsState> {
  const tenant = await getTenantFor("brand.settings");
  if (!tenant?.zernioProfileId) return { error: NOT_ALLOWED };
  const id = String(formData.get("id") ?? "");
  const status = formData.get("status") === "active" ? "active" : "paused";
  try {
    const [byNetwork, openai] = await Promise.all([
      adConnections(tenant.zernioProfileId),
      openAiConnection(tenant.zernioProfileId),
    ]);
    // T79c: ChatGPT campaigns pause and resume here too.
    const conns = [...Object.values(byNetwork), ...(openai ? [openai] : [])];
    const social = getSocialProvider();
    const signal = AbortSignal.timeout(15_000);
    const campaigns = (
      await Promise.all(conns.map((c) => social.listAdCampaigns({ connectionId: c.id, signal })))
    ).flat();
    const campaign = campaigns.find((c) => c.id === id);
    if (!campaign) return { error: "Something went wrong. Reload the page." };
    await social.setAdCampaignStatus({
      campaignId: id,
      platform: campaign.platform,
      status,
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    Sentry.captureException(error, { extra: { tenantId: tenant.id, step: "setCampaignStatus" } });
    return { error: "Couldn't change it right now. Try again." };
  }
  await writeAudit(getServiceClient(), {
    tenantId: tenant.id,
    action: status === "paused" ? "ad_paused" : "ad_resumed",
    actor: tenant.userId,
    details: { campaignId: id },
  });
  revalidatePath(ADS);
  return { savedAt: Date.now() };
}

/** Safety rule: pause a boost when a click costs more than the owner's cap. */
export async function addCpcRuleAction(_prev: AdsState, formData: FormData): Promise<AdsState> {
  const tenant = await getTenantFor("brand.settings");
  if (!tenant?.zernioProfileId) return { error: NOT_ALLOWED };
  const maxCpc = Number(String(formData.get("maxCpc") ?? "").trim());
  if (!(Number.isFinite(maxCpc) && maxCpc > 0 && maxCpc <= 100_000)) {
    return { error: "Give the most a click may cost, like 25.", field: "maxCpc" };
  }
  // `<network>|<ad account id>`
  const [network, adAccountId] = String(formData.get("adAccount") ?? "").split("|");
  if (!isAdNetwork(network) || !adAccountId) {
    return { error: "Pick one of your ad accounts.", field: "adAccount" };
  }
  try {
    const conns = await adConnections(tenant.zernioProfileId);
    const conn = conns[network];
    if (!conn) return { error: `Connect ${AD_NETWORKS[network].label} ads first.` };
    const accounts = await networkAdAccounts({ [network]: conn }, AbortSignal.timeout(15_000));
    const account = accounts.find((a) => a.id === adAccountId);
    if (!account) return { error: "Pick one of your ad accounts.", field: "adAccount" };
    // Not idempotent upstream: one attempt.
    const rule = await getSocialProvider().createAdRule({
      body: cpcRuleBody({
        connectionId: conn.id,
        adAccountId: account.id,
        maxCpc,
        currency: account.currency,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    await writeAudit(getServiceClient(), {
      tenantId: tenant.id,
      action: "ad_rule_created",
      actor: tenant.userId,
      details: { ruleId: rule.id, kind: "max_cpc", network, maxCpc, currency: account.currency },
    });
  } catch (error) {
    Sentry.captureException(error, { extra: { tenantId: tenant.id, step: "addCpcRule" } });
    return { error: "Couldn't add the rule right now. Try again." };
  }
  revalidatePath(ADS);
  return { savedAt: Date.now() };
}

/** Turn a safety rule on or off, or delete it. */
export async function changeRuleAction(_prev: AdsState, formData: FormData): Promise<AdsState> {
  const tenant = await getTenantFor("brand.settings");
  if (!tenant?.zernioProfileId) return { error: NOT_ALLOWED };
  const id = String(formData.get("id") ?? "");
  const op = String(formData.get("op") ?? "");
  if (!["on", "off", "delete"].includes(op))
    return { error: "Something went wrong. Reload the page." };
  try {
    const conns = Object.values(await adConnections(tenant.zernioProfileId));
    const social = getSocialProvider();
    const signal = AbortSignal.timeout(15_000);
    const rules = (
      await Promise.all(conns.map((c) => social.listAdRules({ connectionId: c.id, signal })))
    ).flat();
    if (!rules.some((r) => r.id === id)) return { error: "Something went wrong. Reload the page." };
    if (op === "delete") await social.deleteAdRule({ id, signal: AbortSignal.timeout(15_000) });
    else
      await social.setAdRuleEnabled({
        id,
        enabled: op === "on",
        signal: AbortSignal.timeout(15_000),
      });
  } catch (error) {
    Sentry.captureException(error, { extra: { tenantId: tenant.id, step: "changeRule" } });
    return { error: "Couldn't change it right now. Try again." };
  }
  await writeAudit(getServiceClient(), {
    tenantId: tenant.id,
    action: "ad_rule_changed",
    actor: tenant.userId,
    details: { ruleId: id, op },
  });
  revalidatePath(ADS);
  return { savedAt: Date.now() };
}

// --- ChatGPT ads (T79c, board "Ads · ChatGPT") -------------------------------------------------

/**
 * Connect ChatGPT ads with a key from ChatGPT Ads Manager. Owners and admins only, because the
 * key can change campaigns. The key goes straight to the provider; it is never stored, logged or
 * put in the audit row.
 */
export async function connectChatGptAdsAction(
  _prev: AdsState,
  formData: FormData,
): Promise<AdsState> {
  const apiKey = String(formData.get("apiKey") ?? "").trim();
  if (apiKey.length < 10 || apiKey.length > 500) {
    return { error: "Paste the key from ChatGPT Ads Manager → Settings.", field: "apiKey" };
  }
  const tenant = await getTenantFor("brand.settings");
  if (!tenant?.zernioProfileId) return { error: NOT_ALLOWED };
  try {
    const r = await getSocialProvider().connectOpenAiAds({
      profileId: tenant.zernioProfileId,
      apiKey,
      signal: AbortSignal.timeout(20_000),
    });
    await writeAudit(getServiceClient(), {
      tenantId: tenant.id,
      action: "ads_connect_started",
      actor: tenant.userId,
      details: { platform: "openaiads", connectionId: r.connectionId },
    });
  } catch (error) {
    const s = error instanceof SocialProviderError ? error.details.status : undefined;
    if (s === 401 || s === 400) {
      return {
        error: "That key didn't work. Copy it again from ChatGPT Ads Manager → Settings.",
        field: "apiKey",
      };
    }
    if (s === 402) {
      return {
        error: "Connecting ads needs a payment method on file. Contact us and we'll sort it out.",
      };
    }
    // Ids only: never the key (rule 10 and T79c).
    Sentry.captureException(new Error("connectChatGptAds failed"), {
      extra: { tenantId: tenant.id, status: s ?? null },
    });
    return { error: "ChatGPT ads couldn't be connected right now. Try again in a moment." };
  }
  revalidatePath(ADS);
  return { savedAt: Date.now() };
}

/** A new ChatGPT chat card ad: visits, a daily budget, runs until paused. Sent once. */
export async function createChatGptAdAction(
  _prev: AdsState,
  formData: FormData,
): Promise<AdsState> {
  const parsed = parseChatGptAd(formData);
  if (!parsed.ok) return { error: parsed.error, field: parsed.field };
  const photo = formData.get("photo");
  if (!(photo instanceof File) || photo.size === 0) {
    return { error: "Add a photo for the ad.", field: "photo" };
  }
  if (!(CHATGPT_IMAGE_TYPES as readonly string[]).includes(photo.type)) {
    return { error: "Use a JPG, PNG or WebP photo.", field: "photo" };
  }
  if (photo.size > CHATGPT_IMAGE_MAX_BYTES) {
    return { error: "Use a photo under 5 MB.", field: "photo" };
  }
  const tenant = await getTenantFor("brand.settings");
  if (!tenant?.zernioProfileId) return { error: NOT_ALLOWED };
  try {
    const conn = await openAiConnection(tenant.zernioProfileId);
    if (!conn) return { error: "Connect ChatGPT ads first." };
    const social = getSocialProvider();
    const accounts = await social.listAdAccounts({
      connectionId: conn.id,
      signal: AbortSignal.timeout(15_000),
    });
    const account = accounts.find((a) => a.usable);
    if (!account) return { error: "Your ChatGPT ad account can't be used right now." };
    const { publicUrl } = await social.uploadMedia({
      filename: photo.name || "ad.png",
      contentType: photo.type,
      bytes: new Uint8Array(await photo.arrayBuffer()),
      signal: AbortSignal.timeout(60_000),
    });
    // One attempt: a create isn't safe to repeat (it could make a second ad).
    const ad = await social.createAd({
      body: toChatGptAdBody(parsed.value, {
        connectionId: conn.id,
        adAccountId: account.id,
        imageUrl: publicUrl,
      }),
      signal: AbortSignal.timeout(120_000),
    });
    await writeAudit(getServiceClient(), {
      tenantId: tenant.id,
      action: "ad_created",
      actor: tenant.userId,
      details: {
        adId: ad.id,
        network: "openai",
        daily: parsed.value.daily,
        country: parsed.value.country,
        currency: account.currency,
      },
    });
  } catch (error) {
    Sentry.captureException(error, { extra: { tenantId: tenant.id, step: "createChatGptAd" } });
    const s = error instanceof SocialProviderError ? error.details.status : undefined;
    return {
      error:
        s === 422
          ? "ChatGPT didn't take that budget. It may need a higher daily amount; try again with more."
          : "ChatGPT didn't take the ad. Check the ad account in ChatGPT Ads Manager, then try again.",
    };
  }
  revalidatePath(ADS);
  return { savedAt: Date.now() };
}

/** Change a ChatGPT ad's daily budget (one of only two edits ChatGPT allows after creation). */
export async function setChatGptBudgetAction(
  _prev: AdsState,
  formData: FormData,
): Promise<AdsState> {
  const id = String(formData.get("id") ?? "");
  const daily = Number(String(formData.get("daily") ?? "").trim());
  if (!(Number.isInteger(daily) && daily >= 1 && daily <= 100_000)) {
    return { error: "Use a whole amount of at least 1.", field: "daily" };
  }
  const tenant = await getTenantFor("brand.settings");
  if (!tenant?.zernioProfileId) return { error: NOT_ALLOWED };
  try {
    const conn = await openAiConnection(tenant.zernioProfileId);
    const social = getSocialProvider();
    const campaigns = conn
      ? await social.listAdCampaigns({ connectionId: conn.id, signal: AbortSignal.timeout(15_000) })
      : [];
    const campaign = campaigns.find((c) => c.id === id && c.platform === "openai");
    if (!campaign) return { error: "Something went wrong. Reload the page." };
    await social.setAdCampaignBudget({
      campaignId: id,
      platform: "openai",
      amount: daily,
      type: "daily",
      signal: AbortSignal.timeout(15_000),
    });
    await writeAudit(getServiceClient(), {
      tenantId: tenant.id,
      action: "ad_budget_changed",
      actor: tenant.userId,
      details: { campaignId: id, daily },
    });
  } catch (error) {
    Sentry.captureException(error, { extra: { tenantId: tenant.id, step: "setChatGptBudget" } });
    const s = error instanceof SocialProviderError ? error.details.status : undefined;
    return {
      error:
        s === 422
          ? "ChatGPT keeps this ad's budget as it was set. Make a new ad for a different kind of budget."
          : "Couldn't change it right now. Try again.",
    };
  }
  revalidatePath(ADS);
  return { savedAt: Date.now() };
}
