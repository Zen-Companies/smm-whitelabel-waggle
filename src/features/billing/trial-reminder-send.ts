import "server-only";
import * as Sentry from "@sentry/nextjs";
import type Stripe from "stripe";
import { unconfirmedUserIds } from "@/lib/email/confirmations";
import type { Mailer } from "@/lib/email/mailer";
import type { ServiceClient } from "@/lib/supabase/service";
import { storedTrialDays } from "./plans";
import { billingFromSubscription } from "./subscription";
import { reminderEmail, trialReminderRow } from "./trial-reminder";

// The reminder before the first charge (Pricing Bible, 24 Nov). Stripe sends
// customer.subscription.trial_will_end 3 days before a trial ends: the webhook only stores a
// trial_reminders row (queueTrialReminder, rule 3), and the jobs route emails the organization's
// Owner(s) here, once per subscription. Ids and counts only in logs (rule 10).

/** Reminders looked at per run. */
const PER_RUN = 20;

/** Stripe webhook (database only): one row per subscription; a repeat changes nothing. */
export async function queueTrialReminder(
  db: ServiceClient,
  orgId: string,
  sub: Stripe.Subscription,
): Promise<string> {
  const row = trialReminderRow(orgId, billingFromSubscription(sub), sub);
  if (!row) return "";
  const { data, error } = await db
    .from("trial_reminders")
    .upsert(row, { onConflict: "stripe_subscription_id", ignoreDuplicates: true })
    .select("stripe_subscription_id");
  if (error) throw new Error(`billing: queueing the trial reminder failed: ${error.message}`);
  return data?.length ? "trial reminder queued" : "";
}

export interface TrialReminderDeps {
  db: ServiceClient;
  mailer: Mailer;
  appUrl: string;
  now?: Date;
  shouldContinue: () => boolean;
}

export interface TrialReminderSummary {
  sent: number;
  skipped: number;
  failed: number;
}

type Reminder = {
  stripe_subscription_id: string;
  organization_id: string;
  plan: string;
  billing_interval: string;
  amount_cents: number;
  charge_at: string;
};

async function settle(
  db: ServiceClient,
  id: string,
  from: string,
  patch: { status: "skipped" | "sent" | "queued"; reason?: string; sent_at?: string },
) {
  const { error } = await db
    .from("trial_reminders")
    .update(patch)
    .eq("stripe_subscription_id", id)
    .eq("status", from);
  if (error) throw new Error(`trial reminder: saving failed: ${error.message}`);
}

/** A reminder not sent, and why, in the organization's audit (CLAUDE.md rule 11). */
async function skip(db: ServiceClient, r: Reminder, reason: string): Promise<"skipped"> {
  await settle(db, r.stripe_subscription_id, "queued", { status: "skipped", reason });
  const { error } = await db.from("organization_audit").insert({
    organization_id: r.organization_id,
    action: "billing.trial_reminder_skipped",
    actor: "system",
    details: { subscription: r.stripe_subscription_id, reason },
  });
  if (error) throw new Error(`trial reminder: auditing the skip failed: ${error.message}`);
  return "skipped";
}

async function handle(
  deps: TrialReminderDeps,
  r: Reminder,
  now: Date,
): Promise<"sent" | "skipped"> {
  const { db } = deps;
  const id = r.stripe_subscription_id;
  // Still the organization's running trial, not set to cancel, and not charged yet.
  const { data: bill, error: billErr } = await db
    .from("org_billing")
    .select("stripe_subscription_id, status, cancel_at_period_end, trial_ends_at, trial_days")
    .eq("organization_id", r.organization_id)
    .maybeSingle();
  if (billErr) throw new Error(`trial reminder: reading the bill failed: ${billErr.message}`);
  const reason =
    !bill || bill.stripe_subscription_id !== id || bill.status !== "trialing"
      ? "not_trialing"
      : bill.cancel_at_period_end
        ? "cancelling"
        : Date.parse(r.charge_at) <= now.getTime()
          ? "too_late"
          : null;
  if (reason) return skip(db, r, reason);

  const [{ data: org }, { data: team, error: teamErr }] = await Promise.all([
    db.from("organizations").select("name").eq("id", r.organization_id).maybeSingle(),
    db.rpc("organization_team", { p_org: r.organization_id }),
  ]);
  if (teamErr) throw new Error(`trial reminder: reading the team failed: ${teamErr.message}`);
  const owners = (team ?? []).filter((m) => m.role === "owner" && m.email);
  const unconfirmed = await unconfirmedUserIds(
    db,
    owners.map((o) => o.user_id),
  );
  const to = owners.filter((o) => !unconfirmed.has(o.user_id));
  if (!to.length) return skip(db, r, "no_owner");

  // Claim: one run sends it.
  const { data: claimed, error: claimErr } = await db
    .from("trial_reminders")
    .update({ status: "sending" })
    .eq("stripe_subscription_id", id)
    .eq("status", "queued")
    .select("stripe_subscription_id");
  if (claimErr) throw new Error(`trial reminder: claiming failed: ${claimErr.message}`);
  if (!claimed?.length) return "skipped";

  try {
    for (const owner of to) {
      const email = reminderEmail({
        firstName: owner.full_name?.trim().split(/\s+/)[0] || null,
        orgName: org?.name ?? "your organization",
        plan: r.plan,
        interval: r.billing_interval,
        amountCents: r.amount_cents,
        chargeAt: r.charge_at,
        appUrl: deps.appUrl,
        trialDays: storedTrialDays(bill),
      });
      await deps.mailer.send({
        to: [owner.email],
        ...email,
        // A retry after a lost response doesn't send twice.
        idempotencyKey: `trial-reminder:${id}:${owner.user_id}`,
      });
    }
  } catch (error) {
    // Hand it back: the next run retries, and the idempotency key keeps anyone who already got
    // it from getting it twice.
    await settle(db, id, "sending", { status: "queued" });
    throw error;
  }
  await settle(db, id, "sending", { status: "sent", sent_at: new Date().toISOString() });
  await db.from("organization_audit").insert({
    organization_id: r.organization_id,
    action: "billing.trial_reminder_sent",
    actor: "system",
    details: { subscription: id, recipients: to.length, amountCents: r.amount_cents },
  });
  return "sent";
}

/** Jobs route: the reminders Stripe's trial_will_end queued, emailed to the Owner(s) once. */
export async function sendTrialReminders(deps: TrialReminderDeps): Promise<TrialReminderSummary> {
  const summary: TrialReminderSummary = { sent: 0, skipped: 0, failed: 0 };
  const now = deps.now ?? new Date();
  const { data, error } = await deps.db
    .from("trial_reminders")
    .select(
      "stripe_subscription_id, organization_id, plan, billing_interval, amount_cents, charge_at",
    )
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(PER_RUN);
  if (error) throw new Error(`trial reminder: reading the queue failed: ${error.message}`);
  for (const r of data ?? []) {
    if (!deps.shouldContinue()) break;
    try {
      const outcome = await handle(deps, r, now);
      summary[outcome] += 1;
    } catch (e) {
      summary.failed += 1;
      Sentry.captureException(e, { extra: { subscription: r.stripe_subscription_id } });
    }
  }
  return summary;
}
