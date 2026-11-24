import { queueUsageCharge } from "./usage-charges";
import "server-only";
import type Stripe from "stripe";
import { writeAudit } from "@/lib/audit";
import { lifecycleEvents, organizationHasPaid, queueForOwners, queueQuietly } from "@/lib/crm";
import { monthStart } from "@/lib/llm/spend";
import type { Database } from "@/lib/supabase/database.types";
import type { ServiceClient } from "@/lib/supabase/service";
import { EXTRAS } from "./plans";
import { earnsReferralReward, referralPlanQualifies } from "./referral-code";
import { markBankedUsed, markReferralRewardDue, queueReferralMonthsApplied } from "./referrals";
import { billingFromSubscription, carriedReplies, planIsLive } from "./subscription";
import { queueTrialReminder } from "./trial-reminder-send";

// The organization's bill as Waggle stores it (org_billing, reply_top_ups), and the Stripe events
// that keep it current. Database only: no calls to Stripe here.

export type BillingRecord = Database["public"]["Tables"]["org_billing"]["Row"];

export async function loadBilling(db: ServiceClient, orgId: string): Promise<BillingRecord | null> {
  const { data, error } = await db
    .from("org_billing")
    .select("*")
    .eq("organization_id", orgId)
    .maybeSingle();
  if (error) throw new Error(`billing: reading the bill failed: ${error.message}`);
  return data;
}

/** The brand an organization-level audit row is written against (audit_log is per brand). */
export async function auditBrand(db: ServiceClient, orgId: string): Promise<string | null> {
  const { data } = await db
    .from("tenants")
    .select("id")
    .eq("organization_id", orgId)
    .is("offboarded_at", null)
    .order("created_at", { ascending: true })
    .limit(1);
  return data?.[0]?.id ?? null;
}

export async function auditOrg(
  db: ServiceClient,
  orgId: string,
  action: string,
  actor: string,
  details: Record<string, string | number | boolean | null> = {},
): Promise<void> {
  const tenantId = await auditBrand(db, orgId);
  if (tenantId) await writeAudit(db, { tenantId, action, actor, details: { ...details, orgId } });
}

/** AI replies sent between two dates across an organization's brands (only sent ones count). */
export async function countOrgReplies(
  db: ServiceClient,
  orgId: string,
  from: Date,
  to: Date,
): Promise<number> {
  const { data: brands } = await db.from("tenants").select("id").eq("organization_id", orgId);
  const ids = (brands ?? []).map((b) => b.id);
  if (ids.length === 0) return 0;
  const { count, error } = await db
    .from("drafts")
    .select("id", { count: "exact", head: true })
    .in("tenant_id", ids)
    .eq("owner_written", false)
    .gte("sent_at", from.toISOString())
    .lt("sent_at", to.toISOString());
  if (error) throw new Error(`billing: counting replies failed: ${error.message}`);
  return count ?? 0;
}

export interface TopUps {
  thisMonth: number;
  automaticThisMonth: number;
  carried: number;
}

/** This month's top-ups, and last month's unused replies carried over. */
export async function loadTopUps(
  db: ServiceClient,
  orgId: string,
  /** The plan's AI replies a month (used first, before top-ups). */
  planReplies: number,
  now: Date,
): Promise<TopUps> {
  const start = monthStart(now);
  const lastStart = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 1, 1));
  const { data } = await db
    .from("reply_top_ups")
    .select("replies, automatic, created_at")
    .eq("organization_id", orgId)
    .gte("created_at", lastStart.toISOString());
  const rows = data ?? [];
  const mine = rows.filter((r) => new Date(r.created_at) >= start);
  const last = rows.filter((r) => new Date(r.created_at) < start);
  const lastReplies = last.reduce((n, r) => n + r.replies, 0);
  const carried =
    lastReplies === 0
      ? 0
      : carriedReplies({
          planReplies,
          topUpReplies: lastReplies,
          used: await countOrgReplies(db, orgId, lastStart, start),
        });
  return {
    thisMonth: mine.reduce((n, r) => n + r.replies, 0) / EXTRAS.topUp.replies,
    automaticThisMonth: mine.filter((r) => r.automatic).length,
    carried,
  };
}

