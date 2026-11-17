import "server-only";
import { monthStart } from "@/lib/llm/spend";
import type { ServiceClient } from "@/lib/supabase/service";
import {
  accountAllowance,
  canAddBrand,
  canConnectAnother,
  isPlanId,
  PLANS,
  replyAllowance,
  type PlanId,
} from "./plans";
import { tryAutoTopUp } from "./auto-top-up";
import { loadBilling, loadTopUps } from "./billing-store";
import { replyLimit, type ReplyLimit } from "./reply-limit";
import { planIsLive } from "./subscription";

// Plan limits in the app (Pricing Bible, "Still to build": per-plan reply limits). Off until
// billing ships: the `billing.plans` switch is off by default, and no organization has a plan
// until it's stored with its Stripe subscription (T86). Until both, nothing is limited.

/** Staff switch for plan limits (one row, no brand). Off unless switched on. */
export const PLANS_FLAG = "billing.plans";

export async function planLimitsOn(db: ServiceClient): Promise<boolean> {
  const { data } = await db
    .from("feature_flags")
    .select("enabled")
    .eq("key", PLANS_FLAG)
    .is("tenant_id", null)
    .maybeSingle();
  return data?.enabled === true;
}

export interface OrgPlan {
  plan: PlanId;
  extraAccounts: number;
  topUpsThisMonth: number;
  carriedReplies: number;
}

/**
 * The organization's plan (the organization owns the bill, decided 10 Nov), from its Stripe
 * subscription as the webhook stored it. Null without a subscription that's trialing, active or
 * past due (Stripe still retrying the card).
 */
export async function loadOrgPlan(
  db: ServiceClient,
  orgId: string,
  now: Date = new Date(),
): Promise<OrgPlan | null> {
  const bill = await loadBilling(db, orgId);
  if (!bill || !planIsLive(bill.status) || !isPlanId(bill.plan)) return null;
  const topUps = await loadTopUps(db, orgId, bill.plan, now);
  return {
    plan: bill.plan,
    extraAccounts: bill.extra_accounts,
    topUpsThisMonth: topUps.thisMonth,
    carriedReplies: topUps.carried,
  };
}

/**
 * AI replies this month across the given brands: replies Waggle wrote that were sent (decided
 * 17 Nov: only sent ones count; the owner's own never do), from the first of the month, UTC.
 */
export async function countAiReplies(
  db: ServiceClient,
  tenantIds: string[],
  now: Date,
): Promise<number> {
  if (tenantIds.length === 0) return 0;
  const { count, error } = await db
    .from("drafts")
    .select("id", { count: "exact", head: true })
    .in("tenant_id", tenantIds)
    .eq("owner_written", false)
    .gte("sent_at", monthStart(now).toISOString());
  if (error) throw new Error(`billing: counting replies failed: ${error.message}`);
  return count ?? 0;
}

/** The organization's reply limit this month, or null when it has no plan. */
export async function loadReplyLimit(
  db: ServiceClient,
  orgId: string,
  now: Date,
): Promise<{ plan: OrgPlan; limit: ReplyLimit } | null> {
  const plan = await loadOrgPlan(db, orgId, now);
  if (!plan) return null;
  const { data: brands, error } = await db
    .from("tenants")
    .select("id")
    .eq("organization_id", orgId);
  if (error) throw new Error(`billing: listing brands failed: ${error.message}`);
  const used = await countAiReplies(
    db,
    (brands ?? []).map((b) => b.id),
    now,
  );
  const allowance = replyAllowance(plan.plan, {
    thisMonth: plan.topUpsThisMonth,
    carriedReplies: plan.carriedReplies,
  });
  return { plan, limit: replyLimit(used, allowance, now) };
}

/**
 * For drafting: whether this brand's organization is out of AI replies this month. False while
 * plan limits are off or the organization has no plan. At the limit only drafting pauses; the
 * message comes to the owner like at the AI spend cap.
 */
