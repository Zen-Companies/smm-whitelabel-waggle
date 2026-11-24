// Gathers the facts one contact's fields are made from, at send time (so a later event never
// sends stale numbers). Reads only.

import { loadBilling, loadReplyLimit } from "@/features/billing";
import type { CrmEvent } from "@/lib/crm";
import type { ServiceClient } from "@/lib/supabase/service";
import type { CrmSnapshot } from "./fields";

const LIVE = new Set(["trialing", "active", "past_due"]);
const ENDING = new Set<CrmEvent>(["canceled", "trial_expired"]);
const DAY_MS = 24 * 60 * 60_000;

export interface CrmContact {
  email: string;
  name: string | null;
}

/** The person's email and name, or null when the login is gone. */
export async function loadContact(db: ServiceClient, userId: string): Promise<CrmContact | null> {
  const { data } = await db.auth.admin.getUserById(userId);
  const email = data.user?.email;
  if (!email) return null;
  const meta = data.user?.user_metadata as { full_name?: unknown } | undefined;
  return {
    email,
    name: typeof meta?.full_name === "string" ? meta.full_name.trim() || null : null,
  };
}

export async function loadSnapshot(
  db: ServiceClient,
  row: { organization_id: string | null; user_id: string; event: CrmEvent; details: unknown },
  now: Date,
): Promise<CrmSnapshot> {
  const orgId = row.organization_id;
  const [bill, brands, activity, limit] = await Promise.all([
    orgId ? loadBilling(db, orgId) : Promise.resolve(null),
    orgId
      ? db.from("tenants").select("id, name").eq("organization_id", orgId).order("created_at")
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    db.from("user_activity").select("last_seen_at").eq("user_id", row.user_id).maybeSingle(),
    orgId ? loadReplyLimit(db, orgId, now) : Promise.resolve(null),
  ]);
  const tenantIds = (brands.data ?? []).map((b) => b.id);
  const { count } = tenantIds.length
    ? await db
        .from("social_accounts")
        .select("id", { count: "exact", head: true })
        .in("tenant_id", tenantIds)
        .eq("status", "active")
    : { count: 0 };
  const lastSeen = activity.data?.last_seen_at ? new Date(activity.data.last_seen_at) : null;
  const live = !!bill && LIVE.has(bill.status ?? "");
  return {
    event: row.event,
    eventAt: now,
    details: (row.details ?? {}) as Record<string, unknown>,
    business: brands.data?.[0]?.name ?? "",
    // No paid plan is Free (19 Nov); an ending event still names the plan that ended.
    planId: live ? bill!.plan : ENDING.has(row.event) && bill?.plan ? bill.plan : "free",
    status: bill?.status ?? null,
    trialEndsAt: bill?.trial_ends_at ?? null,
    periodEnd: bill?.current_period_end ?? null,
    cancelAtPeriodEnd: !!bill?.cancel_at_period_end,
    accountsConnected: count ?? 0,
    repliesUsed: limit ? limit.limit.used : null,
    replyLimit: limit ? limit.limit.allowance : null,
    resetsOn: limit ? limit.limit.resetsAt : null,
    daysInactive: lastSeen
      ? Math.max(0, Math.floor((now.getTime() - lastSeen.getTime()) / DAY_MS))
      : 0,
  };
}
