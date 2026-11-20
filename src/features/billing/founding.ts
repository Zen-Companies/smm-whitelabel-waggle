import "server-only";
import type Stripe from "stripe";
import { FOUNDING_COUPON } from "./catalog";
import { FOUNDING } from "./plans";

/** Whether the founding coupon still has spots (the first 50 businesses). False on any error. */
export async function foundingSpotsLeft(stripe: Stripe): Promise<boolean> {
  try {
    const c = await stripe.coupons.retrieve(FOUNDING_COUPON);
    return c.valid && (c.max_redemptions ?? FOUNDING.spots) > c.times_redeemed;
  } catch {
    return false;
  }
}
