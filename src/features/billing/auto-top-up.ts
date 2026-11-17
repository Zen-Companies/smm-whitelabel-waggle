import "server-only";
import type Stripe from "stripe";
import type { ServiceClient } from "@/lib/supabase/service";
import { auditOrg, loadBilling, loadTopUps, type BillingRecord } from "./billing-store";
import { PRICE_KEYS } from "./catalog";
import { EXTRAS, isPlanId } from "./plans";
import { getStripe, priceId } from "./stripe-client";
import { autoTopUpAllowed, planIsLive } from "./subscription";

// Charging 200 more replies to the card already on the plan: the one-click top-up (Pricing
// Bible, 18 Nov: one tap and a confirm, also during the free trial) and the automatic top-up
// (opt-in, at most twice a month, never during the trial). Stripe emails the receipt.

export type TopUpCharge =
  | { ok: true; ref: string }
  /** No saved card, or the bank wants the owner to confirm: use Stripe's checkout page. */
  | { ok: false; reason: "needs_checkout" }
  | { ok: false; reason: "declined" | "unavailable" };

/** "Visa ending 4242" for the saved card, or null (for the confirm line and Your plan). */
export async function cardLabel(stripe: Stripe, bill: BillingRecord): Promise<string | null> {
  const id = await savedCard(stripe, bill);
  if (!id) return null;
  const pm = await stripe.paymentMethods.retrieve(id);
  if (!pm.card) return null;
  const brand = pm.card.brand.charAt(0).toUpperCase() + pm.card.brand.slice(1);
  return `${brand} ending ${pm.card.last4}`;
}

/** The card on the subscription (or the customer's default), or null. */
export async function savedCard(stripe: Stripe, bill: BillingRecord): Promise<string | null> {
  if (bill.stripe_subscription_id) {
    const sub = await stripe.subscriptions.retrieve(bill.stripe_subscription_id);
    const pm = sub.default_payment_method;
    if (pm) return typeof pm === "string" ? pm : pm.id;
  }
  const customer = await stripe.customers.retrieve(bill.stripe_customer_id);
  if (customer.deleted) return null;
  const pm = customer.invoice_settings?.default_payment_method;
  return pm ? (typeof pm === "string" ? pm : pm.id) : null;
}

/** Charges $15 for 200 replies to the saved card and records them. */
export async function chargeTopUp(
  db: ServiceClient,
  stripe: Stripe,
  bill: BillingRecord,
  opts: { automatic: boolean; idempotencyKey: string; actor: string },
): Promise<TopUpCharge> {
  let card: string | null;
  try {
    card = await savedCard(stripe, bill);
  } catch {
    return { ok: false, reason: "unavailable" };
  }
  if (!card) return { ok: false, reason: "needs_checkout" };
  const orgId = bill.organization_id;
  let invoiceId: string;
  let status: string | null;
  try {
    const created = await stripe.invoices.create(
      {
        customer: bill.stripe_customer_id,
        collection_method: "charge_automatically",
        auto_advance: false,
        pending_invoice_items_behavior: "exclude",
        default_payment_method: card,
        description: `${opts.automatic ? "Automatic top-up" : "Top-up"}: ${EXTRAS.topUp.replies} more AI replies`,
        // Not "top_up": that's the checkout's own invoice, already counted by its session.
        metadata: {
          kind: opts.automatic ? "auto_top_up" : "top_up_now",
          organization_id: orgId,
        },
      },
      { idempotencyKey: opts.idempotencyKey },
    );
    invoiceId = created.id!;
    // A repeated key replays the invoice as first created: read where it really is now.
    let invoice = await stripe.invoices.retrieve(invoiceId);
    if (invoice.status === "draft") {
      if (!invoice.lines?.data?.length) {
        await stripe.invoiceItems.create(
          {
            customer: bill.stripe_customer_id,
            invoice: invoiceId,
            pricing: { price: await priceId(stripe, PRICE_KEYS.topUp) },
          },
          { idempotencyKey: `${opts.idempotencyKey}:item` },
        );
      }
      invoice = await stripe.invoices.finalizeInvoice(invoiceId);
    }
    status = invoice.status;
  } catch {
    return { ok: false, reason: "unavailable" };
  }
  // Already settled by an earlier try with this key.
  if (status === "paid") return credit(db, orgId, invoiceId, opts);
  if (status === "void" || status === "uncollectible") return { ok: false, reason: "declined" };

  try {
    // One click: the owner is here (on session). Automatic: they aren't (off session).
    const paid = await stripe.invoices.pay(invoiceId, opts.automatic ? { off_session: true } : {});
    if (paid.status === "paid") return credit(db, orgId, invoiceId, opts);
    await stripe.invoices.voidInvoice(invoiceId).catch(() => undefined);
    return { ok: false, reason: "declined" };
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "authentication_required" || code === "invoice_payment_intent_requires_action") {
      await stripe.invoices.voidInvoice(invoiceId).catch(() => undefined);
      return { ok: false, reason: "needs_checkout" };
    }
    if ((e as { type?: string }).type === "StripeCardError" || code === "card_declined") {
      await stripe.invoices.voidInvoice(invoiceId).catch(() => undefined);
      return { ok: false, reason: "declined" };
    }
    // Unclear (network, timeout, 5xx): the charge may have gone through. Look before deciding.
    try {
      const now = await stripe.invoices.retrieve(invoiceId);
      if (now.status === "paid") return credit(db, orgId, invoiceId, opts);
      // Not paid: void it so it can't be charged later by surprise.
      await stripe.invoices.voidInvoice(invoiceId).catch(() => undefined);
    } catch {
      // Still unknown: the same key on a retry reads it again before anything else.
    }
    return { ok: false, reason: "unavailable" };
  }
}

