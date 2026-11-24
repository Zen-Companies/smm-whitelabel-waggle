"use client";

import { useActionState, useState } from "react";
import { cn } from "cn";
import { PlanBees } from "@/components/app/bee-plan";
import { BeeDance } from "@/components/app/bee-setup";
import { Button, buttonVariants } from "@/components/ui/button";
import type { PlanActionState } from "./plan-actions";
import { DayPill } from "./day-price";
import {
  BUSINESS_CALL_URL,
  dailyAmount,
  isCustomPrice,
  PROMOTED_PLAN,
  TRIAL,
  type PlanId,
} from "./plans";

type Action = (prev: PlanActionState, formData: FormData) => Promise<PlanActionState>;

/** One button that runs a plan action, with its result said in place (no toasts). */
export function PlanButton({
  action,
  fields,
  label,
  pendingLabel = "One moment…",
  honey = false,
  quiet = false,
  className,
}: {
  action: Action;
  fields: Record<string, string>;
  label: string;
  pendingLabel?: string;
  honey?: boolean;
  quiet?: boolean;
  className?: string;
}) {
  const [state, run, pending] = useActionState(action, {});
  return (
    <form action={run} className={cn("flex flex-col items-end gap-1", className)}>
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <Button
        type="submit"
        variant={quiet ? "quiet" : honey ? "primary" : "secondary"}
        disabled={pending}
        data-busy={pending || undefined}
      >
        {pending ? pendingLabel : label}
      </Button>
      {state.error && (
        <span role="alert" className="text-danger text-right text-xs">
          {state.error}
        </span>
      )}
      {state.done && <span className="text-ink-2 text-right text-xs">{state.done}</span>}
    </form>
  );
}

export interface PlanCardData {
  id: PlanId;
  name: string;
  monthlyUsd: number;
  yearlyUsd: number | null;
  forSale: boolean;
  bullets: string[];
  /** Business's line: "Custom price · 10+ accounts · about 1,500 replies". */
  customLine?: string;
}

/**
 * The plans (Walter's flow, 20 Nov; Pricing Bible, 24 Nov): Free as a wide row on top, then Solo
 * ("Most popular", PROMOTED_PLAN), Team and Business. Solo and Team show their price a day;
 * Business is a custom price set on a call: "Talk to us" opens Jason's booking page, never a
 * checkout. The current plan is in honey. Monthly or yearly is picked once above the cards.
 * `trial`: the first paid plan starts with its first month free, with a card.
 */
