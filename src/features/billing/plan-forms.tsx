"use client";

import { useActionState, useState } from "react";
import { cn } from "cn";
import { PlanBees } from "@/components/app/bee-plan";
import { BeeDance } from "@/components/app/bee-setup";
import { Button, buttonVariants } from "@/components/ui/button";
import type { PlanActionState } from "./plan-actions";
import { BUSINESS_CALL_URL, PROMOTED_PLAN, type PlanId } from "./plans";

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
}

/**
 * The plans side by side (Free plan, approved 20 Nov): Free first, then Solo (promoted), Team
 * and Business. Business is by call only: its button opens Jason's booking page. The current plan
 * is in honey. Monthly or yearly is picked once above the cards.
 */
export function PlanCards({
  orgId,
  plans,
  current,
  currentInterval,
  live,
  mayChange,
  foundingNote,
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
  foundingNote: string | null;
  action: Action;
}) {
  const [interval, setInterval] = useState<"month" | "year">(currentInterval ?? "month");
  return (
    <div className="flex flex-col gap-4">
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
        {foundingNote && <span className="meta">{foundingNote}</span>}
      </div>
      <div className="grid gap-4 pt-3 md:grid-cols-2 xl:grid-cols-4">
        {plans.map((p) => {
          const free = p.id === "free";
          const byCall = p.id === "team" && !p.forSale;
          const isCurrent = free
            ? current === "free"
            : live && current === p.id && currentInterval === interval;
          const price = free
            ? "$0 forever"
            : interval === "year" && p.yearlyUsd !== null
              ? `$${p.yearlyUsd} a year`
              : `$${p.monthlyUsd} a month`;
          const noYearly = !free && interval === "year" && p.yearlyUsd === null;
          const promoted = p.id === PROMOTED_PLAN && !live;
          return (
            <div
              key={p.id}
              className={cn(
                "bg-surface relative flex flex-col gap-2.5 rounded-2xl border p-5",
                isCurrent
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
                  <span className="bg-ink absolute -top-3 left-5 rounded-full px-2.5 py-0.5 text-xs font-semibold text-white">
                    Most picked
                  </span>
                )
              )}
              <PlanBees plan={p.id} />
              <b className="font-display text-[22px] font-semibold">{p.name}</b>
              {byCall ? (
                <span className="flex flex-col">
                  <b className="text-lg font-semibold">Priced for you</b>
                  <span className="meta">10 or more accounts, after a short call</span>
                </span>
              ) : (
                <b className="text-lg font-semibold">
                  {noYearly ? `$${p.monthlyUsd} a month` : price}
                </b>
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
                  <span className="meta">
                    {free ? "You’re on Free. No card, no time limit." : "You’re on this plan."}
                  </span>
                ) : byCall ? (
                  <a
                    href={BUSINESS_CALL_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={buttonVariants({ variant: "secondary" })}
                  >
                    Book a call
                  </a>
                ) : free ? (
                  <span className="meta">Cancel your plan in Stripe to go back to Free.</span>
                ) : !p.forSale ? (
                  <span className="meta">Not for sale right now.</span>
                ) : noYearly ? (
                  <span className="meta">Monthly only for now.</span>
                ) : mayChange ? (
                  <PlanButton
                    action={action}
                    fields={{ orgId, plan: p.id, interval }}
                    label={live ? `Move to ${p.name}` : `Upgrade to ${p.name}`}
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
