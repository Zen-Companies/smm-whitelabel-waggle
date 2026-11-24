// Black Friday and "give a month, get a month" (Jason, 23 November 2026). Pure.
//
// The free month is a 30-day trial on the organization's first plan checkout (instead of the
// usual 7 days), with the card taken up front (Stripe Checkout). Nothing to type: it's applied
// when the checkout is made.
// A trial (not a coupon) so the founding price still applies from the first paid month: the
// founding coupon is lengthened by the trial's months at checkout (founding.ts), since Stripe counts
// a repeating coupon's months from when it is applied.

import {
  activeSeasonal,
  promotionOfKind,
  PROMOTIONS,
  runningReferral,
  type Promotion,
} from "./promotions";

// The dates and days come from the promotions list: our team edits it on Staff → Promotions
// (table `promotions`, loaded by promotions-store.ts); the code's list (promotions.ts) is the
// fallback and these defaults. Every function takes the list, so callers pass what they loaded.
const SEASONAL = promotionOfKind("seasonal");

/** A banked referral month, in trial days, when no referral program is on the list. */
export const MONTH_DAYS = 30;

export const FREE_MONTH_DAYS = SEASONAL.trialDays;

/** Stripe's limit on a subscription trial. */
export const MAX_TRIAL_DAYS = 730;

/** The code's default (Staff → Promotions may move it). */
export const BLACK_FRIDAY = {
  /** Tuesday 1 December 2026, 11:59 pm Eastern (= 2 December 04:59:59 UTC). */
  endsAt: SEASONAL.endsAt ?? new Date(8.64e15),
} as const;

/** Pure: whether a seasonal free month (Black Friday) is on at `now`. */
export function blackFridayOn(now: Date, list: readonly Promotion[] = PROMOTIONS): boolean {
  return activeSeasonal(now, list) !== null;
}

export type FreeMonthReason = "black_friday" | "referral";

/**
 * Pure: what one banked referral reward is worth in trial days: the referral program's month
 * (its trial days) times its reward months. The program running now, else any referral program on
 * the list (a banked month stays owed after the program ends), else 30 days.
 */
export function bankedRewardDays(now: Date, list: readonly Promotion[] = PROMOTIONS): number {
  const p = runningReferral(now, list) ?? list.find((x) => x.kind === "referral") ?? null;
  if (!p) return MONTH_DAYS;
  return Math.max(0, p.rewardMonths) * p.trialDays;
}

/**
 * Pure: the trial days a first plan checkout gets, and why. The free month (a seasonal promotion
 * or a friend's link, never both) replaces the usual 7-day trial (`baseDays`) with the
 * promotion's trial days, never shortening it; each banked referral reward adds its days.
 * Capped at Stripe's 730 days.
 * A friend keeps the month when the referral program ran when they signed up (`referredAt`),
 * even if it has ended since.
 */
export function firstCheckoutTrial(input: {
  now: Date;
  referred: boolean;
  /** When the friend signed up through the link (the referral row's created_at). */
  referredAt?: Date | null;
  bankedMonths: number;
  baseDays?: number;
  promotions?: readonly Promotion[];
}): { days: number; reasons: FreeMonthReason[] } {
  const list = input.promotions ?? PROMOTIONS;
  const season = activeSeasonal(input.now, list);
  const reasons: FreeMonthReason[] = [];
  const base = Math.max(0, input.baseDays ?? 0);
  let start = base;
  if (season) {
    reasons.push("black_friday");
    start = Math.max(base, season.trialDays);
  } else if (input.referred) {
    const referral = runningReferral(input.referredAt ?? input.now, list);
    if (referral) {
      reasons.push("referral");
      start = Math.max(base, referral.trialDays);
    }
  }
  const banked = Math.max(0, Math.floor(input.bankedMonths)) * bankedRewardDays(input.now, list);
  return { days: Math.min(MAX_TRIAL_DAYS, start + banked), reasons };
}
