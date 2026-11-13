"use server";

import * as Sentry from "@sentry/nextjs";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { currentStaffAccess } from "@/features/staff";
import { getTenantFor, NOT_ALLOWED } from "@/features/tenants";
import { writeAudit } from "@/lib/audit";
import { getSocialProvider } from "@/lib/social";
import { SocialProviderError, type PhoneNumberType } from "@/lib/social/types";
import { getServiceClient } from "@/lib/supabase/service";
import { phoneOn, setPhoneSwitch } from "./flags";
import { numberOptions, parsePurchase } from "./numbers";
import { defaultGreeting, parseVoiceForm } from "./voice";
import { parseRegistration } from "./registration";
import { handleAccountConnected } from "@/features/accounts";

export type PhoneState = { error?: string; done?: string };
export type SearchState = {
  error?: string;
  country?: string;
  numberType?: PhoneNumberType;
  numbers?: { phoneNumber: string; locality: string | null }[];
};

const SETTINGS = "/settings";

/** Owner/admin, with Phone switched on for the brand by staff. */
async function phoneTenant() {
  const tenant = await getTenantFor("brand.settings");
  if (!tenant?.zernioProfileId) return null;
  return (await phoneOn(getServiceClient(), tenant.id)) ? tenant : null;
}

/** Find numbers for sale (Get a business number). */
export async function searchNumbersAction(_prev: SearchState, f: FormData): Promise<SearchState> {
  const tenant = await phoneTenant();
  if (!tenant) return { error: NOT_ALLOWED };
  const social = getSocialProvider();
  try {
    const options = numberOptions(
      await social.listPhoneCountries({ signal: AbortSignal.timeout(15_000) }),
    );
    const option = options.find(
      (o) => o.country === f.get("country") && o.numberType === f.get("numberType"),
    );
    if (!option) return { error: "That kind of number isn't available." };
    const areaCode = String(f.get("areaCode") ?? "")
      .trim()
      .slice(0, 20);
    const numbers = await social.searchPhoneNumbers({
      country: option.country,
      numberType: option.numberType,
      ...(areaCode && option.numberType !== "toll_free" ? { areaCode } : {}),
      signal: AbortSignal.timeout(20_000),
    });
    if (!numbers.length) return { error: "No numbers there right now. Try another area code." };
    return { country: option.country, numberType: option.numberType, numbers };
  } catch (error) {
    Sentry.captureException(error, { extra: { tenantId: tenant.id, step: "searchNumbers" } });
    return { error: "Numbers couldn't be loaded right now. Try again in a moment." };
  }
}

/**
 * Buy the chosen number (confirmed in place). One per brand; never WhatsApp. The purchase key
 * makes a double submit return the same number, never a second one.
 */
export async function buyNumberAction(_prev: PhoneState, f: FormData): Promise<PhoneState> {
  const tenant = await phoneTenant();
  if (!tenant?.zernioProfileId) return { error: NOT_ALLOWED };
  const social = getSocialProvider();
  try {
    const owned = await social.listOwnedNumbers({
      profileId: tenant.zernioProfileId,
      signal: AbortSignal.timeout(15_000),
    });
    if (owned.length) return { error: "This brand already has a number." };
    const options = numberOptions(
      await social.listPhoneCountries({ signal: AbortSignal.timeout(15_000) }),
    );
    const parsed = parsePurchase(f, options);
    if (!parsed.ok) return { error: parsed.error };
    const { option, phoneNumber, purchaseIntentId } = parsed.value;
    const result = await social.purchasePhoneNumber({
      profileId: tenant.zernioProfileId,
      country: option.country,
      numberType: option.numberType,
      phoneNumber,
      wantsSms: option.sms,
      purchaseIntentId,
      signal: AbortSignal.timeout(60_000),
    });
    if (result.kind === "needs_id")
      return { error: "This number needs an ID check, which isn't available yet." };
    if (result.kind === "needs_payment")
      return { error: "Numbers aren't available on this account yet. Contact us." };
    if (result.profileId && result.profileId !== tenant.zernioProfileId) {
      // One number per brand: Zernio moved it to another profile. Never expected; flag it.
      Sentry.captureMessage("phone: number landed on another profile", {
        extra: { tenantId: tenant.id, numberId: result.id },
      });
    }
    // T82b: calls on, with our own voicemail greeting (the partner's default isn't documented).
    // A number still being set up gets it when the owner opens Phone.
    await social
      .setVoice({
        numberId: result.id,
        settings: { voicemailGreeting: defaultGreeting(tenant.name) },
        signal: AbortSignal.timeout(20_000),
      })
      .catch((error) =>
        Sentry.captureException(error, { extra: { tenantId: tenant.id, step: "voiceOnPurchase" } }),
      );
    await writeAudit(getServiceClient(), {
      tenantId: tenant.id,
      action: "phone_number_bought",
      actor: tenant.userId,
      details: {
        numberId: result.id,
        country: option.country,
        numberType: option.numberType,
        monthlyCents: option.monthlyCents,
      },
    });
  } catch (error) {
    const code = error instanceof SocialProviderError ? error.details.code : undefined;
    if (code === "PHONE_NUMBER_UNAVAILABLE")
      return { error: "Someone just took that number. Search again." };
    if (code === "PURCHASE_VELOCITY")
      return { error: "A number was just bought. Wait a few minutes." };
    Sentry.captureException(error, { extra: { tenantId: tenant.id, step: "buyNumber" } });
    return { error: "The number couldn't be bought right now. Reload before trying again." };
  }
  revalidatePath(SETTINGS);
  return { done: "Your number is ready." };
}

