import "server-only";
import type { ServiceClient } from "@/lib/supabase/service";
import { GAP_HELPER_DAILY_LIMIT } from "./gap-helper";

// Not in gap-actions.ts: every export of a "use server" file is callable from the browser, and
// this one takes any tenant id.

/** Gap-helper runs left in the last 24 hours (the "today" of the limit). */
export async function gapHelperRunsLeft(db: ServiceClient, tenantId: string): Promise<number> {
  const { count } = await db
    .from("audit_log")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("action", "kb_suggestions_requested")
    .gte("created_at", new Date(Date.now() - 24 * 3_600_000).toISOString());
  return Math.max(0, GAP_HELPER_DAILY_LIMIT - (count ?? 0));
}
