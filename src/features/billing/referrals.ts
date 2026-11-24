import "server-only";
import * as Sentry from "@sentry/nextjs";
import type Stripe from "stripe";
import {
  creditedMonthEnd,
  friendMonthApplied,
  queueForOwners,
  queueQuietly,
  referralDedupeKey,
  referralSendAfter,
  type ReferralRole,
} from "@/lib/crm";
import type { ServiceClient } from "@/lib/supabase/service";
import { auditOrg } from "./billing-store";
import { checkoutTrialDays, FOUNDING, isPaidPlanId, monthlyPrice } from "./plans";
import { firstCheckoutTrial } from "./promo";
import { loadPromotions } from "./promotions-store";
import { codeFromBytes, isNewOrg, parseRefCode } from "./referral-code";
import { planIsLive } from "./subscription";

// "Give a month, get a month" (Jason, 23 November 2026). See promo.ts for the free month itself.

/** The organization's referral code, made the first time it's needed. */
export async function ensureReferralCode(db: ServiceClient, orgId: string): Promise<string> {
  const { data } = await db
    .from("referral_codes")
    .select("code")
    .eq("organization_id", orgId)
    .maybeSingle();
  if (data) return data.code;
  for (let i = 0; i < 5; i++) {
    const code = codeFromBytes(crypto.getRandomValues(new Uint8Array(8)));
    const { error } = await db.from("referral_codes").insert({ organization_id: orgId, code });
    if (!error) return code;
    // Another tab made it first: use that one. A taken code: try another.
    const { data: again } = await db
      .from("referral_codes")
      .select("code")
      .eq("organization_id", orgId)
      .maybeSingle();
    if (again) return again.code;
  }
  throw new Error("referrals: couldn't make a code");
}

/**
 * Sign-up (from the cookie the sign-up page keeps): credits a brand-new organization to the
 * organization whose link it came through. Never throws: a referral must not block a sign-up.
 */
export async function claimReferral(
  db: ServiceClient,
  orgId: string,
  rawCode: unknown,
  now = new Date(),
): Promise<"claimed" | "skipped"> {
  const code = parseRefCode(rawCode);
  if (!code) return "skipped";
  try {
    const [{ data: owner }, { data: org }] = await Promise.all([
      db.from("referral_codes").select("organization_id").eq("code", code).maybeSingle(),
      db.from("organizations").select("created_at").eq("id", orgId).maybeSingle(),
    ]);
    if (!owner || owner.organization_id === orgId || !isNewOrg(org?.created_at, now)) {
      return "skipped";
    }
    const { data, error } = await db
      .from("referrals")
      .upsert(
        { referrer_org_id: owner.organization_id, referred_org_id: orgId, code },
        { onConflict: "referred_org_id", ignoreDuplicates: true },
      )
      .select("id");
    if (error) throw new Error(error.message);
    if (!data?.length) return "skipped";
    await auditOrg(db, owner.organization_id, "referral.signed_up", "system", {
      referredOrgId: orgId,
    });
    return "claimed";
  } catch (e) {
    Sentry.captureException(e, { extra: { orgId } });
    return "skipped";
  }
}

/** What an organization's first plan checkout needs: was it referred, and banked months. */
export async function loadReferralForCheckout(
  db: ServiceClient,
  orgId: string,
): Promise<{ referred: boolean; bankedIds: string[] }> {
  const [{ data: mine }, { data: banked }] = await Promise.all([
    db.from("referrals").select("id").eq("referred_org_id", orgId).maybeSingle(),
    db
      .from("referrals")
      .select("id")
      .eq("referrer_org_id", orgId)
      .eq("status", "banked")
      .order("created_at")
      .limit(24),
  ]);
  return { referred: !!mine, bankedIds: (banked ?? []).map((r) => r.id) };
}

/**
 * Stripe webhook (database only, rule 3): the friend's first paid invoice went through, so the
 * organization that referred it is owed a month. The jobs route credits it.
 */
export async function markReferralRewardDue(db: ServiceClient, orgId: string): Promise<string> {
  const { data, error } = await db
    .from("referrals")
    .update({ status: "reward_due", reward_due_at: new Date().toISOString() })
    .eq("referred_org_id", orgId)
    .eq("status", "signed_up")
    .select("id");
  if (error) throw new Error(`referrals: marking the reward failed: ${error.message}`);
  return data?.length ? "referral reward due" : "";
}

/**
 * Stripe webhook (database only): a first plan checkout went through with banked months in its
 * trial (the ids ride on the session's metadata). Those months are now used.
 */
export async function markBankedUsed(
  db: ServiceClient,
  orgId: string,
  idsCsv: string | undefined,
  sessionId: string,
): Promise<string> {
  const ids = (idsCsv ?? "").split(",").filter((s) => /^[0-9a-f-]{36}$/.test(s));
  if (!ids.length) return "";
  const { error } = await db
    .from("referrals")
    .update({ status: "rewarded", rewarded_at: new Date().toISOString(), stripe_ref: sessionId })
    .in("id", ids)
    .eq("referrer_org_id", orgId)
    .eq("status", "banked");
  if (error) throw new Error(`referrals: using banked months failed: ${error.message}`);
  return `banked months used (${ids.length})`;
}

