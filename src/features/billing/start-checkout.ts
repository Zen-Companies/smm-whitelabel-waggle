// HighLevel's upgrade buttons (Walter, 25 Nov): /plan?start=solo or start=team. Pure: what Your
// plan does with the link. The link itself is in src/lib/checkout-link.ts.

import { START_PLAN_ID, type StartPlan } from "@/lib/checkout-link";
import { checkoutAllowed, type PaidPlanId, type Plan, type PlanId } from "./plans";

export type StartDecision =
  /** An Owner on Free: Stripe Checkout for this plan, straight away. */
  | { kind: "checkout"; planId: PaidPlanId }
  /** Not the Owner: the normal page, with a note to ask the Owner. */
  | { kind: "ask_owner"; planName: string }
  /** Nothing to do: no link, a paid plan already, or the plan isn't for sale. */
  | { kind: "none" };

export function startCheckoutDecision(input: {
  start: StartPlan | null;
  isOwner: boolean;
  /** The organization has a live paid plan (trialing, active or past due). */
  onPaidPlan: boolean;
  plans: Record<PlanId, Plan>;
}): StartDecision {
  if (!input.start) return { kind: "none" };
  const planId: PaidPlanId = START_PLAN_ID[input.start];
  const plan = input.plans[planId];
  // Never Business, never a plan staff took off sale.
  if (!checkoutAllowed(plan)) return { kind: "none" };
  if (!input.isOwner) return { kind: "ask_owner", planName: plan.name };
  if (input.onPaidPlan) return { kind: "none" };
  return { kind: "checkout", planId };
}
