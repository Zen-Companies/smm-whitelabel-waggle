import { parseStartParam } from "@/lib/checkout-link";
import { getServiceClient } from "@/lib/supabase/service";
import { loadBilling } from "./billing-store";
import { isPaidPlanId } from "./plans";
import { getStripe } from "./stripe-client";
import { startCheckoutDecision } from "./start-checkout";
import { AutoCheckout } from "./start-checkout-view";
import { planIsLive } from "./subscription";
import { loadPlans } from "./usage";

/**
 * Your plan opened from HighLevel's upgrade button (/plan?start=solo or start=team, 25 Nov): the
 * Owner on Free goes straight to Stripe Checkout; anyone else reads who can start the plan.
 */
export async function StartCheckout({
  orgId,
  isOwner,
  start: raw,
}: {
  orgId: string;
  isOwner: boolean;
  start: unknown;
}) {
  const start = parseStartParam(raw);
  if (!start || !getStripe()) return null;
  const db = getServiceClient();
  const [bill, plans] = await Promise.all([loadBilling(db, orgId), loadPlans(db)]);
  const decision = startCheckoutDecision({
    start,
    isOwner,
    onPaidPlan: !!bill && planIsLive(bill.status) && isPaidPlanId(bill.plan),
    plans,
  });
  if (decision.kind === "checkout") {
    return (
      <AutoCheckout orgId={orgId} planId={decision.planId} planName={plans[decision.planId].name} />
    );
  }
  if (decision.kind === "ask_owner") {
    return (
      <section className="card flex max-w-[1100px] flex-col gap-2 p-6">
        <p className="text-ink-2 m-0">
          Only the organization’s Owner can start {decision.planName}. Ask them to open this link.
        </p>
      </section>
    );
  }
  return null;
}
