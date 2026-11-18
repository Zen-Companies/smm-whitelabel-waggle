// Which CRM events a Stripe subscription change means (docs/ghl-plan.md). Pure: compares the bill
// stored before the event with the one after it, so the Stripe webhook only adds queue rows.

import type { CrmEvent } from "./catalog";

export interface BillState {
  status: string | null;
  /** Waggle's plan id (solo / business / team), not the name. */
  plan: string | null;
  cancel_at_period_end: boolean;
}

export interface LifecycleEvent {
  event: CrmEvent;
  details: Record<string, string | boolean>;
}

const LIVE = new Set(["trialing", "active", "past_due"]);
const ENDED = new Set(["canceled", "incomplete_expired", "unpaid"]);

export function lifecycleEvents(
  before: BillState | null,
  after: BillState,
  /** Whether the organization ever paid (a trial_converted was queued before). */
  hasPaid: boolean,
): LifecycleEvent[] {
  const out: LifecycleEvent[] = [];
  const wasLive = !!before && LIVE.has(before.status ?? "");
  const was = before?.status;

  // Starts.
  if (!wasLive && after.status === "trialing") out.push({ event: "trial_started", details: {} });
  // The first payment: straight after the trial, with no trial, or after a first failed try.
  if (
    after.status === "active" &&
    (was === "trialing" || !wasLive || (was === "past_due" && !hasPaid))
  ) {
    out.push({ event: "trial_converted", details: {} });
  }

  // Payments.
  if (wasLive && was !== "past_due" && after.status === "past_due") {
    out.push({ event: "payment_failed", details: {} });
  }
  if (was === "past_due" && after.status === "active") {
    out.push({ event: "payment_recovered", details: {} });
  }

  // Plan.
  if (
    wasLive &&
    LIVE.has(after.status ?? "") &&
    before!.plan &&
    after.plan &&
    before!.plan !== after.plan
  ) {
    out.push({ event: "plan_changed", details: { from_plan: before!.plan } });
  }

  // The owner asks to cancel (it runs to the period's end): the cancel emails start now.
  if (LIVE.has(after.status ?? "") && after.cancel_at_period_end && !before?.cancel_at_period_end) {
    out.push({
      event: "canceled",
      details: { after_paying: hasPaid || after.status !== "trialing" },
    });
  }

  // It ended. A cancel the owner asked for was already sent above.
  if (wasLive && ENDED.has(after.status ?? "") && !before!.cancel_at_period_end) {
    if (hasPaid) out.push({ event: "canceled", details: { after_paying: true } });
    else out.push({ event: "trial_expired", details: {} });
  }
  return out;
}
