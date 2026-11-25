import "server-only";
import * as Sentry from "@sentry/nextjs";
import type Stripe from "stripe";
import {
  creditedMonthEnd,
  friendMonthApplied,
  queueForOwners,
  queueQuietly,
  referralDedupeKey,
  referralLinkDedupeKey,
  referralSendAfter,
  type ReferralRole,
} from "@/lib/crm";
import type { Database } from "@/lib/supabase/database.types";
import type { ServiceClient } from "@/lib/supabase/service";
import { auditOrg } from "./billing-store";
import { checkoutTrialDays, isPaidPlanId } from "./plans";
import { bankedDaysOf, firstCheckoutTrial } from "./promo";
import { runningReferral, type Promotion } from "./promotions";
import { loadPromotions } from "./promotions-store";
import { codeFromBytes, isNewOrg, parseRefCode, referralLink } from "./referral-code";
import { appUrl } from "./stripe-client";
import { isPayingBill } from "./subscription";
import { subscriptionChargeCents } from "./trial-reminder";

// "Give a month, get a month" (Jason, 23 November 2026). See promo.ts for the free month itself.

/**
 * Whether the organization is paying now (a paid plan with its card, live). Give a month, get a
 * month is only for paying Owners (Pricing Bible: "Both sides need a card on a paid plan").
 */
export async function orgIsPaying(db: ServiceClient, orgId: string): Promise<boolean> {
  const { data, error } = await db
    .from("org_billing")
    .select("plan, status")
    .eq("organization_id", orgId)
    .maybeSingle();
  if (error) throw new Error(`referrals: reading the bill failed: ${error.message}`);
  return isPayingBill(data);
}

/**
 * The organization's referral code, made the first time it's needed. Its link goes to the Owners'
 * HighLevel contacts (25 Nov), once per code per Owner (`syncCrm: false` when the caller sends it
 * itself, like the CRM sender). null for an organization that isn't paying: no link, no code made.
 */
export async function ensureReferralCode(
  db: ServiceClient,
  orgId: string,
  opts: { syncCrm?: boolean } = {},
): Promise<string | null> {
  if (!(await orgIsPaying(db, orgId))) return null;
  const code = await findOrMakeCode(db, orgId);
  if (opts.syncCrm !== false) {
    await queueQuietly(() =>
      queueForOwners(db, orgId, {
        event: "referral_link",
        dedupeKey: referralLinkDedupeKey(code),
      }),
    );
  }
  return code;
}

/** The Owner's own link to share: https://app.gowaggle.ai/signup?ref=<code>. null when not paying. */
export async function ownerReferralLink(db: ServiceClient, orgId: string): Promise<string | null> {
  const code = await ensureReferralCode(db, orgId, { syncCrm: false });
  return code ? referralLink(appUrl(""), code) : null;
}

