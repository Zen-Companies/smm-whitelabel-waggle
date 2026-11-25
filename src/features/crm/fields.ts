// The contact fields one event sends (Walter's rule: every field, every time). Pure: the loader
// (snapshot.ts) gathers the facts, this turns them into HighLevel's strings.

import { PLANS, isPlanId } from "@/features/billing";
import {
  readableDay,
  referralRewardedFields,
  type CrmConnectField,
  type CrmEvent,
  type CrmField,
} from "@/lib/crm";

export interface CrmSnapshot {
  event: CrmEvent;
  eventAt: Date;
  /** Event-only details from the queue row. */
  details: Record<string, unknown>;
  business: string;
  /** Waggle's plan id while the plan is live, else null. */
  planId: string | null;
  status: string | null;
  trialEndsAt: string | null;
  /** The Owner's time zone (org_billing.time_zone); null: US Eastern. */
  timeZone?: string | null;
  periodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  accountsConnected: number;
  repliesUsed: number | null;
  replyLimit: number | null;
  resetsOn: Date | null;
  daysInactive: number;
}

/**
 * HighLevel's plan words: solo, team ($99), business (custom price). Careful: Waggle's ids are swapped
 * for the two upper plans (id `business` is shown as Team, id `team` as Business), so the
 * name decides, never the id.
 */
export function crmPlan(planId: string | null | undefined): string {
  return planId && isPlanId(planId) ? PLANS[planId].name.toLowerCase() : "";
}

const day = (v: string | Date | null | undefined) => {
  if (!v) return "";
  const d = typeof v === "string" ? new Date(v) : v;
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
};

const iso = (v: string | null) => {
  if (!v) return "";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
};

/** When access ends: the period's (or trial's) end once a cancel is asked for or done. */
function endsOn(s: CrmSnapshot): string {
  const ending = s.cancelAtPeriodEnd || s.status === "canceled" || s.event === "trial_expired";
  if (!ending) return "";
  return day(
    s.status === "trialing" ? (s.trialEndsAt ?? s.periodEnd) : (s.periodEnd ?? s.trialEndsAt),
  );
}

const text = (v: unknown) => (typeof v === "string" || typeof v === "number" ? String(v) : "");

/** `connect_failed` only (Fix 1, 24 Nov): what stopped the connect. */
function connectFields(s: CrmSnapshot): Partial<Record<CrmConnectField, string>> {
  if (s.event !== "connect_failed") return {};
  return {
    waggle_connect_platform: text(s.details.connect_platform),
    waggle_connect_error: text(s.details.connect_error),
    waggle_connect_fixable: text(s.details.connect_fixable) || "unknown",
    waggle_connect_in_app: text(s.details.connect_in_app) || "no",
  };
}

export function crmFields(
  s: CrmSnapshot,
): Record<CrmField, string> & Partial<Record<CrmConnectField, string>> {
  return {
    ...connectFields(s),
    waggle_event: s.event,
    waggle_event_at: s.eventAt.toISOString(),
    // referral_rewarded names the plan its month was applied to (queued with the event).
    waggle_plan: crmPlan(
      s.event === "referral_rewarded" && text(s.details.plan) ? text(s.details.plan) : s.planId,
    ),
    waggle_from_plan: crmPlan(text(s.details.from_plan)),
    // The founding offer is retired (Pricing Bible, 24 Nov): always "false", kept because
    // Walter's workflow expects every field on every event.
    waggle_founding: "false",
    // "December 24" for an email, and the exact time for HighLevel's own reminder (25 Nov).
    waggle_trial_ends: readableDay(s.trialEndsAt, s.timeZone ?? undefined),
    waggle_trial_ends_at: iso(s.trialEndsAt),
    waggle_ends_on: endsOn(s),
    waggle_platform: text(s.details.platform),
    waggle_accounts_connected: String(s.accountsConnected),
    waggle_days_inactive: String(
      typeof s.details.days_inactive === "number" ? s.details.days_inactive : s.daysInactive,
    ),
    waggle_replies_used: s.repliesUsed === null ? "" : String(s.repliesUsed),
    waggle_reply_limit: s.replyLimit === null ? "" : String(s.replyLimit),
    waggle_resets_on: day(s.resetsOn),
    waggle_business: s.business,
    ...(s.event === "referral_rewarded"
      ? referralRewardedFields(s.details)
      : referralRewardedFields({})),
  };
}
