import "server-only";
import type { ServiceClient } from "@/lib/supabase/service";
import { auditOrg, loadBilling, loadTopUps } from "./billing-store";
import { PRICE_KEYS } from "./catalog";
import { EXTRAS, isPlanId } from "./plans";
import { getStripe, priceId } from "./stripe-client";
import { autoTopUpAllowed, planIsLive } from "./subscription";

/**
 * Automatic top-up (Pricing Bible: opt-in, off by default, at most twice a month, an email
 * receipt every time). When the organization is out of replies and it's on, charges the card on
 * the subscription for 200 more and records them. Stripe emails the receipt. Returns whether
 * replies were added.
 */
export async function tryAutoTopUp(db: ServiceClient, orgId: string, now: Date): Promise<boolean> {
  const stripe = getStripe();
  const bill = await loadBilling(db, orgId);
  if (
    !stripe ||
    !bill?.stripe_subscription_id ||
    !planIsLive(bill.status) ||
    !isPlanId(bill.plan)
  ) {
    return false;
  }
  // No charges during the free trial: the card is first charged when the trial ends.
  if (bill.status === "trialing") return false;
  const topUps = await loadTopUps(db, orgId, bill.plan, now);
  if (!autoTopUpAllowed(bill.auto_top_up, topUps.automaticThisMonth)) return false;

  try {
    const sub = await stripe.subscriptions.retrieve(bill.stripe_subscription_id);
    const card =
      typeof sub.default_payment_method === "string"
        ? sub.default_payment_method
        : (sub.default_payment_method?.id ?? undefined);
    const invoice = await stripe.invoices.create(
      {
        customer: bill.stripe_customer_id,
        collection_method: "charge_automatically",
        auto_advance: false,
        pending_invoice_items_behavior: "exclude",
        default_payment_method: card,
        description: `Automatic top-up: ${EXTRAS.topUp.replies} more AI replies`,
        metadata: { kind: "auto_top_up", organization_id: orgId },
      },
      // One automatic top-up per organization per slot per month, even if drafting races.
      {
        idempotencyKey: `auto-top-up:${orgId}:${now.toISOString().slice(0, 7)}:${topUps.automaticThisMonth}`,
      },
    );
    await stripe.invoiceItems.create({
      customer: bill.stripe_customer_id,
      invoice: invoice.id,
      pricing: { price: await priceId(stripe, PRICE_KEYS.topUp) },
    });
    await stripe.invoices.finalizeInvoice(invoice.id!);
    const paid = await stripe.invoices.pay(invoice.id!);
    if (paid.status !== "paid") return false;
    const { error } = await db.from("reply_top_ups").upsert(
      {
        organization_id: orgId,
        replies: EXTRAS.topUp.replies,
        stripe_ref: paid.id!,
        automatic: true,
      },
      { onConflict: "stripe_ref", ignoreDuplicates: true },
    );
    if (error) throw new Error(error.message);
    await auditOrg(db, orgId, "billing.top_up", "system", { automatic: true, ref: paid.id! });
    return true;
  } catch (e) {
    // A declined card or a Stripe outage: drafting stays paused, like any limit.
    console.error("billing: automatic top-up failed", {
      orgId,
      error: e instanceof Error ? e.message : "unknown",
    });
    return false;
  }
}
