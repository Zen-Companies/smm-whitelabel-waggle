"use server";

import * as Sentry from "@sentry/nextjs";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getTenantFor, NOT_ALLOWED } from "@/features/tenants";
import { writeAudit } from "@/lib/audit";
import { getSocialProvider } from "@/lib/social";
import { SocialProviderError, type ImessageNumber, type RcsAgentView } from "@/lib/social/types";
import { getServiceClient } from "@/lib/supabase/service";
import { messagingOn } from "./flags";
import { contactOf, holdsNumber, parseOrder } from "./imessage";
import { launchDue, parseLaunch, parseTestPhone } from "./launch";
import { canFix, checkImage, isClosed, parseRcsRequest } from "./rcs";

export type RcsState = {
  error?: string;
  field?: string;
  done?: string;
  /** What was typed, so a refused form refills (files can't be). */
  values?: Record<string, string>;
};

/** Repeated fields (checkboxes) come back comma-joined. */
const typed = (f: FormData): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const [k, v] of f.entries()) {
    if (typeof v !== "string" || k === "requestKey" || k === "agentId") continue;
    out[k] = k in out ? `${out[k]},${v.slice(0, 500)}` : v.slice(0, 500);
  }
  return out;
};

const SETTINGS = "/settings";
const IMAGE_ERROR = "Use a PNG, JPEG or WebP image under 2.5 MB.";

/** Owner/admin, with Messaging switched on for the brand by staff. */
async function messagingTenant() {
  const tenant = await getTenantFor("brand.settings");
  if (!tenant?.zernioProfileId) return null;
  return (await messagingOn(getServiceClient(), tenant.id)) ? tenant : null;
}

function providerError(error: unknown, tenantId: string, step: string): RcsState {
  const s = error instanceof SocialProviderError ? error.details.status : undefined;
  if (s === 400) return { error: "A detail wasn't accepted. Check the form and try again." };
  if (s === 402 || s === 403 || s === 422) {
    return { error: "Branded texts can't be requested for this brand yet. Contact support." };
  }
  if (s === 409) return { error: "This request can't be changed any more. Reload the page." };
  Sentry.captureException(error, { extra: { tenantId, step } });
  return { error: "It couldn't be sent right now. Reload before trying again." };
}

/** Uploads a new logo and banner when given; the fix form may keep the filed ones. */
async function images(f: FormData, filed: Record<string, unknown> | null) {
  const logo = checkImage(f.get("logo"));
  const banner = checkImage(f.get("banner"));
  if (logo === "bad") return { error: IMAGE_ERROR, field: "logo" } as const;
  if (banner === "bad") return { error: IMAGE_ERROR, field: "banner" } as const;
  const keptLogo = typeof filed?.logoUrl === "string" ? filed.logoUrl : null;
  const keptHero = typeof filed?.heroUrl === "string" ? filed.heroUrl : null;
  if (!logo && !keptLogo) return { error: "Add your logo.", field: "logo" } as const;
  if (!banner && !keptHero) return { error: "Add a banner image.", field: "banner" } as const;
  const social = getSocialProvider();
  const [logoUrl, heroUrl] = await Promise.all([
    logo
      ? social.uploadRcsAsset({ file: logo, kind: "logo", signal: AbortSignal.timeout(30_000) })
      : { url: keptLogo as string },
    banner
      ? social.uploadRcsAsset({ file: banner, kind: "banner", signal: AbortSignal.timeout(30_000) })
      : { url: keptHero as string },
  ]);
  return { logoUrl: logoUrl.url, heroUrl: heroUrl.url } as const;
}

async function brandAgents(profileId: string): Promise<RcsAgentView[]> {
  return getSocialProvider().listRcsAgents({ profileId, signal: AbortSignal.timeout(15_000) });
}