async function findOrMakeCode(db: ServiceClient, orgId: string): Promise<string> {
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
 * organization whose link it came through, only if that one is paying now (an old link of an
 * organization back on Free is ignored: a normal sign-up). Never throws: a referral must not
 * block a sign-up.
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
    if (!(await orgIsPaying(db, owner.organization_id))) return "skipped";
    // The program's terms now are the referral's for good (review of release #78): switching it
    // off or changing it later never takes back a month already earned. 0: none running.
    const terms = runningReferral(now, await loadPromotions());
    const { data, error } = await db
      .from("referrals")
      .upsert(
        {
          referrer_org_id: owner.organization_id,
          referred_org_id: orgId,
          code,
          reward_months: terms?.rewardMonths ?? 0,
          trial_days: terms?.trialDays ?? 0,
        },
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

export interface ReferralForCheckout {
  referred: boolean;
  referredAt: Date | null;
  /** The friend's free days stored at sign-up (0: none); null on a row from before. */
  referralTrialDays: number | null;
  bankedIds: string[];
  /** Each banked row's own terms, for bankedDaysOf. */
  banked: { reward_months: number | null; trial_days: number | null }[];
}

/**
 * What an organization's first plan checkout needs: was it referred (and on what terms: the
 * ones stored when it signed up), and banked months (each on its own terms).
 */
export async function loadReferralForCheckout(
  db: ServiceClient,
  orgId: string,
): Promise<ReferralForCheckout> {
  const [{ data: mine }, { data: banked }] = await Promise.all([
    db
      .from("referrals")
      .select("id, created_at, trial_days")
      .eq("referred_org_id", orgId)
      .maybeSingle(),
    db
      .from("referrals")
      .select("id, reward_months, trial_days")
      .eq("referrer_org_id", orgId)
      .eq("status", "banked")
      .order("created_at")
      .limit(24),
  ]);
  const rows = banked ?? [];
  return {
    referred: !!mine,
    referredAt: mine ? new Date(mine.created_at) : null,
    referralTrialDays: mine?.trial_days ?? null,
    bankedIds: rows.map((r) => r.id),
    banked: rows.map((r) => ({ reward_months: r.reward_months, trial_days: r.trial_days })),
  };
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
    .select("id, referrer_org_id");
  if (error) throw new Error(`referrals: marking the reward failed: ${error.message}`);
  for (const r of data ?? []) {
    await auditOrg(db, r.referrer_org_id, "referral.reward_due", "system", {
      referralId: r.id,
      referredOrgId: orgId,
    });
  }
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
  const { data, error } = await db
    .from("referrals")
    .update({ status: "rewarded", rewarded_at: new Date().toISOString(), stripe_ref: sessionId })
    .in("id", ids)
    .eq("referrer_org_id", orgId)
    .eq("status", "banked")
    .select("id");
  if (error) throw new Error(`referrals: using banked months failed: ${error.message}`);
  for (const r of data ?? []) {
    await auditOrg(db, orgId, "referral.banked_used", "system", {
      referralId: r.id,
      checkoutSessionId: sessionId,
    });
  }
  return `banked months used (${ids.length})`;
}

/** A claim older than this crashed half-way: it's retried, after looking in Stripe for its credit. */
export const CREDITING_STALE_MS = 10 * 60_000;

const ROW = "id, referrer_org_id, referred_org_id, created_at, reward_months";

interface RewardRow {
  id: string;
  referrer_org_id: string;
  referred_org_id: string;
  created_at: string;
  /** Stored at sign-up (null: a row from before: the program that ran then decides). */
  reward_months: number | null;
}

/** Where a row was when the jobs route took it. */
type ClaimFrom = "reward_due" | "crediting" | "banked";

type ReferralPatch = Database["public"]["Tables"]["referrals"]["Update"];

/**
 * The jobs route: credits each month that's owed. A referrer with a paid plan gets its reward
 * months of its plan off its next bill (a Stripe customer balance credit, so nothing to click).
 * One still on Free has it banked: it becomes trial days on its first checkout. Banked months of a
 * referrer that has a plan again (one it had before, so its checkout had no trial to put them in)
 * are credited the same way. The months per friend are stored on the referral when the friend
 * signs up (the program then, Staff → Promotions); switching it off later changes nothing owed.
 *
 * Never twice: a row is claimed ('crediting') before Stripe is called, Stripe is asked for a
 * credit already made for the referral before making one, and every write is checked.
 */
export async function grantReferralRewards(deps: {
  db: ServiceClient;
  stripe: Stripe | null;
  shouldContinue?: () => boolean;
  now?: Date;
}): Promise<{ credited: number; banked: number; failed: number }> {
  const { db, stripe } = deps;
  const result = { credited: 0, banked: 0, failed: 0 };
  if (!stripe) return result;
  const now = deps.now ?? new Date();
  const staleBefore = new Date(now.getTime() - CREDITING_STALE_MS).toISOString();
  let promotions: readonly Promotion[];
  let work: [RewardRow, ClaimFrom][];
  try {
    promotions = await loadPromotions();
    work = await rewardWork(db, staleBefore);
  } catch (e) {
    // Never stops the jobs route: the next run tries again.
    Sentry.captureException(e);
    result.failed++;
    return result;
  }
  const ctx = { db, stripe, promotions, now, staleBefore };
  for (const [row, from] of work) {
    if (deps.shouldContinue && !deps.shouldContinue()) break;
    try {
      const out = await creditOne(ctx, row, from);
      if (out === "credited") result.credited++;
      else if (out === "banked") result.banked++;
    } catch (e) {
      result.failed++;
      Sentry.captureException(e, { extra: { referralId: row.id } });
      // Hand it back where it was claimed from: a banked month stays banked, the rest are due
      // again (a credit already made is found in Stripe next time, never made again).
      await db
        .from("referrals")
        .update({ status: handBackStatus(from), rewarded_at: null })
        .eq("id", row.id)
        .eq("status", "crediting")
        .then(
          () => undefined,
          () => undefined,
        );
    }
  }
  return result;
}

/** Pure: where a row goes back to when crediting it failed: where it was claimed from. */
export function handBackStatus(from: ClaimFrom): "banked" | "reward_due" {
  return from === "banked" ? "banked" : "reward_due";
}

/**
 * Pure: a month of the referrer's own subscription, in cents: every item's price (the plan, extra
 * accounts, a Business custom price) as Stripe charges it; a yearly one is a twelfth.
 */
export function monthOfSubscriptionCents(
  sub: Parameters<typeof subscriptionChargeCents>[0],
  interval: string | null,
): number {
  const cents = subscriptionChargeCents(sub);
  return interval === "year" ? Math.round(cents / 12) : cents;
}

/** What to credit: months due, claims that crashed half-way, banked months of live referrers. */
async function rewardWork(
  db: ServiceClient,
  staleBefore: string,
): Promise<[RewardRow, ClaimFrom][]> {
  const [due, stuck] = await Promise.all([
    db.from("referrals").select(ROW).eq("status", "reward_due").order("reward_due_at").limit(20),
    db
      .from("referrals")
      .select(ROW)
      .eq("status", "crediting")
      .lt("rewarded_at", staleBefore)
      .order("rewarded_at")
      .limit(20),
  ]);
  if (due.error) throw new Error(`referrals: reading rewards due failed: ${due.error.message}`);
  if (stuck.error)
    throw new Error(`referrals: reading stuck credits failed: ${stuck.error.message}`);
  return [
    ...(due.data ?? []).map((r): [RewardRow, ClaimFrom] => [r, "reward_due"]),
    ...(stuck.data ?? []).map((r): [RewardRow, ClaimFrom] => [r, "crediting"]),
    ...(await bankedOfLiveReferrers(db)).map((r): [RewardRow, ClaimFrom] => [r, "banked"]),
  ];
}

/** Banked rows whose referrer has a live paid plan again (credited, not trial days). */
async function bankedOfLiveReferrers(db: ServiceClient): Promise<RewardRow[]> {
  const { data: banked, error } = await db
    .from("referrals")
    .select(ROW)
    .eq("status", "banked")
    .order("created_at")
    .limit(200);
  if (error) throw new Error(`referrals: reading banked months failed: ${error.message}`);
  if (!banked?.length) return [];
  const orgs = [...new Set(banked.map((r) => r.referrer_org_id))];
  const { data: bills, error: billsError } = await db
    .from("org_billing")
    .select("organization_id, plan, status")
    .in("organization_id", orgs);
  if (billsError) throw new Error(`referrals: reading bills failed: ${billsError.message}`);
  const live = new Set((bills ?? []).filter((b) => isPayingBill(b)).map((b) => b.organization_id));
  return banked.filter((r) => live.has(r.referrer_org_id)).slice(0, 20);
}

/** A row being credited moves on; an error, or a row no longer ours, throws. */
async function settle(db: ServiceClient, id: string, patch: ReferralPatch): Promise<void> {
  const { data, error } = await db
    .from("referrals")
    .update(patch)
    .eq("id", id)
    .eq("status", "crediting")
    .select("id");
  if (error) throw new Error(`referrals: saving ${patch.status} failed: ${error.message}`);
  if (!data?.length) throw new Error("referrals: the row was no longer being credited");
}

/** The credit already made in Stripe for a referral (its metadata names it), if any. */
export async function findReferralCredit(
  stripe: Pick<Stripe, "customers">,
  customer: string,
  referralId: string,
): Promise<Stripe.CustomerBalanceTransaction | null> {
  for await (const t of stripe.customers.listBalanceTransactions(customer, { limit: 100 })) {
    if (t.metadata?.referral_id === referralId) return t;
  }
  return null;
}

async function creditOne(
  ctx: {
    db: ServiceClient;
    stripe: Stripe;
    promotions: readonly Promotion[];
    now: Date;
    staleBefore: string;
  },
  row: RewardRow,
  from: ClaimFrom,
): Promise<"credited" | "banked" | "used" | "no_reward" | "skipped"> {
  const { db, stripe } = ctx;
  const at = ctx.now.toISOString();
  // Claim it first: only one run credits a row.
  let claim = db
    .from("referrals")
    .update({ status: "crediting", rewarded_at: at })
    .eq("id", row.id)
    .eq("status", from);
  if (from === "crediting") claim = claim.lt("rewarded_at", ctx.staleBefore);
  const { data: claimed, error: claimError } = await claim.select("id");
  if (claimError) throw new Error(`referrals: claiming the reward failed: ${claimError.message}`);
  if (!claimed?.length) return "skipped";

  // The terms stored when the friend signed up decide the reward, whatever the program's switch
  // says now. A row from before they were stored: the program that ran then.
  const months =
    row.reward_months ??
    runningReferral(new Date(row.created_at), ctx.promotions)?.rewardMonths ??
    0;
  if (months <= 0) {
    await settle(db, row.id, { status: "no_reward", rewarded_at: null });
    await auditOrg(db, row.referrer_org_id, "referral.no_reward", "system", {
      referralId: row.id,
    });
    return "no_reward";
  }

  const { data: bill, error: billError } = await db
    .from("org_billing")
    .select(
      "stripe_customer_id, stripe_subscription_id, plan, billing_interval, status, current_period_end",
    )
    .eq("organization_id", row.referrer_org_id)
    .maybeSingle();
  if (billError) throw new Error(`referrals: reading the bill failed: ${billError.message}`);
  if (!bill || !isPaidPlanId(bill.plan) || !isPayingBill(bill)) {
    await settle(db, row.id, { status: "banked", rewarded_at: null });
    if (from === "banked") return "skipped";
    await auditOrg(db, row.referrer_org_id, "referral.banked", "system", { referralId: row.id });
    return "banked";
  }

  if (!bill.stripe_subscription_id) {
    throw new Error("referrals: a paying bill without its subscription");
  }
  const sub = await stripe.subscriptions.retrieve(bill.stripe_subscription_id);
  // A banked month a first checkout's trial already used (its webhook may not have landed yet,
  // or the row was handed back after a failure): never also credited.
  if ((sub.metadata?.banked_referrals ?? "").split(",").includes(row.id)) {
    await settle(db, row.id, {
      status: "rewarded",
      rewarded_at: at,
      stripe_ref: sub.id,
      reward_cents: 0,
    });
    await auditOrg(db, row.referrer_org_id, "referral.banked_used", "system", {
      referralId: row.id,
    });
    return "used";
  }

  // What the referrer actually pays for a month (its subscription's items, a Business custom
  // price included), not the list price.
  const cents = monthOfSubscriptionCents(sub, bill.billing_interval) * months;
  if (cents <= 0) throw new Error("referrals: the subscription has no price to credit");
  const txn =
    (await findReferralCredit(stripe, bill.stripe_customer_id, row.id)) ??
    (await stripe.customers.createBalanceTransaction(
      bill.stripe_customer_id,
      {
        amount: -cents,
        currency: "usd",
        description: "Free month: a friend you referred joined Waggle",
        metadata: { kind: "referral", referral_id: row.id },
      },
      { idempotencyKey: `referral:${row.id}` },
    ));
  const credited = Math.abs(txn.amount);
  await settle(db, row.id, {
    status: "rewarded",
    rewarded_at: at,
    stripe_ref: txn.id,
    reward_cents: credited,
  });
  await auditOrg(db, row.referrer_org_id, "referral.rewarded", "system", {
    referralId: row.id,
    cents: credited,
  });
  // GHL (24 Nov): the referrer's month is applied, as the next bill's credit.
  await queueQuietly(() =>
    queueReferralRewarded(db, {
      referralId: row.id,
      role: "referrer",
      orgId: row.referrer_org_id,
      otherOrgId: row.referred_org_id,
      endsAt: creditedMonthEnd(bill.current_period_end, months),
      plan: bill.plan,
    }),
  );
  return "credited";
}

export interface ReferralStats {
  /** null: the organization isn't paying, so it has no link. */
  code: string | null;
  /** Friends who joined through the link. */
  joined: number;
  /** Months credited or used. */
  earned: number;
  /** Months waiting for the first plan. */
  banked: number;
}

/** Your plan: the link (paying organizations only) and how it's going. */
export async function loadReferralStats(db: ServiceClient, orgId: string): Promise<ReferralStats> {
  const code = await ensureReferralCode(db, orgId);
  const { data } = await db.from("referrals").select("status").eq("referrer_org_id", orgId);
  const rows = data ?? [];
  return {
    code,
    joined: rows.length,
    earned: rows.filter((r) => r.status === "rewarded" || r.status === "crediting").length,
    banked: rows.filter((r) => r.status === "banked").length,
  };
}

/**
 * How long the organization's first paid plan would be free if it chose one now: the first month
 * (30 days, or a promotion's longer trial) plus banked months. null once it had a paid plan.
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
    referredAt: ref.referredAt,
    referralTrialDays: ref.referralTrialDays,
    bankedMonths: ref.bankedIds.length,
    bankedDays: bankedDaysOf(ref.banked, now, promotions),
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
 * Sign-up for a friend's link: whether the code is a real one of a paying organization (else it's
 * ignored: no invite card), and the referring organization's business name (only that: never a
 * person, email or anything else). Never throws.
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
    if (!owner || !(await orgIsPaying(db, owner.organization_id))) {
      return { known: false, name: null };
    }
    return { known: true, name: await businessNameOf(db, owner.organization_id) };
  } catch (e) {
    Sentry.captureException(e);
    // Can't tell if it counts: a normal sign-up (the claim would be skipped too).
    return { known: false, name: null };
  }
}

/** The organization that referred this one, by display name (the friend's-month pass and success). */
export async function referrerOf(
  db: ServiceClient,
  orgId: string,
): Promise<{
  referred: boolean;
  referredAt: Date | null;
  /** The friend's free days stored at sign-up (0: none); null on a row from before. */
  trialDays: number | null;
  name: string | null;
}> {
  const { data } = await db
    .from("referrals")
    .select("referrer_org_id, created_at, trial_days")
    .eq("referred_org_id", orgId)
    .maybeSingle();
  if (!data) return { referred: false, referredAt: null, trialDays: null, name: null };
  return {
    referred: true,
    referredAt: new Date(data.created_at),
    trialDays: data.trial_days,
    name: await businessNameOf(db, data.referrer_org_id),
  };
}
