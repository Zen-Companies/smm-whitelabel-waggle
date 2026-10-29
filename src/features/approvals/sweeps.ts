import { transitionItem } from "@/features/inbox";
import type { ServiceClient } from "@/lib/supabase/service";
import { DM_REPLY_WINDOW_MS } from "./policy";

/** A waiting DM is escalated when less than this is left of Meta's 24-hour window (§7.2). */
export const DM_WINDOW_WARNING_MS = 60 * 60 * 1000;

/**
 * Job sweep (docs/tdd.md §7.2): DMs still waiting for approval whose reply window closes within
 * the hour are escalated, so the owner hears about them (escalation email) while they can still
 * answer on Instagram/Facebook themselves.
 */
export async function escalateClosingDmWindows(
  db: ServiceClient,
  opts: { now?: Date; tenantId?: string } = {},
): Promise<number> {
  const now = opts.now ?? new Date();
  const cutoff = new Date(now.getTime() - (DM_REPLY_WINDOW_MS - DM_WINDOW_WARNING_MS));
  let query = db
    .from("inbound_items")
    .select("id, conversations!inner (last_customer_message_at)")
    .eq("status", "awaiting_approval")
    .eq("kind", "dm")
    .lt("conversations.last_customer_message_at", cutoff.toISOString())
    .limit(50);
  if (opts.tenantId) query = query.eq("tenant_id", opts.tenantId);
  const { data, error } = await query;
  if (error) throw new Error(`closing DM window lookup failed: ${error.message}`);

  let escalated = 0;
  for (const item of data ?? []) {
    const { applied } = await transitionItem(db, {
      itemId: item.id,
      from: "awaiting_approval",
      event: "escalate",
      details: { policyReason: "dm_window_closing" },
    });
    if (applied) escalated += 1;
  }
  return escalated;
}
