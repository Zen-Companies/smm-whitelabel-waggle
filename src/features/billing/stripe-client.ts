import "server-only";
import Stripe from "stripe";

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

/** Where Stripe sends the owner back to. */
export function appUrl(path: string): string {
  const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${base}${path}`;
}