/**
 * The jobs route: credits each month that's owed. A referrer with a paid plan gets one month of
 * its plan off its next bill (a Stripe customer balance credit, so nothing to click). One still on
 * Free has it banked: it becomes trial days on its first checkout. Idempotent per referral.
 */
export async function grantReferralRewards(deps: {
  db: ServiceClient;
  stripe: Stripe | null;
  shouldContinue?: () => boolean;
}): Promise<{ credited: number; banked: number; failed: number }> {
  const { db, stripe } = deps;
  const result = { credited: 0, banked: 0, failed: 0 };
  if (!stripe) return result;
  // Months per friend: the referral program's reward (Staff → Promotions).
  const rewardMonths =
    (await loadPromotions()).find((p) => p.kind === "referral")?.rewardMonths ?? 1;
  if (rewardMonths <= 0) return result;
  const { data: rows } = await db
    .from("referrals")
    .select("id, referrer_org_id, referred_org_id")
    .eq("status", "reward_due")
    .order("reward_due_at")
    .limit(20);
  for (const row of rows ?? []) {
    if (deps.shouldContinue && !deps.shouldContinue()) break;
    try {
      const { data: bill } = await db
        .from("org_billing")
        .select("stripe_customer_id, plan, billing_interval, status, founding, current_period_end")
        .eq("organization_id", row.referrer_org_id)
        .maybeSingle();
      const now = new Date().toISOString();
      if (!bill || !isPaidPlanId(bill.plan) || !planIsLive(bill.status)) {
        await db.from("referrals").update({ status: "banked" }).eq("id", row.id);
        await auditOrg(db, row.referrer_org_id, "referral.banked", "system", {
          referralId: row.id,
        });
        result.banked++;
        continue;
      }
      const usd =
        bill.founding && bill.plan === FOUNDING.plan
          ? FOUNDING.monthlyUsd
          : monthlyPrice(bill.plan, { yearly: bill.billing_interval === "year" });
      const cents = Math.round(usd * 100 * rewardMonths);
      const txn = await stripe.customers.createBalanceTransaction(
        bill.stripe_customer_id,
        {
          amount: -cents,
          currency: "usd",
          description: "Free month: a friend you referred joined Waggle",
          metadata: { kind: "referral", referral_id: row.id },
        },
        { idempotencyKey: `referral:${row.id}` },
      );
      await db
        .from("referrals")
        .update({ status: "rewarded", rewarded_at: now, stripe_ref: txn.id, reward_cents: cents })
        .eq("id", row.id);
      await auditOrg(db, row.referrer_org_id, "referral.rewarded", "system", {
        referralId: row.id,
        cents,
      });
      // GHL (24 Nov): the referrer's month is applied, as the next bill's credit.
      await queueQuietly(() =>
        queueReferralRewarded(db, {
          referralId: row.id,
          role: "referrer",
          orgId: row.referrer_org_id,
          otherOrgId: row.referred_org_id,
          endsAt: creditedMonthEnd(bill.current_period_end, rewardMonths),
          plan: bill.plan,
        }),
      );
      result.credited++;
    } catch (e) {
      result.failed++;
      Sentry.captureException(e, { extra: { referralId: row.id } });
    }
  }
  return result;
}

export interface ReferralStats {
  code: string;
  /** Friends who joined through the link. */
  joined: number;
  /** Months credited or used. */
  earned: number;
  /** Months waiting for the first plan. */
  banked: number;
}

/** Your plan: the link and how it's going. */
export async function loadReferralStats(db: ServiceClient, orgId: string): Promise<ReferralStats> {
  const code = await ensureReferralCode(db, orgId);
  const { data } = await db.from("referrals").select("status").eq("referrer_org_id", orgId);
  const rows = data ?? [];
  return {
    code,
    joined: rows.length,
    earned: rows.filter((r) => r.status === "rewarded").length,
    banked: rows.filter((r) => r.status === "banked").length,
  };
}

/**
 * How long the organization's first paid plan would be free if it chose one now: 7 days, or 30
 * with the Black Friday or referral month (plus banked months). null once it had a paid plan.
 * Shown on every offer, so what the owner reads is what checkout gives.
 */
export async function offerTrialDays(
  db: ServiceClient,
  orgId: string,
  bill: { trial_ends_at: string | null; stripe_subscription_id: string | null } | null,
  now = new Date(),
): Promise<number | null> {
  const base = checkoutTrialDays(bill);
  if (base === null) return null;
  const [ref, promotions] = await Promise.all([
    loadReferralForCheckout(db, orgId),
    loadPromotions(),
  ]);
  return firstCheckoutTrial({
    now,
    referred: ref.referred,
    bankedMonths: ref.bankedIds.length,
    baseDays: base,
    promotions,
  }).days;
}

