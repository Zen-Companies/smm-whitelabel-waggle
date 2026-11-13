"use server";

import * as Sentry from "@sentry/nextjs";
import { revalidatePath } from "next/cache";
import { ensureZernioProfile, getTenantFor, NOT_ALLOWED } from "@/features/tenants";
import { writeAudit } from "@/lib/audit";
import { getSocialProvider } from "@/lib/social";
import { SocialProviderError } from "@/lib/social/types";
import { getServiceClient } from "@/lib/supabase/service";
import { handleAccountConnected } from "./events";
import { isOwnKeyPlatform, OWN_KEY_PLATFORMS, parseSiteKeys, parseWhatsAppKeys } from "./own-keys";

// T80: connect with the owner's own keys. Keys go straight to Zernio, which checks them; Waggle
// never stores, logs or audits them (only the platform and the new account id).

export type OwnKeyState = { error?: string; field?: string; done?: string };

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
      platforms: OWN_KEY_PLATFORMS,
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
