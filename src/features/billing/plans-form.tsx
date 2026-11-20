"use client";

import { Check } from "lucide-react";
import { useActionState, useState } from "react";
import { Switch } from "@/components/app/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updatePlanSettings, type PlanSettingsState } from "./actions";
import { EXTRAS, FOUNDING, PLAN_IDS, type Plan, type PlanId } from "./plans";

const IDS: PlanId[] = PLAN_IDS;

type Field = "team" | "autoReply" | "leadsFlagged" | "followUps";

const INCLUDED: { field: Field; label: string; hint?: string; get: (p: Plan) => boolean }[] = [
  {
    field: "team",
    label: "Add teammates",
    hint: "Invite people with roles",
    get: (p) => p.features.team,
  },
  {
    field: "autoReply",
    label: "Replies on its own",
    hint: "Without asking the owner first",
    get: (p) => p.features.autoReply,
  },
  {
    field: "leadsFlagged",
    label: "Leads and complaints flagged",
    get: (p) => p.features.leadsFlagged,
  },
  { field: "followUps", label: "Follow-ups for quiet leads", get: (p) => p.features.followUps },
];

/** A switch that submits with the form: "on" when on, nothing when off (like a checkbox). */
function FormSwitch({ name, initial, label }: { name: string; initial: boolean; label: string }) {
  const [on, setOn] = useState(initial);
  return (
    <>
      {on && <input type="hidden" name={name} value="on" />}
      <Switch type="button" on={on} label={label} onClick={() => setOn(!on)} />
    </>
  );
}

function priceLine(id: PlanId, plan: Plan): string {
  if (id === "free") return "Free, no card";
  if (id === "team") return "By call";
  return `$${plan.monthlyUsd} a month`;
}

/**
 * Staff → Plans (canvas "Staff pages, cleaned up", approved 20 Nov): one column per plan with its
 * price and whether it's on sale under the name; rows grouped into Limits, What's included and
 * Selling, each saying what it means. Prices are shown, not edited: they're set in Stripe.
 */
export function PlanSettingsForm({
  plans,
  lastChanged,
}: {
  plans: Record<PlanId, Plan>;
  /** "20 Nov, 1:12 PM UTC by name@…", or null when nothing was changed yet. */
  lastChanged: string | null;
}) {
  const [state, action, pending] = useActionState<PlanSettingsState, FormData>(
    updatePlanSettings,
    {},
  );
  const cols = {
    gridTemplateColumns: `minmax(220px,1.3fr) repeat(${IDS.length}, minmax(140px,1fr))`,
  };
  const cell = "border-line flex items-center border-t px-4 py-3";
  const group =
    "border-line meta col-span-full border-t px-4 pt-4 pb-1.5 text-xs font-semibold tracking-wide uppercase";

  const row = (label: string, hint: string | null, cells: (id: PlanId) => React.ReactNode) => (
    <>
      <div className="border-line flex flex-col justify-center gap-0.5 border-t px-4 py-3">
        <span className="font-medium">{label}</span>
        {hint && <span className="meta text-xs">{hint}</span>}
      </div>
      {IDS.map((id) => (
        <div key={id} className={cell}>
          {cells(id)}
        </div>
      ))}
    </>
  );

  const number = (id: PlanId, field: "accounts" | "replies" | "brands", label: string) => (
    <Input
      name={`${id}.${field}`}
      inputMode="numeric"
      defaultValue={field === "brands" ? (plans[id].brands ?? "") : plans[id][field]}
      placeholder={field === "brands" ? "No limit" : undefined}
      aria-label={`${plans[id].name}: ${label}`}
      className="w-24 tabular-nums"
    />
  );

  return (
    <form action={action} className="card overflow-hidden p-0">
      <div className="overflow-x-auto">
        <div className="grid min-w-[820px] text-sm" style={cols}>
          <div />
          {IDS.map((id) => {
            const plan = plans[id];
            const onSale = id === "free" || plan.forSale;
            return (
              <div key={id} className="flex flex-col gap-1 px-4 py-4">
                <b className="font-display text-lg font-semibold">{plan.name}</b>
                <span className="text-ink-2">{priceLine(id, plan)}</span>
                <span className="flex flex-wrap gap-1.5">
                  <span
                    className={
                      onSale
                        ? "bg-success-soft text-success rounded-full px-2 py-0.5 text-xs font-semibold"
                        : "bg-subtle text-ink-2 rounded-full px-2 py-0.5 text-xs font-semibold"
                    }
                  >
                    {id === "free"
                      ? "Always on"
                      : plan.forSale
                        ? "On sale"
                        : id === "team"
                          ? "By call only"
                          : "Not on sale"}
                  </span>
                  {id === FOUNDING.plan && (
                    <span className="bg-honey-tint text-honey-text rounded-full px-2 py-0.5 text-xs font-semibold">
                      Founding ${FOUNDING.monthlyUsd}
                    </span>
                  )}
                </span>
              </div>
            );
          })}

          <div className={group}>Limits</div>
          {row("Accounts included", `Then $${EXTRAS.accountUsd} each on paid plans`, (id) =>
            number(id, "accounts", "accounts included"),
          )}
          {row(
            "AI replies a month",
            `Top-ups add ${EXTRAS.topUp.replies} for $${EXTRAS.topUp.usd}`,
            (id) => number(id, "replies", "AI replies a month"),
          )}
          {row("Businesses", "Empty means no limit", (id) => number(id, "brands", "businesses"))}

          <div className={group}>What’s included</div>
          {INCLUDED.map((s) => (
            <div key={s.field} className="contents">
              {row(s.label, s.hint ?? null, (id) => (
                <FormSwitch
                  name={`${id}.${s.field}`}
                  initial={s.get(plans[id])}
                  label={`${plans[id].name}: ${s.label}`}
                />
              ))}
            </div>
          ))}

          <div className={group}>Selling</div>
          {row("On sale", "Off hides it from owners", (id) =>
            id === "free" ? (
              // Free is always there: it's where every new owner starts.
              <>
                <input type="hidden" name="free.forSale" value="on" />
                <span className="meta">Always</span>
              </>
            ) : (
              <FormSwitch
                name={`${id}.forSale`}
                initial={plans[id].forSale}
                label={`${plans[id].name}: on sale`}
              />
            ),
          )}
        </div>
      </div>
      <div className="border-line bg-subtle flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3.5">
        <span className="meta">
          {state.saved && !pending ? (
            <span role="status" className="inline-flex items-center gap-1">
              <Check className="text-success size-4" strokeWidth={1.75} aria-hidden />
              Saved. Every business on these plans gets the change now.
            </span>
          ) : state.error ? (
            <span role="alert" className="text-danger">
              {state.error}
            </span>
          ) : (
            <>
              {lastChanged ? `Last changed ${lastChanged} · ` : ""}Changes reach every business on
              that plan right away.
            </>
          )}
        </span>
        <Button type="submit" variant="primary" disabled={pending} data-busy={pending || undefined}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
