import type { ServiceClient } from "@/lib/supabase/service";

/** Drafts waiting longer than this get one nudge email (§7.2). */
export const DRAFT_NUDGE_AFTER = "30 minutes";

/** Queues one draft_waiting alert per tenant for drafts newly past 30 minutes. */
export async function enqueueDraftNudges(db: ServiceClient): Promise<number> {
  const { data, error } = await db.rpc("enqueue_draft_nudges", { p_older_than: DRAFT_NUDGE_AFTER });
  if (error) throw new Error(`enqueue_draft_nudges failed: ${error.message}`);
  return data ?? 0;
}
