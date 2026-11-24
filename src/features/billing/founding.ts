import "server-only";
import type Stripe from "stripe";
import { FOUNDING_COUPON, isFoundingCoupon } from "./catalog";
import { FOUNDING } from "./plans";

type CouponReader = Pick<Stripe, "coupons">;

// A repeating coupon counts its months from when it's applied, trial included (Stripe, "Coupon
// duration": "applies to all invoices in the N-month period starting when the coupon is first
// applied", docs.stripe.com/billing/subscriptions/coupons). The founding price is 6 PAID months,
// so a checkout with a long trial (the free month, banked months) gets a copy of the founding
// coupon that lasts longer by the trial's whole months. The base coupon stays the one for a
// short trial, and the 50 spots count every copy.

/** Pure: months the founding coupon must last so 6 paid months follow a `trialDays` trial. */
export function foundingCouponMonths(trialDays: number): number {
  // 28 days is the shortest month, so the 6th paid invoice always falls inside the window.
  return FOUNDING.months + Math.floor(Math.max(0, trialDays) / 28);
}

/** Pure: the founding coupon's id for a duration (the base one for the usual 6 months). */
export function foundingCouponId(months: number): string {
  return months <= FOUNDING.months ? FOUNDING_COUPON : `${FOUNDING_COUPON}_${months}m`;
}

const isMissing = (e: unknown) =>
  !!e && typeof e === "object" && (e as { code?: string }).code === "resource_missing";

/**
 * Checkout: the founding coupon for a trial of `trialDays`, made from the base coupon (same amount
 * off, same products) the first time a longer one is needed.
 */
export async function ensureFoundingCoupon(
  stripe: CouponReader,
  trialDays: number,
): Promise<string> {
  const months = foundingCouponMonths(trialDays);
  const id = foundingCouponId(months);
  if (id === FOUNDING_COUPON) return id;
  try {
    return (await stripe.coupons.retrieve(id)).id;
  } catch (e) {
    if (!isMissing(e)) throw e;
  }
  const base = await stripe.coupons.retrieve(FOUNDING_COUPON, { expand: ["applies_to"] });
  try {
    const made = await stripe.coupons.create({
      id,
      name: base.name ?? "Founding member",
      ...(base.amount_off
        ? { amount_off: base.amount_off, currency: base.currency ?? "usd" }
        : { percent_off: base.percent_off ?? 0 }),
      duration: "repeating",
      duration_in_months: months,
      ...(base.applies_to?.products.length
        ? { applies_to: { products: base.applies_to.products } }
        : {}),
      metadata: { waggle: "founding", trial_days: String(trialDays) },
    });
    return made.id;
  } catch (e) {
    // Another checkout made it a moment ago.
    return (await stripe.coupons.retrieve(id).catch(() => Promise.reject(e))).id;
  }
}

/** Founding spots taken: the base coupon's redemptions plus every longer copy's. */
export async function foundingRedeemed(
  stripe: CouponReader,
): Promise<{ valid: boolean; max: number; redeemed: number }> {
  const base = await stripe.coupons.retrieve(FOUNDING_COUPON);
  let redeemed = base.times_redeemed;
  for await (const c of stripe.coupons.list({ limit: 100 })) {
    if (c.id !== FOUNDING_COUPON && isFoundingCoupon(c.id)) redeemed += c.times_redeemed;
  }
  return { valid: base.valid, max: base.max_redemptions ?? FOUNDING.spots, redeemed };
}

async function readSpotsLeft(stripe: CouponReader): Promise<boolean> {
  const r = await foundingRedeemed(stripe);
  return r.valid && r.max > r.redeemed;
}

/** Whether the founding coupon still has spots (the first 50 businesses). False on any error. */
export async function foundingSpotsLeft(stripe: CouponReader): Promise<boolean> {
  try {
    return await readSpotsLeft(stripe);
  } catch {
    return false;
  }
}

/** How long the pages' founding answer is reused (checkout itself always asks Stripe). */
export const FOUNDING_CACHE_MS = 5 * 60_000;

let known: { value: boolean; at: number } | null = null;
let asking: Promise<boolean> | null = null;

/**
 * The same answer for pages (the plan banner and pop-ups on every dashboard render): asked of
 * Stripe at most every few minutes per server instance; on an error the last known answer stays
 * (false when there is none).
 */
export async function foundingSpotsLeftCached(
  stripe: CouponReader,
  now: number = Date.now(),
): Promise<boolean> {
  if (known && now - known.at < FOUNDING_CACHE_MS) return known.value;
  asking ??= readSpotsLeft(stripe)
    .then((value) => {
      known = { value, at: now };
      return value;
    })
    .catch(() => known?.value ?? false)
    .finally(() => {
      asking = null;
    });
  return asking;
}

/** Tests only: forget the cached answer. */
export function resetFoundingCache(): void {
  known = null;
  asking = null;
}