export function PlanCards({
  orgId,
  plans,
  current,
  currentInterval,
  live,
  mayChange,
  note = null,
  trial = false,
  trialDays = TRIAL.days,
  freeLine = null,
  action,
}: {
  orgId: string;
  plans: PlanCardData[];
  /** The organization's plan id ("free" when it has no paid plan). */
  current: string | null;
  currentInterval: "month" | "year" | null;
  /** On a paid plan (moves are prorated in place). */
  live: boolean;
  mayChange: boolean;
  /** A line next to Monthly / Yearly. */
  note?: string | null;
  /** The organization's first paid plan starts with a free trial. */
  trial?: boolean;
  /** How long: the first month (30 days), more with banked referral months. */
  trialDays?: number;
  /** Free's row when it's the plan: "12 of 100 AI replies used this month". */
  freeLine?: string | null;
  action: Action;
}) {
  const [interval, setInterval] = useState<"month" | "year">(currentInterval ?? "month");
  const free = plans.find((p) => p.id === "free");
  const paid = plans.filter((p) => p.id !== "free");
  return (
    <div className="flex flex-col gap-4">
      {free && (
        <section
          aria-label={`${free.name} plan`}
          className={cn(
            "bg-surface relative flex flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl border p-5",
            current === "free"
              ? "border-honey border-2 shadow-[0_6px_24px_rgba(246,178,27,0.18)]"
              : "border-line",
          )}
        >
          {current === "free" && (
            <span className="bg-honey text-ink absolute -top-3 left-5 rounded-full px-2.5 py-0.5 text-xs font-semibold">
              Your plan
            </span>
          )}
          <span className="flex flex-col">
            <b className="font-display text-[22px] font-semibold">{free.name}</b>
            <b className="text-lg font-semibold">$0</b>
          </span>
          <ul className="flex min-w-[200px] flex-1 flex-wrap gap-x-5 gap-y-1.5 text-sm">
            {free.bullets.map((b) => (
              <li key={b} className="flex items-start gap-2">
                <span aria-hidden className="text-honey">
                  ⬢
                </span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
          <span className="meta">
            {current === "free"
              ? (freeLine ?? "No card, no time limit.")
              : "Cancel your plan in Stripe to go back to Free."}
          </span>
        </section>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="radiogroup"
          aria-label="Pay monthly or yearly"
          className="bg-subtle inline-flex rounded-full p-1"
        >
          {(["month", "year"] as const).map((i) => (
            <button
              key={i}
              type="button"
              role="radio"
              aria-checked={interval === i}
              onClick={() => setInterval(i)}
              className={cn(
                "min-h-9 rounded-full px-4 text-sm font-medium",
                interval === i ? "bg-ink text-white" : "text-ink-2",
              )}
            >
              {i === "month" ? "Monthly" : "Yearly · 2 months free"}
            </button>
          ))}
        </div>
        {note && <span className="meta">{note}</span>}
      </div>
      <div className="grid gap-4 pt-3 md:grid-cols-3">
        {paid.map((p) => {
          // Business: a custom price set on a call, never a checkout (24 Nov).
          const byCall = isCustomPrice(p.id);
          const isCurrent = live && current === p.id && (byCall || currentInterval === interval);
          const yearly = interval === "year" && p.yearlyUsd !== null;
          const noYearly = interval === "year" && p.yearlyUsd === null;
          const promoted = p.id === PROMOTED_PLAN && !live;
          // What the card says it costs, and the same as a price a day (decision 4).
          const shownUsd = yearly ? p.yearlyUsd! : p.monthlyUsd;
          const price = yearly ? `$${shownUsd} a year` : `$${shownUsd} a month`;
          return (
            <div
              key={p.id}
              className={cn(
                "bg-surface relative flex flex-col gap-2.5 rounded-2xl border p-5",
                isCurrent || promoted
                  ? "border-honey border-2 shadow-[0_6px_24px_rgba(246,178,27,0.18)]"
                  : "border-line",
              )}
            >
              {isCurrent ? (
                <span className="bg-honey text-ink absolute -top-3 left-5 rounded-full px-2.5 py-0.5 text-xs font-semibold">
                  Your plan
                </span>
              ) : (
                promoted && (
                  <span className="bg-honey text-ink absolute -top-3 left-5 rounded-full px-2.5 py-0.5 text-xs font-semibold">
                    Most popular
                  </span>
                )
              )}
              <PlanBees plan={p.id} />
              <b className="font-display text-[22px] font-semibold">{p.name}</b>
              {byCall ? (
                <span className="flex flex-col">
                  <b className="text-lg font-semibold">Custom price</b>
                  <span className="meta">
                    {p.customLine ?? "Custom price, set with you on a short call"}
                  </span>
                </span>
              ) : (
                <b className="text-lg font-semibold">{price}</b>
              )}
              {!byCall && <DayPill amount={dailyAmount(shownUsd, yearly ? "year" : "month")} />}
              {!byCall && trial && !live && p.forSale && !noYearly && (
                <span className="meta">
                  {trialDays === TRIAL.days ? "First month free" : `${trialDays} days free`}, then{" "}
                  {price}
                </span>
              )}
              <ul className="flex flex-col gap-2 text-sm">
                {p.bullets.map((b) => (
                  <li key={b} className="flex items-start gap-2">
                    <span aria-hidden className="text-honey">
                      ⬢
                    </span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-auto pt-2">
                {isCurrent ? (
                  <span className="meta">You’re on this plan.</span>
                ) : byCall ? (
                  <a
                    href={BUSINESS_CALL_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={buttonVariants({ variant: "secondary" })}
                  >
                    Talk to us
                  </a>
                ) : !p.forSale ? (
                  <span className="meta">Not for sale right now.</span>
                ) : noYearly ? (
                  <span className="meta">Monthly only for now.</span>
                ) : mayChange ? (
                  <PlanButton
                    action={action}
                    fields={{ orgId, plan: p.id, interval }}
                    label={
                      live
                        ? `Move to ${p.name}`
                        : trial
                          ? trialDays === TRIAL.days
                            ? "Start your free month"
                            : `Start ${trialDays} days free`
                          : `Upgrade to ${p.name}`
                    }
                    pendingLabel={live ? "Switching…" : "Starting…"}
                    honey={promoted}
                    className="items-start"
                  />
                ) : (
                  <span className="meta">The Owner changes the plan.</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {trial && !live && (
        <p className="meta">
          Solo and Team start with{" "}
          {trialDays === TRIAL.days ? "your first month free" : `${trialDays} days free`}. A card
          starts it; we email you 3 days before the first charge, and if you cancel before then you
          pay nothing.
        </p>
      )}
    </div>
  );
}

/**
 * One-click top-up (design "Billing round 2", approved 18 Nov): "Buy 200 more" asks in place
 * "Charge $15 to your Visa ending 4242?"; confirming charges the card on the plan right away.
 * Without a saved card the action opens Stripe's page instead. The bee flies once when added.
 */
export function TopUpButton({
  orgId,
  card,
  label,
  usd,
  replies,
  honey = false,
  action,
}: {
  orgId: string;
  /** "Visa ending 4242", or null when it couldn't be read. */
  card: string | null;
  label: string;
  usd: number;
  replies: number;
  honey?: boolean;
  action: Action;
}) {
  const [nonce, setNonce] = useState<string | null>(null);
  const [state, run, pending] = useActionState(action, {});
  // After a decline the next try is a new charge: ask again with a new key.
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state.fresh) setNonce(null);
  }
  if (state.done) {
    return (
      <span role="status" className="flex items-center gap-2 text-sm">
        <BeeDance scale={0.25} />
        <span>
          <b>{state.done}</b>
        </span>
      </span>
    );
  }
  if (!nonce) {
    return (
      <div className="flex flex-col items-start gap-1">
        <Button
          type="button"
          variant={honey ? "primary" : "secondary"}
          onClick={() => setNonce(crypto.randomUUID())}
        >
          {label}
        </Button>
        {state.error && (
          <span role="alert" className="text-danger text-xs">
            {state.error}
          </span>
        )}
      </div>
    );
  }
  return (
    <form
      action={run}
      className="border-honey-border bg-honey-tint flex flex-wrap items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5"
    >
      <input type="hidden" name="orgId" value={orgId} />
      <input type="hidden" name="nonce" value={nonce} />
      <span className="text-sm">
        <b>
          Charge ${usd} to {card ? `your ${card}` : "the card on your plan"}?
        </b>{" "}
        {replies} more replies, added right away.
      </span>
      <span className="flex gap-2">
        <Button type="button" variant="quiet" onClick={() => setNonce(null)} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={pending} data-busy={pending || undefined}>
          {pending ? "Charging…" : `Charge $${usd}`}
        </Button>
      </span>
      {state.error && (
        <span role="alert" className="text-danger basis-full text-xs">
          {state.error}
        </span>
      )}
    </form>
  );
}