/** Records the 200 replies once per invoice (the webhook may record it too) and audits it once. */
async function credit(
  db: ServiceClient,
  orgId: string,
  invoiceId: string,
  opts: { automatic: boolean; actor: string },
): Promise<TopUpCharge> {
  const { data, error } = await db
    .from("reply_top_ups")
    .upsert(
      {
        organization_id: orgId,
        replies: EXTRAS.topUp.replies,
        stripe_ref: invoiceId,
        automatic: opts.automatic,
      },
      { onConflict: "stripe_ref", ignoreDuplicates: true },
    )
    .select("id");
  if (error) throw new Error(`billing: saving the top-up failed: ${error.message}`);
  if (data?.length) {
    await auditOrg(db, orgId, "billing.top_up", opts.actor, {
      automatic: opts.automatic,
      ref: invoiceId,
    });
  }
  return { ok: true, ref: invoiceId };
}

/**
 * Automatic top-up: when the organization is out of replies and the owner turned it on, 200
 * more on the saved card. Returns whether replies were added.
 */
export async function tryAutoTopUp(
  db: ServiceClient,
  orgId: string,
  now: Date,
  planReplies: number,
): Promise<boolean> {
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
  // No automatic charges during the free trial (the owner can still top up by hand).
  if (bill.status === "trialing") return false;
  const topUps = await loadTopUps(db, orgId, planReplies, now);
  if (!autoTopUpAllowed(bill.auto_top_up, topUps.automaticThisMonth)) return false;
  try {
    const r = await chargeTopUp(db, stripe, bill, {
      automatic: true,
      // One automatic top-up per organization per slot per month, even if drafting races.
      idempotencyKey: `auto-top-up:${orgId}:${now.toISOString().slice(0, 7)}:${topUps.automaticThisMonth}`,
      actor: "system",
    });
    if (!r.ok && r.reason === "declined") {
      // A declined card: stop trying every draft; the owner turns it on again after updating it.
      await db.from("org_billing").update({ auto_top_up: false }).eq("organization_id", orgId);
      await auditOrg(db, orgId, "billing.auto_top_up_off", "system", { reason: "declined" });
    }
    return r.ok;
  } catch (e) {
    // A Stripe outage: drafting stays paused, like any limit.
    console.error("billing: automatic top-up failed", {
      orgId,
      error: e instanceof Error ? e.message : "unknown",
    });
    return false;
  }
}
