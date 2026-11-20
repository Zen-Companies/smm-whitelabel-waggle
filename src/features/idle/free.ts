import "server-only";
import { orgOnFree, planLimitsOn } from "@/features/billing";
import type { ServiceClient } from "@/lib/supabase/service";

/**
 * Staff switch (feature_flags, global row). On unless a row switches it off, like plan limits
 * (Jason's spec, 19 Nov). Nothing disconnects without the day-23 warning 7 days earlier.
 */
export const IDLE_DISCONNECT_FLAG = "billing.idle_disconnect";

/**
 * Whether the organization is on Free for idle disconnects: the billing feature's own check (no
 * live paid plan, no test brand, plan limits on).
 */
export async function orgIsFreeForIdle(db: ServiceClient, orgId: string): Promise<boolean> {
  return orgOnFree(db, orgId);
}

/**
 * Idle disconnects only run with plans on (without plans everyone looks Free) and the staff
 * switch not off.
 */
export async function idleDisconnectOn(db: ServiceClient): Promise<boolean> {
  const { data } = await db
    .from("feature_flags")
    .select("enabled")
    .eq("key", IDLE_DISCONNECT_FLAG)
    .is("tenant_id", null)
    .maybeSingle();
  if (data?.enabled === false) return false;
  return planLimitsOn(db);
}
