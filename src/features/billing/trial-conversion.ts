import "server-only";
import type Stripe from "stripe";
import { FOUNDING, isPaidPlanId, PLANS, type PaidPlanId } from "./plans";
import { getStripe } from "./stripe-client";
import { parsePlanKey } from "./subscription";

export interface TrialConversion {
  /** The Checkout Session id: the event's stable key. */
  sessionId: string;
  /** A trial (old checkouts) or a paid plan straight away (moving up from Free, 19 Nov). */
  kind: "trial" | "paid";
  plan: PaidPlanId;
  /** The monthly price the trial turns into, in US dollars (founding price when it applies). */
  valueUsd: number;
  /** The organization's first plan checkout (marked when it was made): only this tells the ads. */
  first: boolean;
}

/** Checkout Session ids are cs_test_… or cs_live_…; anything else is ignored without a Stripe call. */
export function looksLikeSessionId(v: unknown): v is string {
  return typeof v === "string" && /^cs_(test|live)_[A-Za-z0-9]{10,200}$/.test(v);
}

/**
 * Pure: whether a Checkout Session (with its subscription expanded) is this organization's
 * first-time plan checkout that started a trial. Anything else (a top-up, a plan change, a
 * session of another organization, an unpaid or expired session) is not a trial start.
 */
export function trialFromSession(
  session: Pick<
    Stripe.Checkout.Session,
    "id" | "status" | "mode" | "client_reference_id" | "metadata"
  > & {
    subscription: string | Stripe.Subscription | null;
  },
  orgId: string,
): TrialConversion | null {
  if (session.status !== "complete" || session.mode !== "subscription") return null;
  if (session.client_reference_id !== orgId || session.metadata?.kind !== "plan") return null;
  const sub = session.subscription;
  if (!sub || typeof sub === "string") return null;
  const trial = sub.status === "trialing" && !!sub.trial_end;
  if (!trial && sub.status !== "active") return null;
  const key = sub.items.data.map((i) => parsePlanKey(i.price.lookup_key)).find((k) => k !== null);
  if (!key || !isPaidPlanId(key.plan)) return null;
  const founding = sub.metadata?.founding === "1" && key.plan === FOUNDING.plan;
  const p = PLANS[key.plan];
  const valueUsd = founding
    ? FOUNDING.monthlyUsd
    : key.interval === "year" && p.yearlyUsd !== null
      ? Math.round((p.yearlyUsd / 12) * 100) / 100
      : p.monthlyUsd;
  return {
    sessionId: session.id,
    kind: trial ? "trial" : "paid",
    plan: key.plan,
    valueUsd,
    first: session.metadata?.first === "1",
  };
}

/**
 * Stripe's return to Your plan after a first-time checkout: asks Stripe whether that checkout
 * really started a trial for this organization. A made-up or reused link fires nothing.
 */
export async function loadTrialConversion(
  sessionId: unknown,
  orgId: string,
): Promise<TrialConversion | null> {
  return (await loadCheckoutReturn(sessionId, orgId))?.conversion ?? null;
}

/**
 * The same check, with the subscription it started (the upgrade pop-up stores it at once, so the
 * tapped action can carry on before the webhook lands).
 */
export async function loadCheckoutReturn(
  sessionId: unknown,
  orgId: string,
): Promise<{
  conversion: TrialConversion;
  subscription: Stripe.Subscription;
  /** The session's own record of the free month (promo, banked_referrals), set at checkout. */
  metadata: Record<string, string>;
} | null> {
  if (!looksLikeSessionId(sessionId)) return null;
  const stripe = getStripe();
  if (!stripe) return null;
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["subscription"],
    });
    const conversion = trialFromSession(session, orgId);
    const sub = session.subscription;
    if (!conversion || !sub || typeof sub === "string") return null;
    return { conversion, subscription: sub, metadata: session.metadata ?? {} };
  } catch (e) {
    console.error("billing: reading the checkout for the trial tag failed", {
      orgId,
      error: e instanceof Error ? e.message : "unknown",
    });
    return null;
  }
}
