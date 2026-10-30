import "server-only";
import type { ServiceClient } from "@/lib/supabase/service";
import { PRACTICE_DAILY_LIMIT } from "./practice-copy";

// Not in practice-actions.ts: every export of a "use server" file is callable from the browser,
// and this one takes any tenant id.

const dayAgo = () => new Date(Date.now() - 24 * 3_600_000).toISOString();

/** Tries in the last 24 hours (the "today" of the limit). */
export async function practiceTriesLeft(db: ServiceClient, tenantId: string): Promise<number> {
  const { count } = await db
    .from("lab_runs")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("origin", "owner")
    .gte("created_at", dayAgo());
  return Math.max(0, PRACTICE_DAILY_LIMIT - (count ?? 0));
}
