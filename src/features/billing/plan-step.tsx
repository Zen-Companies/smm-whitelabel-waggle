import { skipPlanGate, choosePlan } from "./plan-actions";
import { PlanCards, type PlanCardData } from "./plan-forms";
import type { PlanGateState } from "./plan-gate-server";
import { FOUNDING, PLANS, TRIAL, planBullets, trialEndsAt, type PlanId } from "./plans";
import { loadPlans } from "./usage";
import { getServiceClient } from "@/lib/supabase/service";
import { Button } from "@/components/ui/button";

// The plan step before setup (approved 18 Nov, canvas "Pick a plan before setup"): step 0 of Get
// Waggle ready. Owners pick a plan (7-day trial, card at checkout); a seat on a team without a
// plan asks the owner; Waggle staff also see an Admin only Skip for now.

/** "25 November": when a trial started today ends. */
function trialEndLabel(now: Date): string {
  return trialEndsAt(now).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

export async function PlanStep({
  org,
  state,
  cancelled,
}: {
  org: { id: string; name: string };
  state: PlanGateState;
  cancelled: boolean;
}) {
  if (state.gate === "ask_owner") {
    return (
      <div className="mx-auto flex w-full max-w-[620px] flex-col gap-4 px-4 py-12">
        <h1 className="font-display text-[28px] font-semibold">Your team&apos;s plan has ended</h1>
        <p className="text-ink-2">
          {org.name} doesn&apos;t have a plan right now, so Waggle is paused for the team. Ask the
          organization&apos;s Owner to pick one. You can switch organization at the top.
        </p>
        {state.staff && <AdminSkip orgId={org.id} />}
      </div>
    );
  }

  const plans = await loadPlans(getServiceClient());
  const cards: PlanCardData[] = (Object.keys(plans) as PlanId[]).map((id) => ({
    id,
    name: plans[id].name,
    monthlyUsd: plans[id].monthlyUsd,
    yearlyUsd: plans[id].yearlyUsd,
    forSale: plans[id].forSale,
    bullets: planBullets(plans[id]),
  }));
  const ends = trialEndLabel(new Date());
  return (
    <div className="mx-auto flex w-full max-w-[1040px] flex-col gap-5 px-4 py-8 md:px-8">
      <p className="meta">Step 0 of 5 · Your plan</p>
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-[32px] leading-tight font-semibold">
          {state.hasBrand
            ? "Pick a plan to keep using Waggle"
            : "Pick a plan to start your free trial"}
        </h1>
        <p className="text-ink-2">
          {state.hasBrand
            ? `Your setup and answers are saved. Start your ${TRIAL.days}-day free trial to pick up where you left off.`
            : `${TRIAL.days} days free. We ask for a card now and charge nothing until your trial ends (${ends}). Cancel any time before and you won't pay.`}
        </p>
      </div>
      {cancelled && (
        <p
          className="border-honey-border bg-honey-tint rounded-xl border px-4 py-3 text-sm"
          role="status"
        >
          No trial started and nothing was charged. Pick a plan when you&apos;re ready.
        </p>
      )}
      <PlanCards
        orgId={org.id}
        plans={cards}
        current={null}
        currentInterval={null}
        live={false}
        mayChange
        foundingNote={`The first ${FOUNDING.spots} businesses get ${PLANS[FOUNDING.plan].name} at $${FOUNDING.monthlyUsd} a month for ${FOUNDING.months} months, then $${PLANS[FOUNDING.plan].monthlyUsd}.`}
        action={choosePlan}
        from="start"
      />
      <p className="meta">You can change plan any time in Your plan.</p>
      {state.staff && <AdminSkip orgId={org.id} />}
    </div>
  );
}

/** Waggle staff only: a dashed box that says so, with Skip for now. */
function AdminSkip({ orgId }: { orgId: string }) {
  return (
    <form
      action={skipPlanGate}
      className="border-ink-3 bg-subtle flex flex-wrap items-center gap-3 rounded-xl border border-dashed px-4 py-3"
    >
      <span className="bg-ink rounded-md px-2 py-0.5 text-[11px] font-bold tracking-wide text-white">
        ADMIN ONLY
      </span>
      <span className="text-ink-2 min-w-[220px] flex-1 text-sm">
        Only Waggle admins see this. Customers must pick a plan to continue.
      </span>
      <input type="hidden" name="orgId" value={orgId} />
      <Button type="submit" variant="secondary">
        Skip for now
      </Button>
    </form>
  );
}