/** Request branded texts (T83a): nothing is filed or billed until the partner's review. */
export async function requestRcsAction(_prev: RcsState, f: FormData): Promise<RcsState> {
  const tenant = await messagingTenant();
  if (!tenant?.zernioProfileId) return { error: NOT_ALLOWED };
  const key = z.uuid().safeParse(f.get("requestKey"));
  if (!key.success) return { error: "Something went wrong. Reload the page." };
  const parsed = parseRcsRequest(f);
  if (!parsed.ok) return { error: parsed.error, field: parsed.field, values: typed(f) };
  try {
    if ((await brandAgents(tenant.zernioProfileId)).some((a) => !isClosed(a))) {
      return { error: "This brand already has a request. Reload the page." };
    }
    const pics = await images(f, null);
    if ("error" in pics) return { ...pics, values: typed(f) };
    const agent = await getSocialProvider().requestRcsAgent({
      body: {
        profileId: tenant.zernioProfileId,
        brand: parsed.value.brand,
        displayName: parsed.value.displayName,
        useCase: parsed.value.useCase,
        profile: { ...parsed.value.profile, ...pics },
      },
      idempotencyKey: key.data,
      signal: AbortSignal.timeout(45_000),
    });
    await writeAudit(getServiceClient(), {
      tenantId: tenant.id,
      action: "rcs_requested",
      actor: tenant.userId,
      // Ids only: no company details in the audit.
      details: { agentId: agent.id, country: String(f.get("country")) },
    });
  } catch (error) {
    return { ...providerError(error, tenant.id, "requestRcs"), values: typed(f) };
  }
  revalidatePath(SETTINGS);
  return { done: "Request sent. We'll show each step here." };
}

/** Fix the request after changes were asked for; it goes back to review. */
export async function fixRcsAction(_prev: RcsState, f: FormData): Promise<RcsState> {
  const tenant = await messagingTenant();
  if (!tenant?.zernioProfileId) return { error: NOT_ALLOWED };
  const parsed = parseRcsRequest(f);
  if (!parsed.ok) return { error: parsed.error, field: parsed.field, values: typed(f) };
  const agentId = String(f.get("agentId") ?? "");
  try {
    const agent = (await brandAgents(tenant.zernioProfileId)).find((a) => a.id === agentId);
    if (!agent || !canFix(agent)) {
      return { error: "This request can't be changed any more. Reload the page." };
    }
    const pics = await images(f, agent.filed.profile);
    if ("error" in pics) return { ...pics, values: typed(f) };
    await getSocialProvider().updateRcsAgent({
      agentId,
      body: {
        brand: parsed.value.brand,
        displayName: parsed.value.displayName,
        useCase: parsed.value.useCase,
        profile: { ...parsed.value.profile, ...pics },
      },
      signal: AbortSignal.timeout(45_000),
    });
    await writeAudit(getServiceClient(), {
      tenantId: tenant.id,
      action: "rcs_request_fixed",
      actor: tenant.userId,
      details: { agentId },
    });
  } catch (error) {
    return { ...providerError(error, tenant.id, "fixRcs"), values: typed(f) };
  }
  revalidatePath(SETTINGS);
  return { done: "Sent back for review." };
}

/** The brand's agent by id, or null: agent ids aren't brand-scoped upstream. */
async function ownAgent(profileId: string, agentId: string) {
  return (await brandAgents(profileId)).find((a) => a.id === agentId) ?? null;
}

/** US testing (T83b): invite a phone; it must accept in its messaging app. */
export async function addTestPhoneAction(_prev: RcsState, f: FormData): Promise<RcsState> {
  const tenant = await messagingTenant();
  if (!tenant?.zernioProfileId) return { error: NOT_ALLOWED };
  const phone = parseTestPhone(String(f.get("phoneNumber") ?? ""));
  if (!phone) return { error: "Add the phone with the country code, like +1 415 555 0188." };
  const agentId = String(f.get("agentId") ?? "");
  try {
    const agent = await ownAgent(tenant.zernioProfileId, agentId);
    if (!agent || agent.status !== "testing") {
      return { error: "Test phones can be added while testing. Reload the page." };
    }
    if (agent.testDevices.some((d) => d.phoneNumber === phone)) {
      return { error: "That phone is already invited." };
    }
    await getSocialProvider().addRcsTestDevice({
      agentId,
      phoneNumber: phone,
      signal: AbortSignal.timeout(20_000),
    });
    await writeAudit(getServiceClient(), {
      tenantId: tenant.id,
      action: "rcs_test_phone_added",
      actor: tenant.userId,
      details: { agentId },
    });
  } catch (error) {
    const s = error instanceof SocialProviderError ? error.details.status : undefined;
    if (s === 400 || s === 422) {
      return {
        error: "That phone can't be a test phone. T-Mobile and AT&T numbers aren't allowed.",
      };
    }
    return providerError(error, tenant.id, "addTestPhone");
  }
  revalidatePath(SETTINGS);
  return { done: "Invite sent. Accept it in the phone's messaging app." };
}

