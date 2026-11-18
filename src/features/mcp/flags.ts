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

/**
 * Which of these brands have AI assistants switched on. On by default (18 Nov): a brand is on
 * unless staff switched it off in its row. An offboarded brand (T21) is always off.
 */
export async function mcpBrandsOn(
  db: ServiceClient,
  tenantIds: readonly string[],
): Promise<Set<string>> {
  if (!tenantIds.length) return new Set();
  const ids = [...tenantIds];
  const [{ data: live, error: e1 }, { data: off, error: e2 }] = await Promise.all([
    db.from("tenants").select("id").in("id", ids).is("offboarded_at", null),
    db
      .from("feature_flags")
      .select("tenant_id")
      .eq("key", MCP_FLAG)
      .eq("enabled", false)
      .in("tenant_id", ids),
  ]);
  if (e1 || e2) throw new Error(`mcp: reading switches failed: ${(e1 ?? e2)?.message}`);
  const switchedOff = new Set((off ?? []).map((r) => r.tenant_id));
  return new Set((live ?? []).map((t) => t.id).filter((id) => !switchedOff.has(id)));
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
