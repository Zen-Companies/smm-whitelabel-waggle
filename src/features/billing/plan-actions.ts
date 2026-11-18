"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type Stripe from "stripe";
import { z } from "zod";
import { getCurrentUser } from "@/lib/supabase/server";
import { getServiceClient, type ServiceClient } from "@/lib/supabase/service";
import { auditOrg, loadBilling, type BillingRecord } from "./billing-store";
import { FOUNDING_COUPON, PRICE_KEYS, type Interval } from "./catalog";
import { EXTRAS, FOUNDING, PLANS, TRIAL, isPlanId, type Plan, type PlanId } from "./plans";
import { loadPlans } from "./usage";
import { chargeTopUp, type TopUpCharge } from "./auto-top-up";
import { appUrl, getStripe, priceId } from "./stripe-client";
import {
  billingFromSubscription,
  isExtraAccountKey,
  parsePlanKey,
  planIsLive,
} from "./subscription";

// Settings → Your plan (T86). Only the organization's Owner manages the bill (billing.view,
// T53); checked here too, since a Server Action is reachable without the page.

export type PlanActionState = {
  error?: string;
  done?: string;
  /** The confirm must be asked again with a new key (after a decline). */
  fresh?: boolean;
};

const PLAN_PATH = "/plan";
const orgIdSchema = z.string().uuid();

async function ownerOf(orgIdRaw: FormDataEntryValue | null) {
  const orgId = orgIdSchema.safeParse(orgIdRaw);
  if (!orgId.success) return null;
  const user = await getCurrentUser();
  const db = getServiceClient();
  const { data } = await db
    .from("organization_members")
    .select("role")
    .eq("organization_id", orgId.data)
    .eq("user_id", user.id)
    .maybeSingle();
  if (data?.role !== "owner") return null;
  return { orgId: orgId.data, user, db };
}

const NOT_OWNER = "Only the organization's Owner can change the plan.";
const NO_STRIPE = "Billing isn't set up on this server yet.";
const STRIPE_DOWN = "Couldn't reach our payment provider. Please try again in a minute.";

async function ensureCustomer(
  stripe: Stripe,
  db: ServiceClient,
  orgId: string,
  email: string | undefined,
  bill: BillingRecord | null,
): Promise<string> {
  if (bill) return bill.stripe_customer_id;
  const { data: org } = await db.from("organizations").select("name").eq("id", orgId).single();
  const customer = await stripe.customers.create(
    { name: org?.name, email, metadata: { organization_id: orgId } },
    { idempotencyKey: `customer:${orgId}` },
  );
  const { error } = await db
    .from("org_billing")
    .insert({ organization_id: orgId, stripe_customer_id: customer.id });
  if (error) {
    // Another tab got there first: use the stored customer.
    const again = await loadBilling(db, orgId);
    if (again) return again.stripe_customer_id;
    throw new Error(error.message);
  }
  return customer.id;
}

async function foundingSpotsLeft(stripe: Stripe): Promise<boolean> {
  try {
    const c = await stripe.coupons.retrieve(FOUNDING_COUPON);
    return c.valid && (c.max_redemptions ?? FOUNDING.spots) > c.times_redeemed;
  } catch {
    return false;
  }
}

/** Stores the subscription now, so the page is right before the webhook lands. */
async function syncNow(db: ServiceClient, orgId: string, sub: Stripe.Subscription) {
  await db
    .from("org_billing")
    .update({ ...billingFromSubscription(sub), updated_at: new Date().toISOString() })
    .eq("organization_id", orgId);
}

function readChoice(
  formData: FormData,
  plans: Record<PlanId, Plan>,
): { plan: PlanId; interval: Interval } | null {
  const plan = formData.get("plan");
  const interval = formData.get("interval") === "year" ? "year" : "month";
  // "For sale" as staff set it on Staff → Plans.
  if (!isPlanId(plan) || !plans[plan].forSale) return null;
  if (interval === "year" && PLANS[plan].yearlyUsd === null) return null;
  return { plan, interval };
}

