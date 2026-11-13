"use server";

import * as Sentry from "@sentry/nextjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTenantFor, NOT_ALLOWED } from "@/features/tenants";
import { writeAudit } from "@/lib/audit";
import { getSocialProvider } from "@/lib/social";
import { SocialProviderError } from "@/lib/social/types";
import { getServiceClient } from "@/lib/supabase/service";
import { cpcRuleBody, parseBoostForm, toBoostBody } from "./boost";
import { metaAdsConnection } from "./connection";

export type AdsState = { error?: string; field?: string; savedAt?: number };

const ADS = "/posts/ads";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Connect Meta ads from the brand's Facebook account; Meta's consent page if it's needed. */
export async function connectMetaAdsAction(): Promise<void> {
  const tenant = await getTenantFor("brand.settings");
  if (!tenant?.zernioProfileId) redirect(`${ADS}?ads_error=not_allowed`);
  const db = getServiceClient();
  const { data: fb } = await db
    .from("social_accounts")
    .select("zernio_account_id")
    .eq("tenant_id", tenant.id)
    .eq("platform", "facebook")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (!fb) redirect(`${ADS}?ads_error=no_facebook`);
  let target: string;
  try {
    const r = await getSocialProvider().connectMetaAds({
      profileId: tenant.zernioProfileId,
      facebookAccountId: fb.zernio_account_id,
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
 * Boost a post (T79). Spends the brand's money: owner/admin only, confirmed in place, and sent
 * once with the form's idempotency key (a double submit replays the same boost, never a second).
 */
export async function boostPostAction(_prev: AdsState, formData: FormData): Promise<AdsState> {
  const tenant = await getTenantFor("brand.settings");
  if (!tenant?.zernioProfileId) return { error: NOT_ALLOWED };
  const key = String(formData.get("idempotencyKey") ?? "");
  if (!UUID.test(key)) return { error: "Something went wrong. Reload the page." };
  try {
    const conn = await metaAdsConnection(tenant.zernioProfileId);
    if (!conn) return { error: "Connect Meta ads first." };
    const social = getSocialProvider();
    const accounts = await social.listAdAccounts({
      connectionId: conn.id,
      signal: AbortSignal.timeout(15_000),
    });
    const account = accounts.find((a) => a.id === formData.get("adAccountId") && a.usable);
    if (!account) return { error: "Pick one of your ad accounts.", field: "adAccountId" };
    const parsed = parseBoostForm(formData, { minDailyBudget: account.minDailyBudget });
    if (!parsed.ok) return { error: parsed.error, field: parsed.field };
    const { data: post } = await getServiceClient()
      .from("posts")
      .select("content")
      .eq("tenant_id", tenant.id)
      .eq("zernio_post_id", parsed.value.postId)
      .eq("status", "published")
      .maybeSingle();
    if (!post) return { error: "Pick one of your published posts.", field: "post" };
    const name = `Boost: ${post.content.replace(/\s+/g, " ").trim().slice(0, 40) || "post"}`;
    const ad = await social.boostPost({
      body: toBoostBody(parsed.value, { connectionId: conn.id, name, now: new Date() }),
      idempotencyKey: key,
      signal: AbortSignal.timeout(120_000),
    });
    await writeAudit(getServiceClient(), {
      tenantId: tenant.id,
      action: "post_boosted",
      actor: tenant.userId,
      details: {
        adId: ad.id,
        goal: parsed.value.goal,
        daily: parsed.value.daily,
        days: parsed.value.days,
        currency: account.currency,
      },
    });
  } catch (error) {
    Sentry.captureException(error, { extra: { tenantId: tenant.id, step: "boostPost" } });
    return {
      error:
        "Meta didn't take the boost. Check the ad account has a payment method in Meta, then try again in a few minutes.",
    };
  }
  revalidatePath(ADS);
  return { savedAt: Date.now() };
}

/** Pause or resume a boost; only campaigns on this brand's own ads connection. */
export async function setCampaignStatusAction(
  _prev: AdsState,
  formData: FormData,
): Promise<AdsState> {
  const tenant = await getTenantFor("brand.settings");
  if (!tenant?.zernioProfileId) return { error: NOT_ALLOWED };
  const id = String(formData.get("id") ?? "");
  const status = formData.get("status") === "active" ? "active" : "paused";
  try {
    const conn = await metaAdsConnection(tenant.zernioProfileId);
    const social = getSocialProvider();
    const campaigns = conn
      ? await social.listAdCampaigns({ connectionId: conn.id, signal: AbortSignal.timeout(15_000) })
      : [];
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
  try {
    const conn = await metaAdsConnection(tenant.zernioProfileId);
    if (!conn) return { error: "Connect Meta ads first." };
    const social = getSocialProvider();
    const accounts = await social.listAdAccounts({
      connectionId: conn.id,
      signal: AbortSignal.timeout(15_000),
    });
    const account = accounts.find((a) => a.id === formData.get("adAccountId"));
    if (!account) return { error: "Pick one of your ad accounts.", field: "adAccountId" };
    // Not idempotent upstream: one attempt.
    const rule = await social.createAdRule({
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
      details: { ruleId: rule.id, kind: "max_cpc", maxCpc, currency: account.currency },
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
    const conn = await metaAdsConnection(tenant.zernioProfileId);
    const social = getSocialProvider();
    const rules = conn
      ? await social.listAdRules({ connectionId: conn.id, signal: AbortSignal.timeout(15_000) })
      : [];
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