/** The organization id a subscription belongs to: its metadata, else the stored customer. */
async function orgForCustomer(
  db: ServiceClient,
  metadataOrg: string | undefined,
  customer: string,
) {
  if (metadataOrg) return metadataOrg;
  const { data } = await db
    .from("org_billing")
    .select("organization_id")
    .eq("stripe_customer_id", customer)
    .maybeSingle();
  return data?.organization_id ?? null;
}

const customerId = (c: string | { id: string } | null) =>
  c ? (typeof c === "string" ? c : c.id) : null;

/**
 * Applies one verified Stripe event to the stored bill. Returns what it did, for the webhook
 * row. Only database writes, no calls out (CLAUDE.md rule 3).
 */
export async function applyStripeEvent(db: ServiceClient, event: Stripe.Event): Promise<string> {
  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
    case "customer.subscription.trial_will_end":
    case "customer.subscription.paused":
    case "customer.subscription.resumed": {
      const sub = event.data.object;
      const row = billingFromSubscription(sub);
      const orgId = await orgForCustomer(db, sub.metadata.organization_id, row.stripe_customer_id);
      if (!orgId) return "ignored: no organization";
      // Reminder before the first charge (Pricing Bible, 24 Nov): Stripe sends this 3 days before
      // the trial ends. Stored only; the jobs route emails the Owner(s), once per subscription.
      // Queued before the out-of-order checks below: a trial_will_end that lands after a newer
      // event is still the only one Stripe sends. Once per subscription, and the send step checks
      // the stored bill again (still trialing, not cancelling, not past the charge).
      if (event.type === "customer.subscription.trial_will_end") {
        const queued = await queueTrialReminder(db, orgId, sub);
        if (queued) {
          await auditOrg(db, orgId, "billing.trial_reminder_queued", "system", {
            subscription: sub.id,
          });
        }
      }
      const before = await loadBilling(db, orgId);
      const eventAt = new Date(event.created * 1000).toISOString();
      // Out of order: an older event never overwrites what a newer one stored.
      if (
        before?.stripe_event_at &&
        before.stripe_subscription_id === sub.id &&
        before.stripe_event_at > eventAt
      ) {
        return "ignored: older than the stored subscription";
      }
      // An old subscription's events never overwrite a newer one.
      if (
        before?.stripe_subscription_id &&
        before.stripe_subscription_id !== sub.id &&
        !planIsLive(row.status)
      ) {
        return "ignored: an older subscription";
      }
      const { error } = await db.from("org_billing").upsert(
        {
          organization_id: orgId,
          ...row,
          stripe_event_at: eventAt,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "organization_id" },
      );
      if (error) throw new Error(`billing: saving the subscription failed: ${error.message}`);
      // Usage at cost (18 Nov): a trial cancelled before its first invoice is charged its usage.
      if (
        event.type === "customer.subscription.deleted" &&
        sub.trial_start &&
        sub.trial_end &&
        sub.ended_at &&
        sub.ended_at <= sub.trial_end
      ) {
        await queueUsageCharge(db, orgId, {
          kind: "trial_end",
          start: sub.trial_start,
          end: sub.ended_at,
        });
      }
      // CRM (docs/ghl-plan.md): trial started, paid, failed, canceled… queued for the owners.
      // Database writes only; the jobs route sends them to HighLevel.
      const hasPaid =
        before && ["past_due", "canceled", "active"].includes(row.status)
          ? await organizationHasPaid(db, orgId)
          : false;
      const lifecycle = lifecycleEvents(before, row, hasPaid);
      for (const e of lifecycle) {
        await queueForOwners(db, orgId, {
          event: e.event,
          details: e.details,
          dedupeKey: `${event.id}:${e.event}`,
        });
      }
      // Give a month, get a month (GHL campaign, 24 Nov): the first plan's trial starts with the
      // friend's month or banked months, so those months are applied now (referral_rewarded).
      if (lifecycle.some((e) => e.event === "trial_started")) {
        await queueQuietly(() =>
          queueReferralMonthsApplied(db, {
            orgId,
            promo: sub.metadata.promo,
            bankedIds: sub.metadata.banked_referrals,
            trialEndsAt: row.trial_ends_at,
            plan: row.plan,
          }),
        );
      }
      if (before?.plan !== row.plan || before?.status !== row.status) {
        await auditOrg(db, orgId, "billing.subscription", "system", {
          plan: row.plan,
          status: row.status,
          was: before ? `${before.plan}/${before.status}` : null,
        });
      }
      return `subscription ${row.plan}/${row.status}`;
    }
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const s = event.data.object;
      // Referrals (23 Nov): a first plan checkout that used banked months in its trial.
      if (
        s.metadata?.kind === "plan" &&
        s.metadata.banked_referrals &&
        s.metadata.organization_id
      ) {
        return (
          (await markBankedUsed(
            db,
            s.metadata.organization_id,
            s.metadata.banked_referrals,
            s.id,
          )) || "ignored"
        );
      }
      if (s.metadata?.kind !== "top_up" || s.payment_status !== "paid") return "ignored";
      const orgId = s.metadata.organization_id;
      if (!orgId) return "ignored: no organization";
      return addTopUp(db, orgId, s.id, false);
    }
    case "invoice.created": {
      // Usage at cost (18 Nov): a renewal invoice in draft gets this cycle's pay-per-use, added
      // by the jobs route before Stripe finalizes it (about an hour).
      const inv = event.data.object;
      if (inv.billing_reason !== "subscription_cycle" || inv.status !== "draft" || !inv.id) {
        return "ignored";
      }
      const orgId = await orgForCustomer(db, undefined, customerId(inv.customer) ?? "");
      if (!orgId) return "ignored: no organization";
      return queueUsageCharge(db, orgId, {
        kind: "invoice",
        invoiceId: inv.id,
        start: inv.period_start,
        end: inv.period_end,
      });
    }
    case "invoice.paid": {
      const inv = event.data.object;
      // Top-ups charged to the saved card (automatic, or one click); a checkout's own invoice
      // ("top_up") is counted by its session instead.
      const kind = inv.metadata?.kind;
      // Referrals (23 Nov): a referred organization's first real payment earns its referrer a
      // month. Database only; the jobs route credits it.
      if (earnsReferralReward(inv)) {
        const payer = await orgForCustomer(db, undefined, customerId(inv.customer) ?? "");
        if (!payer) return "ignored";
        // The friend must be on Solo or Team (24 Nov): Business is set up on a call, not a referral.
        const bill = await loadBilling(db, payer);
        if (!referralPlanQualifies(bill?.plan)) return "ignored: plan not in the referral offer";
        return (await markReferralRewardDue(db, payer)) || "ignored";
      }
      if (kind !== "auto_top_up" && kind !== "top_up_now") return "ignored";
      const orgId =
        inv.metadata?.organization_id ??
        (await orgForCustomer(db, undefined, customerId(inv.customer) ?? ""));
      if (!orgId || !inv.id) return "ignored: no organization";
      return addTopUp(db, orgId, inv.id, kind === "auto_top_up");
    }
    default:
      return "ignored";
  }
}

async function addTopUp(
  db: ServiceClient,
  orgId: string,
  ref: string,
  automatic: boolean,
): Promise<string> {
  const { data, error } = await db
    .from("reply_top_ups")
    .upsert(
      { organization_id: orgId, replies: EXTRAS.topUp.replies, stripe_ref: ref, automatic },
      { onConflict: "stripe_ref", ignoreDuplicates: true },
    )
    .select("id");
  if (error) throw new Error(`billing: saving the top-up failed: ${error.message}`);
  // Recorded already (by the one-click action or a retried event): nothing more to log.
  if (!data?.length) return "top-up already recorded";
  await auditOrg(db, orgId, "billing.top_up", "system", {
    replies: EXTRAS.topUp.replies,
    automatic,
    ref,
  });
  return `top-up +${EXTRAS.topUp.replies}${automatic ? " (automatic)" : ""}`;
}