/** Give the number back (confirmed in place, can't be undone). */
export async function releaseNumberAction(_prev: PhoneState, f: FormData): Promise<PhoneState> {
  const tenant = await phoneTenant();
  if (!tenant?.zernioProfileId) return { error: NOT_ALLOWED };
  const id = String(f.get("id") ?? "");
  const social = getSocialProvider();
  try {
    const owned = await social.listOwnedNumbers({
      profileId: tenant.zernioProfileId,
      signal: AbortSignal.timeout(15_000),
    });
    if (!owned.some((n) => n.id === id)) return { error: "Something went wrong. Reload the page." };
    await social.releasePhoneNumber({ id, signal: AbortSignal.timeout(30_000) });
  } catch (error) {
    Sentry.captureException(error, { extra: { tenantId: tenant.id, step: "releaseNumber" } });
    return { error: "It couldn't be released right now. Try again." };
  }
  await writeAudit(getServiceClient(), {
    tenantId: tenant.id,
    action: "phone_number_released",
    actor: tenant.userId,
    details: { numberId: id },
  });
  revalidatePath(SETTINGS);
  return { done: "The number was released." };
}

/** Staff: switch Phone on or off for a brand (Feature switches). */
export async function switchPhoneAction(_prev: PhoneState, f: FormData): Promise<PhoneState> {
  const access = await currentStaffAccess();
  if (!access.permissions.has("flags.manage")) return { error: "Not available." };
  const tenantId = z.uuid().safeParse(f.get("tenantId"));
  if (!tenantId.success) return { error: "That brand wasn't found." };
  const done = await setPhoneSwitch(
    getServiceClient(),
    access.userId,
    tenantId.data,
    f.get("on") === "true",
  );
  if (!done) return { error: "That brand wasn't found." };
  revalidatePath("/admin/switches");
  return { done: "Saved." };
}

export type VoiceState = { error?: string; field?: string; savedAt?: number };