/**
 * Choose a plan. Without a plan: Stripe Checkout with the 7-day trial and a card up front (and
 * the founding price on Business monthly while spots last). With one: switch it in place,
 * prorated.
 */
export async function choosePlan(
  _prev: PlanActionState,
  formData: FormData,
): Promise<PlanActionState> {
  const who = await ownerOf(formData.get("orgId"));
  if (!who) return { error: NOT_OWNER };
  const choice = readChoice(formData, await loadPlans(who.db));
  if (!choice) return { error: "That plan isn't available." };
  const stripe = getStripe();
  if (!stripe) return { error: NO_STRIPE };
  const { db, orgId, user } = who;
  const bill = await loadBilling(db, orgId);

  let url: string | null = null;
  try {
    if (bill?.stripe_subscription_id && planIsLive(bill.status)) {
      const sub = await stripe.subscriptions.retrieve(bill.stripe_subscription_id);
      const planItem = sub.items.data.find((i) => parsePlanKey(i.price.lookup_key));
      const extraItem = sub.items.data.find((i) => isExtraAccountKey(i.price.lookup_key));
      const items: Stripe.SubscriptionUpdateParams.Item[] = [
        planItem
          ? {
              id: planItem.id,
              price: await priceId(stripe, PRICE_KEYS.plan(choice.plan, choice.interval)),
            }
          : { price: await priceId(stripe, PRICE_KEYS.plan(choice.plan, choice.interval)) },
      ];
      // Every item on a subscription shares its interval.
      if (extraItem) {
        items.push({
          id: extraItem.id,
          price: await priceId(stripe, PRICE_KEYS.extraAccount(choice.interval)),
        });
      }
      const updated = await stripe.subscriptions.update(sub.id, {
        items,
        proration_behavior: "create_prorations",
        cancel_at_period_end: false,
        metadata: { ...sub.metadata, organization_id: orgId },
      });
      await syncNow(db, orgId, updated);
      await auditOrg(db, orgId, "billing.plan_changed", user.id, {
        plan: choice.plan,
        interval: choice.interval,
        was: bill.plan,
      });
      revalidatePath(PLAN_PATH);
      return { done: `You're on ${PLANS[choice.plan].name} now.` };
    }

    const customer = await ensureCustomer(stripe, db, orgId, user.email, bill);
    const firstTime = !bill?.trial_ends_at && !bill?.stripe_subscription_id;
    const founding =
      choice.plan === FOUNDING.plan &&
      choice.interval === "month" &&
      firstTime &&
      (await foundingSpotsLeft(stripe));
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer,
      line_items: [
        {
          price: await priceId(stripe, PRICE_KEYS.plan(choice.plan, choice.interval)),
          quantity: 1,
        },
      ],
      payment_method_collection: "always",
      subscription_data: {
        // Stripe's subscription events list discounts by id only, so founding is marked here too.
        metadata: { organization_id: orgId, ...(founding ? { founding: "1" } : {}) },
        ...(firstTime ? { trial_period_days: TRIAL.days } : {}),
      },
      ...(founding
        ? { discounts: [{ coupon: FOUNDING_COUPON }] }
        : { allow_promotion_codes: false }),
      // Prices are in US dollars (Pricing Bible): no local-currency conversion at checkout.
      adaptive_pricing: { enabled: false },
      metadata: { organization_id: orgId, kind: "plan" },
      client_reference_id: orgId,
      // A first checkout comes back with its session id, so Your plan can ask Stripe whether it
      // started a trial and tell the ads (TrialConversionTag). Stripe fills {CHECKOUT_SESSION_ID}.
      success_url: appUrl(
        firstTime
          ? `${PLAN_PATH}?checkout=done&session_id={CHECKOUT_SESSION_ID}`
          : `${PLAN_PATH}?checkout=done`,
      ),
      cancel_url: appUrl(`${PLAN_PATH}?checkout=cancelled`),
    });
    await auditOrg(db, orgId, "billing.checkout_started", user.id, {
      plan: choice.plan,
      interval: choice.interval,
      founding,
    });
    url = session.url;
  } catch (e) {
    console.error("billing: choosing a plan failed", {
      orgId,
      error: e instanceof Error ? e.message : "unknown",
    });
    return { error: STRIPE_DOWN };
  }
  if (!url) return { error: STRIPE_DOWN };
  redirect(url);
}

