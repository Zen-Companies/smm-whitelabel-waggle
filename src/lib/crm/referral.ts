// Walter's GHL referral campaign (24 Nov): the `referral_rewarded` event and the referral fields
// on `signed_up`. Pure, no I/O: billing decides when a month is applied, the sender sends.

import { CRM_MIN_GAP_MS } from "./catalog";

export type ReferralRole = "referrer" | "friend";

/** The free month's end as HighLevel shows it in an email: "December 30" (US Eastern day). */
export function readableDay(
  value: string | Date | null | undefined,
  timeZone = "America/New_York",
): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  const fmt = (tz: string) =>
    new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", timeZone: tz }).format(d);
  try {
    return fmt(timeZone);
  } catch {
    return fmt("UTC");
  }
}

/** Once per person per referral per side (the queue adds the user id). */
export function referralDedupeKey(referralId: string, role: ReferralRole): string {
  return `referral_rewarded:${referralId}:${role}`;
}

/**
 * The friend's month counts as applied when their first plan's trial starts with the free month
 * (`promo` is the checkout's reasons, e.g. "referral" or "black_friday": a friend during Black
 * Friday gets the one free month too). Banked months alone ("banked") are the referrer's own.
 */
export function friendMonthApplied(input: {
  referred: boolean;
  trialStarted: boolean;
  promo: string | null | undefined;
}): boolean {
  if (!input.referred || !input.trialStarted) return false;
  const reasons = (input.promo ?? "").split(",").map((s) => s.trim());
  return reasons.includes("referral") || reasons.includes("black_friday");
}

/**
 * The referrer's free month when it's a balance credit: it pays the next bill, so the free month
 * runs from the current period's end for `months` months. null when the period end is unknown.
 */
export function creditedMonthEnd(periodEnd: string | null | undefined, months = 1): Date | null {
  if (!periodEnd) return null;
  const d = new Date(periodEnd);
  if (Number.isNaN(d.getTime())) return null;
  const out = new Date(d);
  out.setUTCMonth(out.getUTCMonth() + Math.max(1, months));
  // 31 Jan + 1 month: Stripe bills on the last day of February, not 3 March.
  if (out.getUTCDate() !== d.getUTCDate()) out.setUTCDate(0);
  return out;
}

/**
 * The other side's event for the same referral, as the queue has it. Its time is when it was
 * sent, else when it's due (next_attempt_at), else when it was queued.
 */
export interface OtherSide {
  sentAt: string | null;
  nextAttemptAt: string | null;
  createdAt: string;
}

/**
 * Referrer and friend events for the same referral at least 30 s apart (Walter: his workflow
 * clears the trigger tag first). Returns when this side may go, or null for right away.
 */
export function referralSendAfter(others: readonly OtherSide[], now: Date): Date | null {
  let latest = -Infinity;
  for (const o of others) {
    const t = Date.parse(o.sentAt ?? o.nextAttemptAt ?? o.createdAt);
    if (!Number.isNaN(t)) latest = Math.max(latest, t);
  }
  const at = latest + CRM_MIN_GAP_MS;
  return Number.isFinite(at) && at > now.getTime() ? new Date(at) : null;
}

/** The referral fields `referral_rewarded` sends (plain HighLevel keys). */
export function referralRewardedFields(details: Record<string, unknown>): {
  waggle_referral_role: string;
  waggle_referral_with: string;
  waggle_referral_ends: string;
} {
  const s = (v: unknown) => (typeof v === "string" ? v : "");
  const role = s(details.role);
  return {
    waggle_referral_role: role === "referrer" || role === "friend" ? role : "",
    waggle_referral_with: s(details.with),
    waggle_referral_ends: readableDay(s(details.ends) || null),
  };
}

/**
 * Sign-up through a friend's link: the code and who sent them (the referrer's business name),
 * on the contact's `ref_code` and `referred_by`. Nothing when it wasn't a referral.
 */
export function signupReferralFields(
  referral: { code: string; referrerName: string | null } | null,
): Record<string, string> {
  if (!referral?.code) return {};
  return {
    ref_code: referral.code,
    ...(referral.referrerName?.trim() ? { referred_by: referral.referrerName.trim() } : {}),
  };
}
