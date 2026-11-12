import type { ServiceClient } from "@/lib/supabase/service";
import { dmWindowFor } from "./policy";

/**
 * Replies Waggle sent in a conversation since the customer's last message (T61): TikTok allows
 * 10 of them in its 48-hour window. Only counted where the platform has a cap.
 */
export async function dmRepliesSince(
  db: ServiceClient,
  input: { platform: string; conversationId: string | null; since: string | null },
): Promise<number | undefined> {
  if (!input.conversationId || !input.since) return undefined;
  if (dmWindowFor(input.platform)?.maxReplies == null) return undefined;
  const { count, error } = await db
    .from("drafts")
    .select("id, inbound_items!inner (conversation_id)", { count: "exact", head: true })
    .eq("status", "sent")
    .eq("inbound_items.conversation_id", input.conversationId)
    .gte("sent_at", input.since);
  if (error) throw new Error(`dm reply count failed: ${error.message}`);
  return count ?? 0;
}
