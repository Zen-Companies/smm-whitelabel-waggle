import "server-only";
import type Stripe from "stripe";
import { FOUNDING, isPlanId, PLANS, type PlanId } from "./plans";
import { getStripe } from "./stripe-client";
import { parsePlanKey } from "./subscription";

export interface TrialConversion {
  /** The Checkout Session id: the event's stable key. */
  sessionId: string;
  plan: PlanId;
  /** The monthly price the trial turns into, in US dollars (founding price when it applies). */
  valueUsd: number;
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
  if (sub.status !== "trialing" || !sub.trial_end) return null;
  const key = sub.items.data.map((i) => parsePlanKey(i.price.lookup_key)).find((k) => k !== null);
  if (!key || !isPlanId(key.plan)) return null;
  const founding = sub.metadata?.founding === "1" && key.plan === FOUNDING.plan;
  const p = PLANS[key.plan];
  const valueUsd = founding
    ? FOUNDING.monthlyUsd
    : key.interval === "year" && p.yearlyUsd !== null
      ? Math.round((p.yearlyUsd / 12) * 100) / 100
      : p.monthlyUsd;
  return { sessionId: session.id, plan: key.plan, valueUsd };
}

/**
 * Stripe's return to Your plan after a first-time checkout: asks Stripe whether that checkout
 * really started a trial for this organization. A made-up or reused link fires nothing.
 */
export async function loadTrialConversion(
  sessionId: unknown,
  orgId: string,
): Promise<TrialConversion | null> {
  if (!looksLikeSessionId(sessionId)) return null;
  const stripe = getStripe();
  if (!stripe) return null;
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["subscription"],
    });
    return trialFromSession(session, orgId);
  } catch (e) {
    console.error("billing: reading the checkout for the trial tag failed", {
      orgId,
      error: e instanceof Error ? e.message : "unknown",
    });
    return null;
  }
}
