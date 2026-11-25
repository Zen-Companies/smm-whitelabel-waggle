// The site's plan cards (board "From the site's plan card to that plan in the app", option A,
// approved 25 Nov): gowaggle.ai's Solo or Team "Start free →" opens /signup?plan=solo (or team).
// Pure: what the sign-up page says about the picked plan, and whether setup's first page starts
// Checkout for it. The links themselves are in src/lib/checkout-link.ts.

import { START_PLAN_ID, type StartPlan } from "@/lib/checkout-link";
import { checkoutAllowed, trialEndsAt, type PaidPlanId, type Plan, type PlanId } from "./plans";
import { startCheckoutDecision } from "./start-checkout";
import { chargeDay } from "./trial-reminder";

export interface SignupPlanCard {
  start: StartPlan;
  /** "Solo". */
  name: string;
  /** Accounts, replies a month, and replying on its own (when the plan does). */
  bullets: string[];
  /** "$0 today. Then $49 a month from December 25. We email you 3 days before." */
  priceLine: string;
  /** The phone strip's short form: "$0 today, then $49 a month from December 25". */
  thenLine: string;
  /** The other plan to switch to, when it's on sale. */
  other: { start: StartPlan; name: string } | null;
}

const n = (v: number) => v.toLocaleString("en-US");

/**
 * The picked plan as the sign-up page shows it, from the plans as staff set them (Staff → Plans).
 * Null when the plan isn't sold on its own (off sale, or Business): the page is then today's.
 */
export function signupPlanCard(
  start: StartPlan | null,
  plans: Record<PlanId, Plan>,
  now: Date,
): SignupPlanCard | null {
  if (!start) return null;
  const plan = plans[START_PLAN_ID[start]];
  if (!checkoutAllowed(plan)) return null;
  const otherStart: StartPlan = start === "solo" ? "team" : "solo";
  const other = plans[START_PLAN_ID[otherStart]];
  const day = chargeDay(trialEndsAt(now));
  const price = `$${n(plan.monthlyUsd)}`;
  return {
    start,
    name: plan.name,
    bullets: [
      `${n(plan.accounts)} social ${plan.accounts === 1 ? "account" : "accounts"}`,
      `About ${n(plan.replies)} replies a month`,
      ...(plan.features.autoReply ? ["Replies on its own once you trust it"] : []),
    ],
    priceLine: `$0 today. Then ${price} a month from ${day}. We email you 3 days before.`,
    thenLine: `$0 today, then ${price} a month from ${day}`,
    other: checkoutAllowed(other) ? { start: otherStart, name: other.name } : null,
  };
}

/**
 * Setup's first page after sign-up with a plan (/welcome?start=solo): Checkout for that plan, only
 * for the Owner of their own (personal) organization, on Free, that never had a paid plan or a
 * trial. Anything else: null, and setup carries on as usual.
 */
export function signupCheckoutPlan(input: {
  start: StartPlan | null;
  personal: boolean;
  isOwner: boolean;
  /** A live paid plan (trialing, active or past due). */
  onPaidPlan: boolean;
  /** Never had a subscription or a trial (checkoutTrialDays is not null). */
  firstTime: boolean;
  plans: Record<PlanId, Plan>;
}): PaidPlanId | null {
  if (!input.personal || !input.firstTime) return null;
  const decision = startCheckoutDecision(input);
  return decision.kind === "checkout" ? decision.planId : null;
}