/**
 * CRM (Walter's GHL referral campaign, 24 Nov): `referral_rewarded` for one side of a referral,
 * for each Owner of that organization, once (dedupe per referral and side). Queued at least 30 s
 * after the other side's event (`next_attempt_at`), so his workflow can clear the trigger tag.
 * Database only: safe from the Stripe webhook.
 */
export async function queueReferralRewarded(
  db: ServiceClient,
  input: {
    referralId: string;
    role: ReferralRole;
    orgId: string;
    otherOrgId: string;
    endsAt: Date | string | null;
    plan: string | null;
  },
  now = new Date(),
): Promise<void> {
  const other: ReferralRole = input.role === "friend" ? "referrer" : "friend";
  const [name, { data: others }] = await Promise.all([
    businessNameOf(db, input.otherOrgId),
    db
      .from("crm_events")
      .select("sent_at, next_attempt_at, created_at")
      .like("dedupe_key", `${referralDedupeKey(input.referralId, other)}:%`),
  ]);
  const ends = input.endsAt
    ? typeof input.endsAt === "string"
      ? input.endsAt
      : input.endsAt.toISOString()
    : "";
  await queueForOwners(db, input.orgId, {
    event: "referral_rewarded",
    details: {
      referral_id: input.referralId,
      role: input.role,
      with: name ?? "",
      ends,
      ...(input.plan ? { plan: input.plan } : {}),
    },
    dedupeKey: referralDedupeKey(input.referralId, input.role),
    notBefore: referralSendAfter(
      (others ?? []).map((o) => ({
        sentAt: o.sent_at,
        nextAttemptAt: o.next_attempt_at,
        createdAt: o.created_at,
      })),
      now,
    ),
  });
}

/**
 * Stripe webhook (database only): a first plan's trial just started. The friend's free month is
 * applied now (their referral_rewarded), and banked months used in it are the referrer's own
 * (the organization paying is the referrer there).
 */
export async function queueReferralMonthsApplied(
  db: ServiceClient,
  input: {
    orgId: string;
    promo: string | undefined;
    bankedIds: string | undefined;
    trialEndsAt: string | null;
    plan: string | null;
  },
): Promise<void> {
  const { data: mine } = await db
    .from("referrals")
    .select("id, referrer_org_id")
    .eq("referred_org_id", input.orgId)
    .maybeSingle();
  if (mine && friendMonthApplied({ referred: true, trialStarted: true, promo: input.promo })) {
    await queueReferralRewarded(db, {
      referralId: mine.id,
      role: "friend",
      orgId: input.orgId,
      otherOrgId: mine.referrer_org_id,
      endsAt: input.trialEndsAt,
      plan: input.plan,
    });
  }
  const ids = (input.bankedIds ?? "").split(",").filter((s) => /^[0-9a-f-]{36}$/.test(s));
  if (!ids.length) return;
  const { data: banked } = await db
    .from("referrals")
    .select("id, referred_org_id")
    .in("id", ids)
    .eq("referrer_org_id", input.orgId);
  for (const r of banked ?? []) {
    await queueReferralRewarded(db, {
      referralId: r.id,
      role: "referrer",
      orgId: input.orgId,
      otherOrgId: r.referred_org_id,
      endsAt: input.trialEndsAt,
      plan: input.plan,
    });
  }
}

/**
 * The name a friend sees: the organization's first business (brand) name. Not the organization's
 * own name, which starts as a person's ("Febron's Organization"). null when there is none yet.
 */
async function businessNameOf(db: ServiceClient, orgId: string): Promise<string | null> {
  const { data } = await db
    .from("tenants")
    .select("name")
    .eq("organization_id", orgId)
    .eq("name_pending", false)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.name?.trim() || null;
}

/**
 * Sign-up for a friend's link: whether the code is a real one, and the referring organization's
 * business name (only that: never a person, email or anything else). Never throws.
 */
export async function referrerForCode(
  db: ServiceClient,
  rawCode: unknown,
): Promise<{ known: boolean; name: string | null }> {
  const code = parseRefCode(rawCode);
  if (!code) return { known: false, name: null };
  try {
    const { data: owner } = await db
      .from("referral_codes")
      .select("organization_id")
      .eq("code", code)
      .maybeSingle();
    if (!owner) return { known: false, name: null };
    return { known: true, name: await businessNameOf(db, owner.organization_id) };
  } catch (e) {
    Sentry.captureException(e);
    // Can't tell: keep the friend's card, without a name.
    return { known: true, name: null };
  }
}

/** The organization that referred this one, by display name (the friend's-month pass and success). */
export async function referrerOf(
  db: ServiceClient,
  orgId: string,
): Promise<{ referred: boolean; name: string | null }> {
  const { data } = await db
    .from("referrals")
    .select("referrer_org_id")
    .eq("referred_org_id", orgId)
    .maybeSingle();
  if (!data) return { referred: false, name: null };
  return { referred: true, name: await businessNameOf(db, data.referrer_org_id) };
}
