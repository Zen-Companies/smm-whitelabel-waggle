// usage_80 / usage_100: AI replies at 80% and 100% of the month's allowance, once a month each.
// Checked by the jobs route every 15 minutes for organizations with a live plan.

import { loadReplyLimit } from "@/features/billing";
import { queueForOwners } from "@/lib/crm";
import type { ServiceClient } from "@/lib/supabase/service";

export async function sweepUsage(db: ServiceClient, now = new Date()): Promise<number> {
  const { data, error } = await db
    .from("org_billing")
    .select("organization_id")
    .in("status", ["trialing", "active", "past_due"]);
  if (error) throw new Error(`crm: usage sweep failed: ${error.message}`);
  const month = now.toISOString().slice(0, 7);
  let queued = 0;
  for (const { organization_id: orgId } of data ?? []) {
    const status = await loadReplyLimit(db, orgId, now);
    if (!status || status.limit.level === "ok") continue;
    // At 100% both are due if 80% was skipped (a big jump): the dedupe keeps each to once.
    const events = status.limit.level === "reached" ? ["usage_80", "usage_100"] : ["usage_80"];
    for (const event of events as ("usage_80" | "usage_100")[]) {
      await queueForOwners(db, orgId, { event, dedupeKey: `${event}:${orgId}:${month}` });
      queued += 1;
    }
  }
  return queued;
}
