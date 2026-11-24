import "server-only";
import * as Sentry from "@sentry/nextjs";
import Stripe from "stripe";
import { planProductDescription, PRICE_KEYS } from "./catalog";
import { PAID_PLAN_IDS, type Plan, type PlanId } from "./plans";

// The one Stripe client (T86). Null without STRIPE_SECRET_KEY, so the app runs without billing.

let client: Stripe | null | undefined;

export function getStripe(): Stripe | null {
  if (client === undefined) {
    const key = process.env.STRIPE_SECRET_KEY;
    client = key ? new Stripe(key, { appInfo: { name: "Waggle" } }) : null;
  }
  return client;
}

const priceIds = new Map<string, string>();

/** A price id by its lookup key (made by `pnpm stripe:catalog`), cached per server. */
export async function priceId(stripe: Stripe, lookupKey: string): Promise<string> {
  const hit = priceIds.get(lookupKey);
  if (hit) return hit;
  const { data } = await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 });
  const id = data[0]?.id;
  if (!id) throw new Error(`billing: no Stripe price "${lookupKey}" (run pnpm stripe:catalog)`);
  priceIds.set(lookupKey, id);
  return id;
}

/**
 * Staff → Plans saved (QA, 25 Nov): each plan's Stripe product says what the plan now includes,
 * so Checkout's line under the plan ("about 300 AI replies a month") matches the app. Only a
 * changed description is written. Never throws: the plans are saved either way; a failure is
 * reported (ids only) and the next save tries again. Returns the products updated.
 */
export async function syncPlanProducts(
  stripe: Pick<Stripe, "prices" | "products">,
  plans: Record<PlanId, Plan>,
): Promise<number> {
  let updated = 0;
  for (const id of PAID_PLAN_IDS) {
    try {
      const { data } = await stripe.prices.list({
        lookup_keys: [PRICE_KEYS.plan(id, "month")],
        active: true,
        limit: 1,
        expand: ["data.product"],
      });
      const product = data[0]?.product;
      if (!product || typeof product === "string" || product.deleted) continue;
      const description = planProductDescription(plans[id]);
      if (product.description === description) continue;
      await stripe.products.update(product.id, { description });
      updated++;
    } catch (e) {
      Sentry.captureException(e, { extra: { plan: id } });
    }
  }
  return updated;
}

/** Where Stripe sends the owner back to. */
export function appUrl(path: string): string {
  const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${base}${path}`;
}