export async function removeTestPhoneAction(_prev: RcsState, f: FormData): Promise<RcsState> {
  const tenant = await messagingTenant();
  if (!tenant?.zernioProfileId) return { error: NOT_ALLOWED };
  const agentId = String(f.get("agentId") ?? "");
  const deviceId = String(f.get("deviceId") ?? "");
  try {
    const agent = await ownAgent(tenant.zernioProfileId, agentId);
    if (!agent?.testDevices.some((d) => d.id === deviceId)) {
      return { error: "Something went wrong. Reload the page." };
    }
    await getSocialProvider().removeRcsTestDevice({
      agentId,
      testDeviceId: deviceId,
      signal: AbortSignal.timeout(20_000),
    });
    await writeAudit(getServiceClient(), {
      tenantId: tenant.id,
      action: "rcs_test_phone_removed",
      actor: tenant.userId,
      details: { agentId },
    });
  } catch (error) {
    return providerError(error, tenant.id, "removeTestPhone");
  }
  revalidatePath(SETTINGS);
  return { done: "Removed." };
}

/** The launch details for the carriers' review (T83b). */
export async function sendLaunchAction(_prev: RcsState, f: FormData): Promise<RcsState> {
  const tenant = await messagingTenant();
  if (!tenant?.zernioProfileId) return { error: NOT_ALLOWED };
  const agentId = String(f.get("agentId") ?? "");
  const shot = checkImage(f.get("screenshot"));
  if (shot === "bad") return { error: IMAGE_ERROR, field: "screenshot", values: typed(f) };
  try {
    const agent = await ownAgent(tenant.zernioProfileId, agentId);
    if (!agent || !launchDue(agent)) {
      return { error: "The launch details can't be sent right now. Reload the page." };
    }
    const us = agent.country === "US";
    // Check the form before uploading anything; the placeholder only stands in for the upload.
    const dry = parseLaunch(f, { us, screenshotUrl: shot ? "https://pending.invalid/x" : null });
    if (!dry.ok) return { error: dry.error, field: dry.field, values: typed(f) };
    let screenshotUrl: string | null = null;
    if (dry.needsScreenshot && shot) {
      screenshotUrl = (
        await getSocialProvider().uploadMedia({
          filename: `opt-in-${agentId}.${shot.type.split("/")[1]}`,
          contentType: shot.type,
          bytes: new Uint8Array(await shot.arrayBuffer()),
          signal: AbortSignal.timeout(30_000),
        })
      ).publicUrl;
    }
    const parsed = parseLaunch(f, { us, screenshotUrl });
    if (!parsed.ok) return { error: parsed.error, field: parsed.field, values: typed(f) };
    await getSocialProvider().requestRcsLaunch({
      agentId,
      body: parsed.body,
      signal: AbortSignal.timeout(45_000),
    });
    await writeAudit(getServiceClient(), {
      tenantId: tenant.id,
      action: "rcs_launch_sent",
      actor: tenant.userId,
      details: { agentId },
    });
  } catch (error) {
    return { ...providerError(error, tenant.id, "sendLaunch"), values: typed(f) };
  }
  revalidatePath(SETTINGS);
  return { done: "Launch details sent for review." };
}

// --- iMessage (T83c) --------------------------------------------------------------------------

export type NumbersState = { error?: string; region?: "US" | "GB"; numbers?: ImessageNumber[] };

/** Numbers that turn on the moment they're ordered (the pool can be empty). */
export async function imessageNumbersAction(
  _prev: NumbersState,
  f: FormData,
): Promise<NumbersState> {
  const tenant = await messagingTenant();
  if (!tenant) return { error: NOT_ALLOWED };
  const region = f.get("region") === "GB" ? "GB" : "US";
  try {
    const numbers = await getSocialProvider().listImessageNumbers({
      region,
      signal: AbortSignal.timeout(15_000),
    });
    return { region, numbers: numbers.slice(0, 20) };
  } catch (error) {
    Sentry.captureException(error, { extra: { tenantId: tenant.id, step: "imessageNumbers" } });
    return { error: "Numbers couldn't be loaded right now. Try again in a moment." };
  }
}

