// Black Friday and "give a month, get a month" (Jason, 23 November 2026). Pure.
//
// The free month is a 30-day trial on the organization's first plan checkout (instead of the
// usual 7 days), with the card taken up front (Stripe Checkout). Nothing to type: it's applied
// when the checkout is made.
// A trial (not a coupon) so the founding price still applies from the first paid month.

export const FREE_MONTH_DAYS = 30;

/** Stripe's limit on a subscription trial. */
export const MAX_TRIAL_DAYS = 730;

export const BLACK_FRIDAY = {
  /** Monday 30 November 2026, 11:59 pm Eastern (= 1 December 04:59:59 UTC). */
  endsAt: new Date("2026-12-01T04:59:59Z"),
  /** Shown on Your plan while it runs. */
  line: "Black Friday: your first month is free. Choose a plan by Monday, 30 November.",
} as const;

export const REFERRAL = {
  /**
   * When new sign-ups stop earning the free month. null = the program keeps running.
   * Jason's ads say "Plus a free month for every friend you bring"; set a date here to end it.
   */
  endsAt: null as Date | null,
} as const;

/** Pure: whether the Black Friday free month is on at `now`. */
export function blackFridayOn(now: Date): boolean {
  return now.getTime() <= BLACK_FRIDAY.endsAt.getTime();
}

/** Pure: whether the referral program still gives the free month at `now`. */
export function referralsOn(now: Date, endsAt: Date | null = REFERRAL.endsAt): boolean {
  return endsAt === null || now.getTime() <= endsAt.getTime();
}

export type FreeMonthReason = "black_friday" | "referral";

/**
 * Pure: the trial days a first plan checkout gets, and why. The free month (Black Friday or a
 * friend's link, never both) replaces the usual 7-day trial (`baseDays`); each banked referral
 * reward adds a month. Capped at Stripe's 730 days.
 */
export function firstCheckoutTrial(input: {
  now: Date;
  referred: boolean;
  bankedMonths: number;
  baseDays?: number;
  referralEndsAt?: Date | null;
}): { days: number; reasons: FreeMonthReason[] } {
  const reasons: FreeMonthReason[] = [];
  if (blackFridayOn(input.now)) reasons.push("black_friday");
  else if (input.referred && referralsOn(input.now, input.referralEndsAt ?? REFERRAL.endsAt)) {
    reasons.push("referral");
  }
  const start = reasons.length ? FREE_MONTH_DAYS : Math.max(0, input.baseDays ?? 0);
  const banked = Math.max(0, Math.floor(input.bankedMonths)) * FREE_MONTH_DAYS;
  return { days: Math.min(MAX_TRIAL_DAYS, start + banked), reasons };
}
