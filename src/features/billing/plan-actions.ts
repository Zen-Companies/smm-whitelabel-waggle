"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type Stripe from "stripe";
import { z } from "zod";
import { getCurrentUser } from "@/lib/supabase/server";
import { getServiceClient, type ServiceClient } from "@/lib/supabase/service";
import { auditOrg, loadBilling, type BillingRecord } from "./billing-store";
import { PRICE_KEYS, type Interval } from "./catalog";
import {
  checkoutTrialDays,
  EXTRAS,
  FOUNDING,
  PLANS,
  isPaidPlanId,
  type PaidPlanId,
  type Plan,
  type PlanId,
} from "./plans";
import { loadPlans } from "./usage";
import { upgradeLine } from "./upgrade";
import { chargeTopUp, type TopUpCharge } from "./auto-top-up";
import { appUrl, getStripe, priceId } from "./stripe-client";
import { ensureFoundingCoupon, foundingSpotsLeft } from "./founding";
import { firstCheckoutTrial } from "./promo";
import { loadPromotions } from "./promotions-store";
import { loadReferralForCheckout } from "./referrals";
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

/** Stores the subscription now, so the page is right before the webhook lands. */
async function syncNow(db: ServiceClient, orgId: string, sub: Stripe.Subscription) {
  await db
    .from("org_billing")
    .update({ ...billingFromSubscription(sub), updated_at: new Date().toISOString() })
    .eq("organization_id", orgId);
}

/**
 * The page the upgrade pop-up was on, ready for Stripe's parameters: `/setup?step=2&upgrade=
 * accounts&platform=tiktok&` (its own query kept, the pop-up's reason set). Only a path on this
 * site; anything else returns to Your plan as before.
 */
function popupReturn(
  back: FormDataEntryValue | null,
  reason: FormDataEntryValue | null,
): string | null {
  if (typeof back !== "string" || typeof reason !== "string") return null;
  if (!/^\/(?![/\\])[^\s]{0,400}$/.test(back) || !/^[a-z_]{1,32}$/.test(reason)) return null;
  const url = new URL(back, "http://waggle.local");
  if (url.origin !== "http://waggle.local") return null;
  for (const k of ["checkout", "session_id", "welcome"]) url.searchParams.delete(k);
  url.searchParams.set("upgrade", reason);
  return `${url.pathname}?${url.searchParams.toString()}&`;
}

function readChoice(
  formData: FormData,
  plans: Record<PlanId, Plan>,
): { plan: PaidPlanId; interval: Interval } | null {
  const plan = formData.get("plan");
  const interval = formData.get("interval") === "year" ? "year" : "month";
  // "For sale" as staff set it on Staff → Plans.
  // Free is no checkout; Business is by call only (19 Nov).
  if (!isPaidPlanId(plan) || !plans[plan].forSale) return null;
  if (interval === "year" && PLANS[plan].yearlyUsd === null) return null;
  return { plan, interval };
}

/**
 * Choose a plan. From Free: Stripe Checkout with a card; the organization's first paid plan
 * starts with 7 days free (trial back, 20 Nov), with the founding price on Team monthly while
 * spots last. With a paid plan: switch it in place, prorated.
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
  const returnTo = popupReturn(formData.get("back"), formData.get("reason"));

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
    // The first paid plan starts with 7 days free, with a card (trial back, 20 Nov).
    const baseTrial = checkoutTrialDays(bill);
    const firstTime = baseTrial !== null;
    // Black Friday and referrals (23 Nov): the free month replaces the 7 days on the first
    // checkout, with nothing to type; banked referral months add to it.
    const ref = firstTime
      ? await loadReferralForCheckout(db, orgId)
      : { referred: false, referredAt: null, bankedIds: [] as string[] };
    const free = firstTime
      ? firstCheckoutTrial({
          now: new Date(),
          referred: ref.referred,
          referredAt: ref.referredAt,
          bankedMonths: ref.bankedIds.length,
          baseDays: baseTrial,
          promotions: await loadPromotions(),
        })
      : null;
    const trialDays = free ? free.days : null;
    const promoMeta =
      free && (free.reasons.length || ref.bankedIds.length)
        ? {
            promo: free.reasons.join(",") || "banked",
            ...(ref.bankedIds.length ? { banked_referrals: ref.bankedIds.join(",") } : {}),
          }
        : {};
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
        metadata: { organization_id: orgId, ...(founding ? { founding: "1" } : {}), ...promoMeta },
        ...(trialDays ? { trial_period_days: trialDays } : {}),
      },
      // A repeating coupon's months start at checkout, trial included: a long trial gets a
      // longer copy, so the founding price still covers 6 paid months (founding.ts).
      ...(founding
        ? { discounts: [{ coupon: await ensureFoundingCoupon(stripe, trialDays ?? 0) }] }
        : { allow_promotion_codes: false }),
      // Prices are in US dollars (Pricing Bible): no local-currency conversion at checkout.
      adaptive_pricing: { enabled: false },
      // "first": only a first-time checkout tells the ads (StartTrial / Subscribe) on return.
      metadata: {
        organization_id: orgId,
        kind: "plan",
        ...(firstTime ? { first: "1" } : {}),
        ...promoMeta,
      },
      client_reference_id: orgId,
      // A first checkout comes back with its session id, so Your plan can ask Stripe what it
      // started and tell the ads (TrialConversionTag). Stripe fills {CHECKOUT_SESSION_ID}.
      // From the upgrade pop-up (23 Nov): back to the page it was on, the pop-up open again.
      success_url: appUrl(
        returnTo
          ? `${returnTo}checkout=done&session_id={CHECKOUT_SESSION_ID}`
          : firstTime
            ? `${PLAN_PATH}?checkout=done&session_id={CHECKOUT_SESSION_ID}`
            : `${PLAN_PATH}?checkout=done`,
      ),
      cancel_url: appUrl(
        returnTo ? `${returnTo}checkout=cancelled` : `${PLAN_PATH}?checkout=cancelled`,
      ),
    });
    await auditOrg(db, orgId, "billing.checkout_started", user.id, {
      plan: choice.plan,
      interval: choice.interval,
      founding,
      trialDays,
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
  if (!bill || !planIsLive(bill.status)) return { error: upgradeLine("top_up") };
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
  if (!bill || !planIsLive(bill.status)) return { error: upgradeLine("top_up") };
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
    return { error: upgradeLine("extra_account") };
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
  // Free has no add-ons (19 Nov).
  const bill = await loadBilling(who.db, who.orgId);
  if (on && (!bill || !planIsLive(bill.status))) return { error: upgradeLine("top_up") };
  const { error } = await who.db
    .from("org_billing")
    .update({ auto_top_up: on, updated_at: new Date().toISOString() })
    .eq("organization_id", who.orgId);
  if (error) return { error: "Couldn't save. Please try again." };
  await auditOrg(who.db, who.orgId, "billing.auto_top_up", who.user.id, { on });
  revalidatePath(PLAN_PATH);
  return { done: on ? "Automatic top-up is on." : "Automatic top-up is off." };
}
