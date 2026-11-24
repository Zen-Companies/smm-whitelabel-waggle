// The reminder before the first charge (Pricing Bible, 24 Nov: "reminder before first charge +
// billing date shown in app"). Pure: the date and amount as Waggle says them, the row the Stripe
// webhook stores, and the email the jobs route sends.

import { brandedEmail, brandedText, detailRows, paragraph } from "@/lib/email/frame";
import { isPaidPlanId, PLANS, type PaidPlanId } from "./plans";
import type { BillingRow } from "./subscription";

/** "December 24": the day Stripe charges (dates are stored in UTC, like the rest of Your plan). */
export function chargeDay(at: Date | string): string {
  return new Date(at).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** "$49", or "$49.50" when there are cents. */
export function dollars(cents: number): string {
  const usd = Math.max(0, cents) / 100;
  return Number.isInteger(usd) ? `$${usd.toLocaleString("en-US")}` : `$${usd.toFixed(2)}`;
}

/** Pure: Your plan's header and the trial bar: "First charge: December 24 ($49)". */
export function firstChargeLine(chargeAt: Date | string, cents: number): string {
  return `First charge: ${chargeDay(chargeAt)} (${dollars(cents)})`;
}

/** The few fields of a Stripe subscription item this needs. */
export interface ChargeItems {
  items: {
    data: Array<{ quantity?: number | null; price: { unit_amount?: number | null } }>;
  };
}

/** Pure: what the subscription's first invoice charges, before any credit: every item's price. */
export function subscriptionChargeCents(sub: ChargeItems): number {
  return sub.items.data.reduce(
    (sum, i) => sum + Math.max(0, i.price.unit_amount ?? 0) * Math.max(1, i.quantity ?? 1),
    0,
  );
}

export interface TrialReminderRow {
  stripe_subscription_id: string;
  organization_id: string;
  plan: PaidPlanId;
  billing_interval: "month" | "year";
  amount_cents: number;
  charge_at: string;
}

/**
 * Pure: the row Stripe's trial_will_end stores (one per subscription), or null when there's
 * nothing to remind: not a running trial of a Waggle plan, or it is already set to cancel.
 */
export function trialReminderRow(
  orgId: string,
  row: Pick<
    BillingRow,
    | "stripe_subscription_id"
    | "plan"
    | "billing_interval"
    | "status"
    | "trial_ends_at"
    | "cancel_at_period_end"
  >,
  sub: ChargeItems,
): TrialReminderRow | null {
  if (row.status !== "trialing" || !row.trial_ends_at || row.cancel_at_period_end) return null;
  if (!isPaidPlanId(row.plan)) return null;
  return {
    stripe_subscription_id: row.stripe_subscription_id,
    organization_id: orgId,
    plan: row.plan,
    billing_interval: row.billing_interval === "year" ? "year" : "month",
    amount_cents: subscriptionChargeCents(sub),
    charge_at: row.trial_ends_at,
  };
}

export interface ReminderEmailInput {
  firstName: string | null;
  orgName: string;
  plan: string;
  interval: string;
  amountCents: number;
  chargeAt: string;
  appUrl: string;
}

/** Pure: the email to each Owner: plan, amount, the charge date, and how to change or cancel. */
export function reminderEmail(input: ReminderEmailInput): {
  subject: string;
  text: string;
  html: string;
} {
  const planName = isPaidPlanId(input.plan) ? PLANS[input.plan].name : "your plan";
  const when = chargeDay(input.chargeAt);
  const amount = dollars(input.amountCents);
  const every = input.interval === "year" ? "year" : "month";
  const subject = `Your free month ends soon: ${amount} on ${when}`;
  const hello = input.firstName ? `Hi ${input.firstName}.` : "Hi.";
  const lead = `${hello} Your free month of Waggle ${planName} ends soon. On ${when} your card is charged ${amount}, then every ${every}.`;
  const keep = "Nothing to do to keep it: Waggle keeps answering as it does now.";
  const change = `To change your plan or cancel, open Your plan before ${when}. Cancel before then and you pay nothing.`;
  const base = input.appUrl.replace(/\/$/, "");
  const button = { href: `${base}/plan`, label: "Open Your plan" };
  const because = `the Owner of ${input.orgName}`;
  const rows: [string, string][] = [
    ["Plan", `${planName} (${every === "year" ? "yearly" : "monthly"})`],
    ["First charge", when],
    ["Amount", amount],
  ];
  const html = brandedEmail({
    eyebrow: { text: "Before your first charge", tone: "honey" },
    title: subject,
    bodyHtml: paragraph(lead) + detailRows(rows) + paragraph(keep) + paragraph(change),
    button,
    businessName: input.orgName,
    because,
    settingsUrl: null,
    preheader: `${planName}: ${amount} on ${when}. Change or cancel any time before then.`,
  });
  const text = brandedText({
    title: subject,
    lines: [lead, "", ...rows.map(([k, v]) => `${k}: ${v}`), "", keep, change],
    button,
    because,
  });
  return { subject, text, html };
}