export async function replyLimitReached(
  db: ServiceClient,
  tenantId: string,
  now: Date,
): Promise<boolean> {
  if (!(await planLimitsOn(db))) return false;
  const { data: tenant } = await db
    .from("tenants")
    .select("organization_id")
    .eq("id", tenantId)
    .maybeSingle();
  if (!tenant?.organization_id) return false;
  const status = await loadReplyLimit(db, tenant.organization_id, now);
  if (status?.limit.level !== "reached") return false;
  // Automatic top-up, when the owner turned it on: 200 more, then check again.
  if (!(await tryAutoTopUp(db, tenant.organization_id, now))) return true;
  const after = await loadReplyLimit(db, tenant.organization_id, now);
  return after?.limit.level === "reached";
}

async function planForBrand(
  db: ServiceClient,
  tenantId: string,
): Promise<{ orgId: string; plan: OrgPlan } | null> {
  if (!(await planLimitsOn(db))) return null;
  const { data: tenant } = await db
    .from("tenants")
    .select("organization_id")
    .eq("id", tenantId)
    .maybeSingle();
  if (!tenant?.organization_id) return null;
  const plan = await loadOrgPlan(db, tenant.organization_id);
  return plan ? { orgId: tenant.organization_id, plan } : null;
}

/**
 * For Connect: whether the organization's plan has room for one more account (its plan's
 * accounts plus extras, counted across its brands). True while plan limits are off or there's
 * no plan.
 */
export async function roomForAnotherAccount(db: ServiceClient, tenantId: string): Promise<boolean> {
  const found = await planForBrand(db, tenantId);
  if (!found) return true;
  const { data: brands } = await db.from("tenants").select("id").eq("organization_id", found.orgId);
  const { count } = await db
    .from("social_accounts")
    .select("id", { count: "exact", head: true })
    .in(
      "tenant_id",
      (brands ?? []).map((b) => b.id),
    )
    .eq("status", "active");
  return canConnectAnother(count ?? 0, accountAllowance(found.plan.plan, found.plan.extraAccounts));
}

/**
 * For "Reply on its own": Solo approves every reply (Pricing Bible); Business and Team may let
 * Waggle answer regular questions on its own. True while plan limits are off or there's no plan.
 */
export async function planAllowsAutoReply(db: ServiceClient, tenantId: string): Promise<boolean> {
  const found = await planForBrand(db, tenantId);
  return !found || PLANS[found.plan.plan].features.autoReply;
}

async function planForOrg(db: ServiceClient, orgId: string): Promise<OrgPlan | null> {
  if (!(await planLimitsOn(db))) return null;
  return loadOrgPlan(db, orgId);
}

/** Brands each plan includes (Staff → Plans), null for no limit. */
export async function loadBrandLimits(db: ServiceClient): Promise<Record<PlanId, number | null>> {
  const { data, error } = await db.from("plan_settings").select("plan, brands_limit");
  if (error) throw new Error(`billing: reading plan settings failed: ${error.message}`);
  const out: Record<PlanId, number | null> = { solo: null, business: null, team: null };
  for (const r of data ?? []) if (isPlanId(r.plan)) out[r.plan] = r.brands_limit;
  return out;
}

/**
 * For Add a brand: whether the organization's plan has room for one more brand, and its limit
 * for the message. Room while plan limits are off, there's no plan, or no limit is set.
 */
export async function roomForAnotherBrand(
  db: ServiceClient,
  orgId: string,
): Promise<{ ok: true } | { ok: false; limit: number; plan: string }> {
  const plan = await planForOrg(db, orgId);
  if (!plan) return { ok: true };
  const limit = (await loadBrandLimits(db))[plan.plan];
  const { count } = await db
    .from("tenants")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .is("offboarded_at", null);
  if (canAddBrand(count ?? 0, limit)) return { ok: true };
  return { ok: false, limit: limit!, plan: PLANS[plan.plan].name };
}

/**
 * For Invite: team members and roles come with Business and Team (decided 17 Nov). True while
 * plan limits are off or there's no plan.
 */
export async function planAllowsTeam(db: ServiceClient, orgId: string): Promise<boolean> {
  const plan = await planForOrg(db, orgId);
  return !plan || PLANS[plan.plan].features.team;
}