/** Card, invoices and cancelling: Stripe's customer portal. */
export async function openBillingPortal(
  _prev: PlanActionState,
  formData: FormData,
): Promise<PlanActionState> {
  const who = await ownerOf(formData.get("orgId"));
  if (!who) return { error: NOT_OWNER };
  const stripe = getStripe();
  if (!stripe) return { error: NO_STRIPE };
  const bill = await loadBilling(who.db, who.orgId);
  if (!bill) return { error: "Choose a plan first." };
  let url: string;
  try {
    const configs = await stripe.billingPortal.configurations.list({ limit: 100 });
    const config = configs.data.find((c) => c.metadata?.waggle === "portal");
    const session = await stripe.billingPortal.sessions.create({
      customer: bill.stripe_customer_id,
      return_url: appUrl(PLAN_PATH),
      ...(config ? { configuration: config.id } : {}),
    });
    url = session.url;
  } catch (e) {
    console.error("billing: portal failed", {
      orgId: who.orgId,
      error: e instanceof Error ? e.message : "unknown",
    });
    return { error: STRIPE_DOWN };
  }
  redirect(url);
}

async function topUpCheckoutUrl(
  stripe: Stripe,
  db: ServiceClient,
  orgId: string,
  userId: string,
  bill: BillingRecord,
): Promise<string | null> {
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer: bill.stripe_customer_id,
    line_items: [{ price: await priceId(stripe, PRICE_KEYS.topUp), quantity: 1 }],
    metadata: { organization_id: orgId, kind: "top_up" },
    adaptive_pricing: { enabled: false },
    invoice_creation: {
      enabled: true,
      invoice_data: { metadata: { organization_id: orgId, kind: "top_up" } },
    },
    success_url: appUrl(`${PLAN_PATH}?top_up=done`),
    cancel_url: appUrl(PLAN_PATH),
  });
  await auditOrg(db, orgId, "billing.top_up_started", userId);
  return session.url;
}

/** 200 more AI replies, one time, through Stripe's checkout page (no saved card). */
export async function buyTopUp(
  _prev: PlanActionState,
  formData: FormData,
): Promise<PlanActionState> {
  const who = await ownerOf(formData.get("orgId"));
  if (!who) return { error: NOT_OWNER };
  const stripe = getStripe();
  if (!stripe) return { error: NO_STRIPE };
  const bill = await loadBilling(who.db, who.orgId);
  if (!bill || !planIsLive(bill.status)) return { error: "Choose a plan first." };
  let url: string | null;
  try {
    url = await topUpCheckoutUrl(stripe, who.db, who.orgId, who.user.id, bill);
  } catch (e) {
    console.error("billing: top-up failed", {
      orgId: who.orgId,
      error: e instanceof Error ? e.message : "unknown",
    });
    return { error: STRIPE_DOWN };
  }
  if (!url) return { error: STRIPE_DOWN };
  redirect(url);
}

/**
 * One-click top-up (Pricing Bible, 18 Nov; design "Billing round 2"): after the owner confirms
 * in place, 200 more replies charged to the card on the plan right away, also during the trial.
 * No saved card, or the bank wants the owner to confirm: Stripe's checkout page instead.
 * `nonce` (one per confirm) makes a double tap charge once.
 */
