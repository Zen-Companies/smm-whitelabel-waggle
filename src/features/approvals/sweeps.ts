import { transitionItem } from "@/features/inbox";
import type { ServiceClient } from "@/lib/supabase/service";
import { DM_REPLY_WINDOW_MS, dmWindowClosesAt } from "./policy";

/** A waiting DM is escalated when less than this is left of its reply window (§7.2). */
export const DM_WINDOW_WARNING_MS = 60 * 60 * 1000;

/**
 * Job sweep (docs/tdd.md §7.2): DMs still waiting for approval whose reply window closes within
 * the hour are escalated, so the owner hears about them (escalation email) while they can still
 * answer on the platform themselves. Each platform has its own window (Meta 24 h, TikTok 48 h);
 * Meta's is the shortest, so the lookup starts there and the rest is checked per row.
 */
export async function escalateClosingDmWindows(
  db: ServiceClient,
  opts: { now?: Date; tenantId?: string } = {},
): Promise<number> {
  const now = opts.now ?? new Date();
  const cutoff = new Date(now.getTime() - (DM_REPLY_WINDOW_MS - DM_WINDOW_WARNING_MS));
  let query = db
    .from("inbound_items")
    .select("id, conversations!inner (last_customer_message_at), social_accounts!inner (platform)")
    .eq("status", "awaiting_approval")
    .eq("kind", "dm")
    .lt("conversations.last_customer_message_at", cutoff.toISOString())
    .limit(200);
  if (opts.tenantId) query = query.eq("tenant_id", opts.tenantId);
  const { data, error } = await query;
  if (error) throw new Error(`closing DM window lookup failed: ${error.message}`);

  let escalated = 0;
  const closing = (
    (data ?? []) as unknown as {
      id: string;
      conversations: { last_customer_message_at: string };
      social_accounts: { platform: string };
    }[]
  ).filter((item) => {
    const closes = dmWindowClosesAt(
      item.social_accounts.platform,
      new Date(item.conversations.last_customer_message_at),
    );
    return !!closes && closes.getTime() - now.getTime() < DM_WINDOW_WARNING_MS;
  });
  for (const item of closing) {
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
