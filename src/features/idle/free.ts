import "server-only";
import { loadBilling, planLimitsOn } from "@/features/billing";
import type { ServiceClient } from "@/lib/supabase/service";
import { isFreeForIdle } from "./idle";

/** Staff switch (feature_flags, global row): off until someone turns it on. */
export const IDLE_DISCONNECT_FLAG = "billing.idle_disconnect";

/**
 * Whether the organization is "on Free" for idle disconnects: no live plan (trialing, active or
 * past due), and no test brand. The one place this is decided: swap it for the billing
 * feature's own "on Free" check once there is one.
 */
export async function orgIsFreeForIdle(db: ServiceClient, orgId: string): Promise<boolean> {
  const [bill, { data: test, error }] = await Promise.all([
    loadBilling(db, orgId),
    db.from("tenants").select("id").eq("organization_id", orgId).eq("is_test", true).limit(1),
  ]);
  if (error) throw new Error(`idle: reading test brands failed: ${error.message}`);
  return isFreeForIdle({ billStatus: bill?.status, hasTestBrand: (test ?? []).length > 0 });
}

/**
 * Idle disconnects only run with plans switched on (without plans everyone looks Free) and the
 * staff switch on.
 */
export async function idleDisconnectOn(db: ServiceClient): Promise<boolean> {
  const { data } = await db
    .from("feature_flags")
    .select("enabled")
    .eq("key", IDLE_DISCONNECT_FLAG)
    .is("tenant_id", null)
    .maybeSingle();
  if (data?.enabled !== true) return false;
  return planLimitsOn(db);
}
