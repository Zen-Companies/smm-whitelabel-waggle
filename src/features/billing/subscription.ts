// Reading a Stripe subscription into Waggle's org_billing row. Pure: the shapes below are the
// few fields used, so tests don't need Stripe.

import { FOUNDING_COUPON, type Interval } from "./catalog";
import { EXTRAS, isPlanId, type PlanId } from "./plans";

/** Pure: a Waggle lookup key's plan and interval, or null for anything else (extras, top-ups). */
export function parsePlanKey(
  key: string | null | undefined,
): { plan: PlanId; interval: Interval } | null {
  const m = /^waggle_([a-z]+)_(monthly|yearly)$/.exec(key ?? "");
  if (!m || !isPlanId(m[1])) return null;
  return { plan: m[1], interval: m[2] === "yearly" ? "year" : "month" };
}

/** Pure: whether a lookup key is the extra account price. */
export function isExtraAccountKey(key: string | null | undefined): boolean {
  return /^waggle_extra_account_(monthly|yearly)$/.test(key ?? "");
}

export interface SubscriptionLike {
  id: string;
  status: string;
  customer: string | { id: string };
  cancel_at_period_end: boolean;
  /** Newer API versions cancel by date (the portal sets this, not cancel_at_period_end). */
  cancel_at?: number | null;
  trial_end: number | null;
  metadata: Record<string, string>;
  discounts?: Array<
    | string
    | {
        coupon?: { id: string } | null;
        source?: { coupon?: string | { id: string } | null } | null;
      }
  >;
  items: {
    data: Array<{
      quantity?: number | null;
      current_period_end: number;
      price: { lookup_key: string | null };
    }>;
  };
}

export interface BillingRow {
  stripe_customer_id: string;
  stripe_subscription_id: string;
  plan: PlanId | null;
  billing_interval: Interval | null;
  status: string;
  trial_ends_at: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  extra_accounts: number;
  founding: boolean;
}

const iso = (s: number | null | undefined) => (s ? new Date(s * 1000).toISOString() : null);

function couponIds(sub: SubscriptionLike): string[] {
  return (sub.discounts ?? []).flatMap((d) => {
    if (typeof d === "string") return [];
    const c = d.source?.coupon ?? d.coupon;
    if (!c) return [];
    return [typeof c === "string" ? c : c.id];
  });
}

/** Pure: the org_billing fields a subscription sets. */
export function billingFromSubscription(sub: SubscriptionLike): BillingRow {
  const planItem = sub.items.data.find((i) => parsePlanKey(i.price.lookup_key));
  const parsed = parsePlanKey(planItem?.price.lookup_key);
  const extra = sub.items.data
    .filter((i) => isExtraAccountKey(i.price.lookup_key))
    .reduce((n, i) => n + (i.quantity ?? 1), 0);
  return {
    stripe_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
    stripe_subscription_id: sub.id,
    plan: parsed?.plan ?? null,
    billing_interval: parsed?.interval ?? null,
    status: sub.status,
    trial_ends_at: iso(sub.trial_end),
    current_period_end: iso(planItem?.current_period_end ?? sub.items.data[0]?.current_period_end),
    cancel_at_period_end: sub.cancel_at_period_end || !!sub.cancel_at,
    extra_accounts: extra,
    founding: sub.metadata.founding === "1" || couponIds(sub).includes(FOUNDING_COUPON),
  };
}

/** Statuses where the plan applies. Past due keeps it while Stripe retries the card. */
export const LIVE_STATUSES = ["trialing", "active", "past_due"] as const;

/** Pure: whether a stored status gives the organization its plan. */
export function planIsLive(status: string | null | undefined): boolean {
  return (LIVE_STATUSES as readonly string[]).includes(status ?? "");
}

/**
 * Pure: last month's unused top-up replies that carry into this month (they last one month).
 * Plan replies are used first, then top-ups.
 */
export function carriedReplies(lastMonth: {
  planReplies: number;
  topUpReplies: number;
  used: number;
}): number {
  const fromTopUps = Math.max(0, lastMonth.used - lastMonth.planReplies);
  return Math.max(0, lastMonth.topUpReplies - fromTopUps);
}

/** Pure: whether an automatic top-up may run now (opt-in, at most twice a month). */
export function autoTopUpAllowed(on: boolean, automaticThisMonth: number): boolean {
  return on && automaticThisMonth < EXTRAS.autoTopUp.maxPerMonth;
}
