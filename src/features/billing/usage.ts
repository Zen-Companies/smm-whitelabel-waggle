import "server-only";
import { monthStart } from "@/lib/llm/spend";
import type { ServiceClient } from "@/lib/supabase/service";
import { replyAllowance, type PlanId } from "./plans";
import { replyLimit, type ReplyLimit } from "./reply-limit";

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
 * The organization's plan. The organization owns the bill (decided 10 Nov). Not stored yet: it
 * comes with the Stripe subscription, so every organization has none for now.
 */
export async function loadOrgPlan(db: ServiceClient, orgId: string): Promise<OrgPlan | null> {
  void [db, orgId];
  return null;
}

/**
 * AI replies this month across the given brands: drafts Waggle wrote (not the owner's own),
 * counted from the first of the month, UTC, like the AI spend cap.
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
    .gte("created_at", monthStart(now).toISOString());
  if (error) throw new Error(`billing: counting replies failed: ${error.message}`);
  return count ?? 0;
}

/** The organization's reply limit this month, or null when it has no plan. */
export async function loadReplyLimit(
  db: ServiceClient,
  orgId: string,
  now: Date,
): Promise<{ plan: OrgPlan; limit: ReplyLimit } | null> {
  const plan = await loadOrgPlan(db, orgId);
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
  return status?.limit.level === "reached";
}
