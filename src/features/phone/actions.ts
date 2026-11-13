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