/** Order the brand's iMessage number ($200 a month, idempotent on purchaseIntentId). */
export async function orderImessageAction(_prev: RcsState, f: FormData): Promise<RcsState> {
  const tenant = await messagingTenant();
  if (!tenant?.zernioProfileId) return { error: NOT_ALLOWED };
  const intent = z.uuid().safeParse(f.get("purchaseIntentId"));
  if (!intent.success) return { error: "Something went wrong. Reload the page." };
  const parsed = parseOrder(f);
  if (!parsed.ok) return { error: parsed.error, field: parsed.field };
  const social = getSocialProvider();
  try {
    const senders = await social.listImessageSenders({
      profileId: tenant.zernioProfileId,
      signal: AbortSignal.timeout(15_000),
    });
    if (holdsNumber(senders)) return { error: "This brand already has an iMessage number." };
    const result = await social.orderImessageSender({
      profileId: tenant.zernioProfileId,
      region: parsed.value.region,
      availableNumberId: parsed.value.availableNumberId,
      zipCode: parsed.value.zipCode,
      displayName: parsed.value.cardName,
      contact: contactOf(parsed.value.cardName),
      purchaseIntentId: intent.data,
      signal: AbortSignal.timeout(45_000),
    });
    if (result.kind === "billing") {
      Sentry.captureMessage("imessage order refused: team billing not set up", {
        extra: { tenantId: tenant.id },
      });
      return { error: "iMessage can't be ordered for this brand yet. Contact support." };
    }
    if (result.kind === "refused") {
      return { error: "That number couldn't be ordered. Nothing was charged. Try another." };
    }
    await writeAudit(getServiceClient(), {
      tenantId: tenant.id,
      action: "imessage_ordered",
      actor: tenant.userId,
      details: {
        senderId: result.id,
        region: parsed.value.region,
        instant: !!parsed.value.availableNumberId,
      },
    });
  } catch (error) {
    Sentry.captureException(error, { extra: { tenantId: tenant.id, step: "orderImessage" } });
    // Retrying with the same purchaseIntentId returns this order rather than a second number.
    return { error: "We couldn't confirm the order. Reload the page before trying again." };
  }
  revalidatePath(SETTINGS);
  return { done: "Ordered. It turns on within minutes to a few hours." };
}

async function ownSender(profileId: string, senderId: string) {
  const senders = await getSocialProvider().listImessageSenders({
    profileId,
    signal: AbortSignal.timeout(15_000),
  });
  return senders.find((s) => s.id === senderId) ?? null;
}

/** The name on the number's contact card. */
export async function renameImessageAction(_prev: RcsState, f: FormData): Promise<RcsState> {
  const tenant = await messagingTenant();
  if (!tenant?.zernioProfileId) return { error: NOT_ALLOWED };
  const name = String(f.get("cardName") ?? "").trim();
  if (name.length < 2 || name.length > 60) return { error: "Add a name, up to 60 characters." };
  const senderId = String(f.get("senderId") ?? "");
  try {
    const sender = await ownSender(tenant.zernioProfileId, senderId);
    if (!sender || sender.status === "failed") {
      return { error: "Something went wrong. Reload the page." };
    }
    await getSocialProvider().updateImessageSender({
      senderId,
      displayName: name,
      contact: contactOf(name),
      signal: AbortSignal.timeout(20_000),
    });
    await writeAudit(getServiceClient(), {
      tenantId: tenant.id,
      action: "imessage_renamed",
      actor: tenant.userId,
      details: { senderId },
    });
  } catch (error) {
    return providerError(error, tenant.id, "renameImessage");
  }
  revalidatePath(SETTINGS);
  return { done: "Saved." };
}

/** Cancel the number: it goes offline at once and the started month isn't refunded. */
export async function cancelImessageAction(_prev: RcsState, f: FormData): Promise<RcsState> {
  const tenant = await messagingTenant();
  if (!tenant?.zernioProfileId) return { error: NOT_ALLOWED };
  const senderId = String(f.get("senderId") ?? "");
  try {
    const sender = await ownSender(tenant.zernioProfileId, senderId);
    if (!sender) return { error: "Something went wrong. Reload the page." };
    await getSocialProvider().cancelImessageSender({
      senderId,
      signal: AbortSignal.timeout(20_000),
    });
    await writeAudit(getServiceClient(), {
      tenantId: tenant.id,
      action: "imessage_canceled",
      actor: tenant.userId,
      details: { senderId },
    });
  } catch (error) {
    return providerError(error, tenant.id, "cancelImessage");
  }
  revalidatePath(SETTINGS);
  return { done: "Canceled." };
}
