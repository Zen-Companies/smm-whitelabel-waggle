import type { ServiceClient } from "@/lib/supabase/service";
import { mcpEnabled } from "./auth";

// Feature switches for AI assistants (docs/mcp/PLAN.md §7, decided: off by default per brand).
// MCP_ENABLED is the deployment's master switch. Under it, staff switch AI assistants off for
// everyone (a global row; none = on) and on or off brand by brand (none = off).

export const MCP_FLAG = "mcp";

/** On for everyone: the deployment allows it and staff haven't switched it off. */
export async function mcpOnGlobally(db: ServiceClient): Promise<boolean> {
  if (!mcpEnabled()) return false;
  const { data } = await db
    .from("feature_flags")
    .select("enabled")
    .eq("key", MCP_FLAG)
    .is("tenant_id", null)
    .maybeSingle();
  return data?.enabled ?? true;
}

/** Which of these brands have AI assistants switched on. */
export async function mcpBrandsOn(
  db: ServiceClient,
  tenantIds: readonly string[],
): Promise<Set<string>> {
  if (!tenantIds.length) return new Set();
  const { data, error } = await db
    .from("feature_flags")
    .select("tenant_id, tenants!inner (offboarded_at)")
    .eq("key", MCP_FLAG)
    .eq("enabled", true)
    .in("tenant_id", [...tenantIds])
    // An offboarded brand (T21) is off for AI assistants whatever its switch says.
    .is("tenants.offboarded_at", null);
  if (error) throw new Error(`mcp: reading switches failed: ${error.message}`);
  return new Set((data ?? []).flatMap((r) => (r.tenant_id ? [r.tenant_id] : [])));
}

/** A brand's own daily limit for AI sends, or null for the default. */
export async function brandDailyCap(db: ServiceClient, tenantId: string): Promise<number | null> {
  const { data } = await db
    .from("tenants")
    .select("mcp_daily_send_cap")
    .eq("id", tenantId)
    .maybeSingle();
  return data?.mcp_daily_send_cap ?? null;
}