/** Calls: which phone rings, the voicemail greeting and open hours (T82b). */
export async function saveVoiceAction(_prev: VoiceState, f: FormData): Promise<VoiceState> {
  const tenant = await phoneTenant();
  if (!tenant?.zernioProfileId) return { error: NOT_ALLOWED };
  const id = String(f.get("numberId") ?? "");
  const social = getSocialProvider();
  let parsed: ReturnType<typeof parseVoiceForm>;
  try {
    const owned = await social.listOwnedNumbers({
      profileId: tenant.zernioProfileId,
      signal: AbortSignal.timeout(15_000),
    });
    const number = owned.find((n) => n.id === id && n.status === "active");
    if (!number) return { error: "Something went wrong. Reload the page." };
    parsed = parseVoiceForm(f, number.phoneNumber);
    if (!parsed.ok) return { error: parsed.error, field: parsed.field };
    await social.setVoice({
      numberId: id,
      settings: parsed.value,
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    Sentry.captureException(error, { extra: { tenantId: tenant.id, step: "saveVoice" } });
    return { error: "Couldn't save right now. Try again." };
  }
  await writeAudit(getServiceClient(), {
    tenantId: tenant.id,
    action: "phone_calls_settings",
    actor: tenant.userId,
    // No phone number in the audit: whether one rings, and the hours.
    details: {
      numberId: id,
      answers:
        f.get("mode") === "ai"
          ? `ai:${String(f.get("aiService"))}`
          : String(f.get("mode") ?? "ring"),
      rings: !!parsed.value.forwardTo,
      hoursOn: parsed.value.businessHoursEnabled,
      days: parsed.value.businessHours.length,
    },
  });
  revalidatePath(SETTINGS);
  return { savedAt: Date.now() };
}

export type TextingState = { error?: string; field?: string; done?: string };

/** The brand's own active number, checked against its profile. */
async function ownNumber(profileId: string, id: string) {
  const owned = await getSocialProvider().listOwnedNumbers({
    profileId,
    signal: AbortSignal.timeout(15_000),
  });
  return owned.find((n) => n.id === id && n.status === "active") ?? null;
}

/**
 * Turn texting on (T82c): texts arrive in the inbox at once; a US number sends once carriers
 * approve the business. The texting account joins the brand's accounts right away.
 */
export async function enableTextingAction(_prev: TextingState, f: FormData): Promise<TextingState> {
  const tenant = await phoneTenant();
  if (!tenant?.zernioProfileId) return { error: NOT_ALLOWED };
  const id = String(f.get("numberId") ?? "");
  try {
    const number = await ownNumber(tenant.zernioProfileId, id);
    if (!number) return { error: "Something went wrong. Reload the page." };
    const sms = await getSocialProvider().enableSms({
      numberId: id,
      signal: AbortSignal.timeout(20_000),
    });
    if (sms.notCapable) return { error: "This number can't send or receive texts." };
    if (sms.notReady || !sms.accountId)
      return { error: "The number is still being set up. Try again in a few minutes." };
    const added = await handleAccountConnected(getServiceClient(), {
      tenantId: tenant.id,
      zernioAccountId: sms.accountId,
      platform: "sms",
      username: number.phoneNumber,
    });
    if (added.outcome === "foreign") return { error: "Something went wrong. Contact us." };
    await writeAudit(getServiceClient(), {
      tenantId: tenant.id,
      action: "texting_enabled",
      actor: tenant.userId,
      details: { numberId: id, needsRegistration: sms.needsRegistration },
    });
  } catch (error) {
    Sentry.captureException(error, { extra: { tenantId: tenant.id, step: "enableTexting" } });
    return { error: "Texting couldn't be turned on right now. Try again." };
  }
  revalidatePath(SETTINGS);
  return { done: "Texting is on." };
}

/** File the US registration from our own form (one attempt: not idempotent upstream). */
export async function registerTextingAction(
  _prev: TextingState,
  f: FormData,
): Promise<TextingState> {
  const tenant = await phoneTenant();
  if (!tenant?.zernioProfileId) return { error: NOT_ALLOWED };
  const id = String(f.get("numberId") ?? "");
  const social = getSocialProvider();
  try {
    const number = await ownNumber(tenant.zernioProfileId, id);
    if (!number) return { error: "Something went wrong. Reload the page." };
    const existing = await social.listSmsRegistrations({
      phoneNumber: number.phoneNumber,
      signal: AbortSignal.timeout(15_000),
    });
    if (existing.some((r) => r.status !== "deactivated" && r.status !== "rejected")) {
      return { error: "This number already has a registration in progress." };
    }
    const parsed = parseRegistration(f, number.phoneNumber);
    if (!parsed.ok) return { error: parsed.error, field: parsed.field };
    const reg = await social.startSmsRegistration({
      body: parsed.body,
      signal: AbortSignal.timeout(45_000),
    });
    await writeAudit(getServiceClient(), {
      tenantId: tenant.id,
      action: "texting_registration_sent",
      actor: tenant.userId,
      // No business details in the audit: ids and the kind only.
      details: { numberId: id, registrationId: reg.id, kind: parsed.kind },
    });
  } catch (error) {
    const s = error instanceof SocialProviderError ? error.details.status : undefined;
    if (s === 400 || s === 422) {
      return {
        error: "The carriers' registry didn't accept a detail. Check the form and try again.",
      };
    }
    Sentry.captureException(error, { extra: { tenantId: tenant.id, step: "registerTexting" } });
    return { error: "It couldn't be sent right now. Reload before trying again." };
  }
  revalidatePath(SETTINGS);
  return { done: "Sent to the carriers for review." };
}

/** Sole proprietors: the code texted to the owner's mobile, or a new code. */
export async function textingCodeAction(_prev: TextingState, f: FormData): Promise<TextingState> {
  const tenant = await phoneTenant();
  if (!tenant?.zernioProfileId) return { error: NOT_ALLOWED };
  const id = String(f.get("numberId") ?? "");
  const resend = f.get("op") === "resend";
  const code = String(f.get("code") ?? "").trim();
  if (!resend && !/^\d{4,8}$/.test(code))
    return { error: "Type the code from the text.", field: "code" };
  const social = getSocialProvider();
  try {
    const number = await ownNumber(tenant.zernioProfileId, id);
    if (!number) return { error: "Something went wrong. Reload the page." };
    const reg = (
      await social.listSmsRegistrations({
        phoneNumber: number.phoneNumber,
        signal: AbortSignal.timeout(15_000),
      })
    ).find((r) => r.awaitingOtp);
    if (!reg) return { error: "There's no code to confirm." };
    if (resend)
      await social.resendSmsRegistrationCode({ id: reg.id, signal: AbortSignal.timeout(15_000) });
    else
      await social.verifySmsRegistrationCode({
        id: reg.id,
        code,
        signal: AbortSignal.timeout(15_000),
      });
  } catch (error) {
    const s = error instanceof SocialProviderError ? error.details.status : undefined;
    if (s === 400)
      return { error: "That code didn't work. Check it, or send a new one.", field: "code" };
    if (s === 429) return { error: "Wait a minute before asking for another code." };
    Sentry.captureException(error, { extra: { tenantId: tenant.id, step: "textingCode" } });
    return { error: "Couldn't do that right now. Try again." };
  }
  revalidatePath(SETTINGS);
  return {
    done: resend ? "A new code is on its way." : "Confirmed. The carriers are reviewing it now.",
  };
}
