/**
 * Creates Waggle's products, prices and the customer portal settings in
 * the Stripe account of STRIPE_SECRET_KEY, and prints every id. Safe to run again: it finds what
 * exists by lookup key / metadata and only adds what's missing (a changed amount gets a new
 * price that takes over the lookup key; Stripe prices can't change).
 *
 *   pnpm stripe:catalog            # refuses a live key
 *   pnpm stripe:catalog --live     # a live key, on purpose
 */
import Stripe from "stripe";
import { catalog, PRICE_KEYS } from "@/features/billing/catalog";

try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local: use the environment as is.
}

const key = process.env.STRIPE_SECRET_KEY;
if (!key) throw new Error("STRIPE_SECRET_KEY is not set.");
if (key.startsWith("sk_live_") && !process.argv.includes("--live")) {
  throw new Error("That's a live key. Run with --live if you mean it.");
}
const stripe = new Stripe(key);

async function findProduct(waggleKey: string): Promise<Stripe.Product | null> {
  for await (const p of stripe.products.list({ limit: 100 })) {
    if (p.metadata.waggle_key === waggleKey) return p;
  }
  return null;
}

async function main() {
  const out: Record<string, string> = {};
  for (const item of catalog()) {
    let product = await findProduct(item.key);
    if (!product) {
      product = await stripe.products.create({
        name: item.name,
        description: item.description,
        metadata: { waggle_key: item.key },
      });
      console.log(`+ product ${item.name}`);
    } else if (product.name !== item.name || product.description !== item.description) {
      product = await stripe.products.update(product.id, {
        name: item.name,
        description: item.description,
        active: true,
      });
    }
    out[`product ${item.key}`] = product.id;

    const existing = await stripe.prices.list({
      lookup_keys: item.prices.map((p) => p.lookupKey),
      limit: 100,
    });
    for (const want of item.prices) {
      const have = existing.data.find((p) => p.lookup_key === want.lookupKey);
      const same =
        have &&
        have.active &&
        have.unit_amount === want.amount &&
        have.product === product.id &&
        (have.recurring?.interval ?? null) === want.interval;
      if (same) {
        out[`price ${want.lookupKey}`] = have.id;
        continue;
      }
      const price = await stripe.prices.create({
        product: product.id,
        currency: "usd",
        unit_amount: want.amount,
        lookup_key: want.lookupKey,
        transfer_lookup_key: true,
        ...(want.interval ? { recurring: { interval: want.interval } } : {}),
      });
      if (have) await stripe.prices.update(have.id, { active: false });
      console.log(`+ price ${want.lookupKey} (${want.amount / 100} USD)`);
      out[`price ${want.lookupKey}`] = price.id;
    }
  }

  // The customer portal: payment method, invoices, cancel at the end of the period.
  const configs = await stripe.billingPortal.configurations.list({ limit: 100 });
  let portal = configs.data.find((c) => c.metadata?.waggle === "portal");
  if (!portal) {
    portal = await stripe.billingPortal.configurations.create({
      business_profile: { headline: "Waggle: your plan, card and invoices" },
      features: {
        customer_update: { enabled: true, allowed_updates: ["email", "address", "name", "tax_id"] },
        invoice_history: { enabled: true },
        payment_method_update: { enabled: true },
        subscription_cancel: { enabled: true, mode: "at_period_end" },
      },
      metadata: { waggle: "portal" },
    });
    console.log("+ portal configuration");
  }
  out["portal configuration"] = portal.id;

  console.log("\nStripe catalog (" + (key!.startsWith("sk_live_") ? "LIVE" : "test mode") + "):");
  for (const [k, v] of Object.entries(out)) console.log(`  ${k.padEnd(44)} ${v}`);
  console.log(
    `\nThe app finds prices by lookup key (e.g. ${PRICE_KEYS.plan("business", "month")}).`,
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
