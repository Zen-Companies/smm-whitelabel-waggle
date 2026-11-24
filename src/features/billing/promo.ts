// Black Friday and "give a month, get a month" (Jason, 23 November 2026). Pure.
//
// The free month is a 30-day trial on the organization's first plan checkout (instead of the
// usual 7 days), with the card taken up front (Stripe Checkout). Nothing to type: it's applied
// when the checkout is made.
// A trial (not a coupon) so the founding price still applies from the first paid month.

import { activeSeasonal, promotionOfKind, PROMOTIONS, within, type Promotion } from "./promotions";

// The dates and days come from the promotions list: our team edits it on Staff → Promotions
// (table `promotions`, loaded by promotions-store.ts); the code's list (promotions.ts) is the
// fallback and these defaults. Every function takes the list, so callers pass what they loaded.
const SEASONAL = promotionOfKind("seasonal");
const REFERRAL_PROMO = promotionOfKind("referral");

/** A banked referral month, in trial days. */
export const MONTH_DAYS = 30;

export const FREE_MONTH_DAYS = SEASONAL.trialDays;

/** Stripe's limit on a subscription trial. */
export const MAX_TRIAL_DAYS = 730;

/** The code's default (Staff → Promotions may move it). */
export const BLACK_FRIDAY = {
  /** Monday 30 November 2026, 11:59 pm Eastern (= 1 December 04:59:59 UTC). */
  endsAt: SEASONAL.endsAt ?? new Date(8.64e15),
} as const;

/** The code's default (Staff → Promotions may move it). */
export const REFERRAL = {
  /** When new sign-ups stop earning the free month. null = the program keeps running. */
  endsAt: (REFERRAL_PROMO.enabled ? REFERRAL_PROMO.endsAt : new Date(0)) as Date | null,
} as const;

/** Pure: whether a seasonal free month (Black Friday) is on at `now`. */
export function blackFridayOn(now: Date, list: readonly Promotion[] = PROMOTIONS): boolean {
  return activeSeasonal(now, list) !== null;
}

/** Pure: whether the referral program still gives the free month at `now`. */
export function referralsOn(now: Date, endsAt: Date | null = REFERRAL.endsAt): boolean {
  return endsAt === null || now.getTime() <= endsAt.getTime();
}

export type FreeMonthReason = "black_friday" | "referral";

/**
 * Pure: the trial days a first plan checkout gets, and why. The free month (a seasonal promotion
 * or a friend's link, never both) replaces the usual 7-day trial (`baseDays`) with the
 * promotion's trial days; each banked referral reward adds its months. Capped at Stripe's 730 days.
 * `referralEndsAt` overrides the referral program's end (tests).
 */
export function firstCheckoutTrial(input: {
  now: Date;
  referred: boolean;
  bankedMonths: number;
  baseDays?: number;
  referralEndsAt?: Date | null;
  promotions?: readonly Promotion[];
}): { days: number; reasons: FreeMonthReason[] } {
  const list = input.promotions ?? PROMOTIONS;
  const season = activeSeasonal(input.now, list);
  const referral = list.find((p) => p.kind === "referral") ?? null;
  const reasons: FreeMonthReason[] = [];
  let start = Math.max(0, input.baseDays ?? 0);
  if (season) {
    reasons.push("black_friday");
    start = season.trialDays;
  } else if (
    input.referred &&
    referral?.enabled &&
    within(
      input.now,
      referral.startsAt,
      input.referralEndsAt !== undefined ? input.referralEndsAt : referral.endsAt,
    )
  ) {
    reasons.push("referral");
    start = referral.trialDays;
  }
  const perBanked = (referral?.rewardMonths ?? 1) * MONTH_DAYS;
  const banked = Math.max(0, Math.floor(input.bankedMonths)) * perBanked;
  return { days: Math.min(MAX_TRIAL_DAYS, start + banked), reasons };
}
