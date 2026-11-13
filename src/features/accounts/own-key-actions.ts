"use server";

import * as Sentry from "@sentry/nextjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ensureZernioProfile, getTenantFor, NOT_ALLOWED } from "@/features/tenants";
import { writeAudit } from "@/lib/audit";
import { getSocialProvider } from "@/lib/social";
import { SocialProviderError } from "@/lib/social/types";
import { getServiceClient } from "@/lib/supabase/service";
import { handleAccountConnected } from "./events";
import {
  CONNECTED_PLATFORMS,
  isOwnKeyPlatform,
  parseEmail,
  parseLineKeys,
  parseSiteKeys,
  parseWhatsAppKeys,
} from "./own-keys";
import type { EmailDiscovery, ProviderErrorInfo } from "@/lib/social/types";

// T80: connect with the owner's own keys. Keys go straight to Zernio, which checks them; Waggle
// never stores, logs or audits them (only the platform and the new account id).

export type OwnKeyState = {
  error?: string;
  field?: string;
  done?: string;
  /** Email: the provider's own fix after a failed sign-in. */
  info?: ProviderErrorInfo;
};

export type EmailStep = {
  error?: string;
  email?: string;
  discovery?: EmailDiscovery;
};

const LABEL = { shopify: "Shopify", wordpress: "WordPress", webflow: "Webflow" } as const;
const status = (e: unknown) => (e instanceof SocialProviderError ? e.details.status : undefined);
const PLAN_LIMIT =
  "Connecting another account needs a payment method on file. Contact us and we'll sort it out.";

export async function connectSiteAction(
  _prev: OwnKeyState,
  formData: FormData,
): Promise<OwnKeyState> {
  const kind = String(formData.get("kind") ?? "");
  if (!isOwnKeyPlatform(kind)) return { error: "Something went wrong. Reload the page." };
  const tenant = await getTenantFor("accounts.manage");
  if (!tenant) return { error: NOT_ALLOWED };
  const parsed = parseSiteKeys(kind, formData);
  if (!parsed.ok) return { error: parsed.error, field: parsed.field };
  const db = getServiceClient();
  let name: string;
  let accountId: string;
  try {
    const { profileId } = await ensureZernioProfile({ db, social: getSocialProvider }, tenant.id);
    ({ accountId, name } = await getSocialProvider().connectSiteWithKeys({
      profileId,
      keys: parsed.keys,
      signal: AbortSignal.timeout(45_000),
    }));
  } catch (error) {
    const s = status(error);
    if (s === 400 || s === 401 || s === 403) {
      return { error: `${LABEL[kind]} didn't accept these details. Check them and try again.` };
    }
    if (s === 402) return { error: PLAN_LIMIT };
    Sentry.captureException(error, { extra: { tenantId: tenant.id, step: `connect_${kind}` } });
    return { error: `${LABEL[kind]} couldn't be connected right now. Try again in a moment.` };
  }
  await writeAudit(db, {
    tenantId: tenant.id,
    action: "integration_connected",
    actor: tenant.userId,
    details: { platform: kind, zernioAccountId: accountId, how: "own_keys" },
  });
  revalidatePath("/settings");
  return { done: `${LABEL[kind]} is connected: ${name}.` };
}

/** WhatsApp with the business's own Meta keys (Advanced). */
export async function connectWhatsAppKeysAction(
  _prev: OwnKeyState,
  formData: FormData,
): Promise<OwnKeyState> {
  const tenant = await getTenantFor("accounts.manage");
  if (!tenant) return { error: NOT_ALLOWED };
  const parsed = parseWhatsAppKeys(formData);
  if (!parsed.ok) return { error: parsed.error, field: parsed.field };
  const db = getServiceClient();
  try {
    const { profileId } = await ensureZernioProfile({ db, social: getSocialProvider }, tenant.id);
    const account = await getSocialProvider().connectWhatsAppWithKeys({
      profileId,
      ...parsed.value,
      signal: AbortSignal.timeout(45_000),
    });
    const result = await handleAccountConnected(db, {
      tenantId: tenant.id,
      zernioAccountId: account.accountId,
      platform: "whatsapp",
      username: account.username,
    });
    if (result.outcome === "foreign") {
      return { error: "This number is connected to another business in Waggle." };
    }
  } catch (error) {
    const s = status(error);
    if (s === 409) return { error: "This number is already connected to another business." };
    if (s === 400 || s === 401 || s === 403) {
      return {
        error:
          "Meta didn't accept these details. Check the token's WhatsApp permissions and that the phone number ID belongs to this account.",
      };
    }
    if (s === 402) return { error: PLAN_LIMIT };
    Sentry.captureException(error, { extra: { tenantId: tenant.id, step: "connectWhatsAppKeys" } });
    return { error: "WhatsApp couldn't be connected right now. Try again in a moment." };
  }
  await writeAudit(db, {
    tenantId: tenant.id,
    action: "integration_connected",
    actor: tenant.userId,
    details: { platform: "whatsapp", how: "own_keys" },
  });
  revalidatePath("/settings");
  return { done: "WhatsApp is connected. Messages to this number now reach Waggle." };
}

