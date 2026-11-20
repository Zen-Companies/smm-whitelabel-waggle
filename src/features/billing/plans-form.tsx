"use client";

import { Check } from "lucide-react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updatePlanSettings, type PlanSettingsState } from "./actions";
import { PLAN_IDS, type Plan, type PlanId } from "./plans";

const IDS: PlanId[] = PLAN_IDS;

const SWITCHES = [
  { field: "team", label: "Team members", get: (p: Plan) => p.features.team },
  { field: "autoReply", label: "Replies on its own", get: (p: Plan) => p.features.autoReply },
  {
    field: "leadsFlagged",
    label: "Leads and complaints flagged",
    get: (p: Plan) => p.features.leadsFlagged,
  },
  {
    field: "followUps",
    label: "Follow-ups for quiet leads",
    get: (p: Plan) => p.features.followUps,
  },
  { field: "forSale", label: "For sale", get: (p: Plan) => p.forSale },
] as const;

/**
 * Staff → Plans (design "Billing round 2", approved 18 Nov): what each plan includes, one column
 * per plan, saved together. Prices are shown, not edited: they come from Stripe.
 */
export function PlanSettingsForm({ plans }: { plans: Record<PlanId, Plan> }) {
  const [state, action, pending] = useActionState<PlanSettingsState, FormData>(
    updatePlanSettings,
    {},
  );
  const cell = "border-line border-t px-4 py-2.5";
  const head = "text-ink-2 border-line border-t px-4 py-2.5";
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="card overflow-x-auto">
        {/* One label column, then one per plan (Free made it four plans, 20 Nov). */}
        <div
          className="grid min-w-[880px] text-sm"
          style={{ gridTemplateColumns: `1.4fr repeat(${IDS.length}, 1fr)` }}
        >
          <div className="px-4 py-3" />
          {IDS.map((id) => (
            <b key={id} className="px-4 py-3 font-semibold">
              {plans[id].name}
            </b>
          ))}

          <span className={head}>Price</span>
          {IDS.map((id) => (
            <span key={id} className={`${cell} text-ink-3`}>
              {id === "free" ? "Free, no card" : `$${plans[id].monthlyUsd} a month (Stripe)`}
            </span>
          ))}

          <label className={head} htmlFor="solo.accounts">
            Accounts included
          </label>
          {IDS.map((id) => (
            <span key={id} className={cell}>
              <Input
                id={`${id}.accounts`}
                name={`${id}.accounts`}
                inputMode="numeric"
                defaultValue={plans[id].accounts}
                aria-label={`${plans[id].name}: accounts included`}
                className="w-24 tabular-nums"
              />
            </span>
          ))}

          <label className={head} htmlFor="solo.replies">
            AI replies a month
          </label>
          {IDS.map((id) => (
            <span key={id} className={cell}>
              <Input
                id={`${id}.replies`}
                name={`${id}.replies`}
                inputMode="numeric"
                defaultValue={plans[id].replies}
                aria-label={`${plans[id].name}: AI replies a month`}
                className="w-24 tabular-nums"
              />
            </span>
          ))}

          <label className={head} htmlFor="solo.brands">
            Businesses (brands)
          </label>
          {IDS.map((id) => (
            <span key={id} className={cell}>
              <Input
                id={`${id}.brands`}
                name={`${id}.brands`}
                inputMode="numeric"
                defaultValue={plans[id].brands ?? ""}
                placeholder="Unlimited"
                aria-label={`${plans[id].name}: businesses`}
                className="w-28 tabular-nums"
              />
            </span>
          ))}

          {SWITCHES.map((s) => (
            <div key={s.field} className="contents">
              <span className={head}>{s.label}</span>
              {IDS.map((id) => (
                <span key={id} className={cell}>
                  <label className="inline-flex min-h-9 cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      name={`${id}.${s.field}`}
                      defaultChecked={s.get(plans[id])}
                      className="accent-honey size-5"
                    />
                    <span className="sr-only">
                      {plans[id].name}: {s.label}
                    </span>
                  </label>
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-3">
        {state.saved && !pending && (
          <span role="status" className="meta inline-flex items-center gap-1">
            <Check className="text-success size-4" strokeWidth={1.75} aria-hidden />
            Saved. Every organization on these plans gets the change now.
          </span>
        )}
        {state.error && (
          <span role="alert" className="text-danger text-sm">
            {state.error}
          </span>
        )}
        <Button type="submit" variant="primary" disabled={pending} data-busy={pending || undefined}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