export async function buyTopUpNow(
  _prev: PlanActionState,
  formData: FormData,
): Promise<PlanActionState> {
  const who = await ownerOf(formData.get("orgId"));
  if (!who) return { error: NOT_OWNER };
  const nonce = z.uuid().safeParse(formData.get("nonce"));
  if (!nonce.success) return { error: "Reload the page and try again." };
  const stripe = getStripe();
  if (!stripe) return { error: NO_STRIPE };
  const bill = await loadBilling(who.db, who.orgId);
  if (!bill || !planIsLive(bill.status)) return { error: "Choose a plan first." };
  let r: TopUpCharge;
  try {
    r = await chargeTopUp(who.db, stripe, bill, {
      automatic: false,
      idempotencyKey: `top-up-now:${who.orgId}:${nonce.data}`,
      actor: who.user.id,
    });
  } catch (e) {
    console.error("billing: one-click top-up failed", {
      orgId: who.orgId,
      error: e instanceof Error ? e.message : "unknown",
    });
    return { error: STRIPE_DOWN };
  }
  if (r.ok) {
    revalidatePath(PLAN_PATH);
    revalidatePath("/inbox");
    revalidatePath("/today");
    return {
      done: `${EXTRAS.topUp.replies} more replies added. The receipt is on its way to your email.`,
    };
  }
  if (r.reason === "declined") {
    return { error: "Your bank declined it. Update your card, then try again.", fresh: true };
  }
  if (r.reason === "unavailable") return { error: STRIPE_DOWN };
  let url: string | null;
  try {
    url = await topUpCheckoutUrl(stripe, who.db, who.orgId, who.user.id, bill);
  } catch {
    return { error: STRIPE_DOWN };
  }
  if (!url) return { error: STRIPE_DOWN };
  redirect(url);
}

/** One more (or one fewer) connected account, $10 a month each, prorated. */
export async function changeExtraAccounts(
  _prev: PlanActionState,
  formData: FormData,
): Promise<PlanActionState> {
  const who = await ownerOf(formData.get("orgId"));
  if (!who) return { error: NOT_OWNER };
  const delta = formData.get("delta") === "-1" ? -1 : 1;
  const stripe = getStripe();
  if (!stripe) return { error: NO_STRIPE };
  const bill = await loadBilling(who.db, who.orgId);
  if (!bill?.stripe_subscription_id || !planIsLive(bill.status))
    return { error: "Choose a plan first." };
  const next = bill.extra_accounts + delta;
  if (next < 0) return { error: "There are no extra accounts to remove." };
  try {
    const sub = await stripe.subscriptions.retrieve(bill.stripe_subscription_id);
    const item = sub.items.data.find((i) => isExtraAccountKey(i.price.lookup_key));
    const interval: Interval = bill.billing_interval === "year" ? "year" : "month";
    const items: Stripe.SubscriptionUpdateParams.Item[] =
      next === 0
        ? item
          ? [{ id: item.id, deleted: true }]
          : []
        : item
          ? [{ id: item.id, quantity: next }]
          : [{ price: await priceId(stripe, PRICE_KEYS.extraAccount(interval)), quantity: next }];
    const updated = await stripe.subscriptions.update(sub.id, {
      items,
      proration_behavior: "create_prorations",
    });
    await syncNow(who.db, who.orgId, updated);
    await auditOrg(who.db, who.orgId, "billing.extra_accounts", who.user.id, {
      extraAccounts: next,
    });
  } catch (e) {
    console.error("billing: extra account failed", {
      orgId: who.orgId,
      error: e instanceof Error ? e.message : "unknown",
    });
    return { error: STRIPE_DOWN };
  }
  revalidatePath(PLAN_PATH);
  return {
    done:
      delta > 0
        ? `Added: one more account, $${EXTRAS.accountUsd} a month.`
        : "Removed one extra account.",
  };
}

/** Automatic top-up on or off (opt-in, at most twice a month, a receipt each time). */
export async function setAutoTopUp(
  _prev: PlanActionState,
  formData: FormData,
): Promise<PlanActionState> {
  const who = await ownerOf(formData.get("orgId"));
  if (!who) return { error: NOT_OWNER };
  const on = formData.get("on") === "1";
  const { error } = await who.db
    .from("org_billing")
    .update({ auto_top_up: on, updated_at: new Date().toISOString() })
    .eq("organization_id", who.orgId);
  if (error) return { error: "Couldn't save. Please try again." };
  await auditOrg(who.db, who.orgId, "billing.auto_top_up", who.user.id, { on });
  revalidatePath(PLAN_PATH);
  return { done: on ? "Automatic top-up is on." : "Automatic top-up is off." };
}