/** Disconnect a site connected with keys; only this brand's own. */
export async function disconnectSiteAction(
  _prev: OwnKeyState,
  formData: FormData,
): Promise<OwnKeyState> {
  const tenant = await getTenantFor("accounts.manage");
  if (!tenant?.zernioProfileId) return { error: NOT_ALLOWED };
  const id = String(formData.get("id") ?? "");
  try {
    const social = getSocialProvider();
    const mine = await social.listIntegrations({
      profileId: tenant.zernioProfileId,
      platforms: CONNECTED_PLATFORMS,
      signal: AbortSignal.timeout(15_000),
    });
    const site = mine.find((i) => i.id === id);
    if (!site) return { error: "Something went wrong. Reload the page." };
    await social.disconnectAccount({ accountId: id, signal: AbortSignal.timeout(15_000) });
    await writeAudit(getServiceClient(), {
      tenantId: tenant.id,
      action: "integration_disconnected",
      actor: tenant.userId,
      details: { platform: site.platform, zernioAccountId: id },
    });
  } catch (error) {
    Sentry.captureException(error, { extra: { tenantId: tenant.id, step: "disconnectSite" } });
    return { error: "Couldn't disconnect it right now. Try again." };
  }
  revalidatePath("/settings");
  return { done: "Disconnected." };
}

/** Email, step 1: find the address's provider and its app-password steps (T80b). */
export async function discoverEmailAction(
  _prev: EmailStep,
  formData: FormData,
): Promise<EmailStep> {
  const tenant = await getTenantFor("accounts.manage");
  if (!tenant) return { error: NOT_ALLOWED };
  const parsed = parseEmail(formData);
  if (!parsed.ok) return { error: parsed.error };
  try {
    const discovery = await getSocialProvider().discoverEmail({
      email: parsed.email,
      signal: AbortSignal.timeout(20_000),
    });
    return { email: parsed.email, discovery };
  } catch (error) {
    if (status(error) === 429) return { error: "Too many tries. Wait a minute, then try again." };
    Sentry.captureException(error, { extra: { tenantId: tenant.id, step: "discoverEmail" } });
    return { error: "Couldn't look up this address right now. Try again in a moment." };
  }
}

const EMAIL_CODES: Record<string, string> = {
  app_password_required: "This provider needs an app password, not your usual one.",
  imap_auth_failed: "The password didn't work for reading mail.",
  smtp_auth_failed: "Reading works, but sending didn't. Turn on sending (SMTP) at your provider.",
  imap_disabled: "IMAP access is off. Turn it on in your mailbox settings.",
  use_oauth: "Gmail and Outlook addresses connect differently; that's coming soon.",
  too_many_attempts: "Your provider is refusing sign-ins for now. Wait a few minutes.",
};

/** Email, step 2: connect with the (app) password. Zernio checks before storing anything. */
export async function connectEmailAction(
  _prev: OwnKeyState,
  formData: FormData,
): Promise<OwnKeyState> {
  const tenant = await getTenantFor("accounts.manage");
  if (!tenant) return { error: NOT_ALLOWED };
  const parsed = parseEmail(formData);
  if (!parsed.ok) return { error: parsed.error };
  const password = String(formData.get("password") ?? "");
  if (!password) return { error: "Add the password.", field: "password" };
  const name = String(formData.get("name") ?? "")
    .trim()
    .slice(0, 100);
  const db = getServiceClient();
  try {
    const { profileId } = await ensureZernioProfile({ db, social: getSocialProvider }, tenant.id);
    const social = getSocialProvider();
    await social.connectEmail({
      profileId,
      email: parsed.email,
      password,
      ...(name ? { name } : {}),
      signal: AbortSignal.timeout(60_000),
    });
    // T81b: add the mailbox to the brand's accounts now (account.connected does it too), so its
    // mail is answered from the first message. Matched by address; otherwise the webhook adds it.
    const mailboxes = await social.listIntegrations({
      profileId,
      platforms: ["imap"],
      signal: AbortSignal.timeout(15_000),
    });
    const mailbox = mailboxes.find((m) => m.name.toLowerCase() === parsed.email);
    if (mailbox) {
      const added = await handleAccountConnected(db, {
        tenantId: tenant.id,
        zernioAccountId: mailbox.id,
        platform: "imap",
        username: parsed.email,
      });
      if (added.outcome === "foreign") {
        return { error: "This mailbox is connected to another business in Waggle." };
      }
    }
  } catch (error) {
    if (error instanceof SocialProviderError && error.details.status === 422) {
      return {
        error:
          EMAIL_CODES[error.details.code ?? ""] ?? "Your provider didn't accept these details.",
        field: "password",
        info: error.details.info,
      };
    }
    if (status(error) === 402) return { error: PLAN_LIMIT };
    Sentry.captureException(error, { extra: { tenantId: tenant.id, step: "connectEmail" } });
    return { error: "The mailbox couldn't be connected right now. Try again in a moment." };
  }
  await writeAudit(db, {
    tenantId: tenant.id,
    action: "integration_connected",
    actor: tenant.userId,
    details: { platform: "imap", how: "own_keys" },
  });
  revalidatePath("/settings");
  return { done: `${parsed.email} is connected.` };
}

