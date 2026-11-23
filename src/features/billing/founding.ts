import "server-only";
import type Stripe from "stripe";
import { FOUNDING_COUPON } from "./catalog";
import { FOUNDING } from "./plans";

type CouponReader = Pick<Stripe, "coupons">;

async function readSpotsLeft(stripe: CouponReader): Promise<boolean> {
  const c = await stripe.coupons.retrieve(FOUNDING_COUPON);
  return c.valid && (c.max_redemptions ?? FOUNDING.spots) > c.times_redeemed;
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