/** LINE Official Account with its channel keys (T80b). */
export async function connectLineAction(
  _prev: OwnKeyState,
  formData: FormData,
): Promise<OwnKeyState> {
  const tenant = await getTenantFor("accounts.manage");
  if (!tenant) return { error: NOT_ALLOWED };
  const parsed = parseLineKeys(formData);
  if (!parsed.ok) return { error: parsed.error, field: parsed.field };
  const db = getServiceClient();
  let result: { accountId: string; name: string; webhookReady: boolean };
  try {
    const { profileId } = await ensureZernioProfile({ db, social: getSocialProvider }, tenant.id);
    result = await getSocialProvider().connectLine({
      profileId,
      ...parsed.value,
      signal: AbortSignal.timeout(45_000),
    });
    const added = await handleAccountConnected(db, {
      tenantId: tenant.id,
      zernioAccountId: result.accountId,
      platform: "line",
      username: result.name,
    });
    if (added.outcome === "foreign") {
      return { error: "This LINE account is connected to another business in Waggle." };
    }
  } catch (error) {
    const s = status(error);
    if (s === 400 || s === 403) {
      return { error: "LINE didn't accept these keys. Copy the Channel ID and secret again." };
    }
    if (s === 402) return { error: PLAN_LIMIT };
    Sentry.captureException(error, { extra: { tenantId: tenant.id, step: "connectLine" } });
    return { error: "LINE couldn't be connected right now. Try again in a moment." };
  }
  await writeAudit(db, {
    tenantId: tenant.id,
    action: "integration_connected",
    actor: tenant.userId,
    details: {
      platform: "line",
      zernioAccountId: result.accountId,
      webhookReady: result.webhookReady,
    },
  });
  revalidatePath("/settings");
  return {
    done: result.webhookReady
      ? `${result.name} is connected. In LINE Official Account Manager, Settings, Response settings: turn on Webhooks, and turn off Auto-response and Greeting messages.`
      : `${result.name} is connected, but LINE didn't take the automatic setup. Contact us and we'll finish it with you.`,
  };
}

/**
 * Gmail or Outlook sign-in (T81c): mailbox and calendar areas. The account arrives with
 * account.connected; Settings shows "connecting" until then.
 */
export async function connectMailAction(formData: FormData): Promise<void> {
  const platform = formData.get("platform");
  if (platform !== "google" && platform !== "microsoft") redirect("/settings?section=accounts");
  const tenant = await getTenantFor("accounts.manage");
  if (!tenant) redirect("/settings?section=accounts&connect_error=not_allowed");
  const db = getServiceClient();
  let authUrl: string;
  try {
    const { profileId } = await ensureZernioProfile({ db, social: getSocialProvider }, tenant.id);
    ({ authUrl } = await getSocialProvider().getMailConnectUrl({
      platform,
      profileId,
      redirectUrl: `${process.env.APP_URL}/settings?section=accounts&connecting=${platform}`,
      scopes: ["email", "calendar"],
      signal: AbortSignal.timeout(20_000),
    }));
    await writeAudit(db, {
      tenantId: tenant.id,
      action: "account_connect_started",
      actor: tenant.userId,
      details: { platform, scopes: ["email", "calendar"] },
    });
  } catch (error) {
    Sentry.captureException(error, { extra: { tenantId: tenant.id, platform } });
    redirect(
      `/settings?section=accounts&connect_error=${status(error) === 402 ? "plan_limit" : "unavailable"}&platform=${platform}`,
    );
  }
  redirect(authUrl);
}
