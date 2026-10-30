import type { ServiceClient } from "@/lib/supabase/service";
import { THREAD_HISTORY_LIMIT, type ThreadMessage } from "./prompts";

// Earlier messages of a DM thread for the draft (T30): the customer's previous messages and the
// replies that actually went out, oldest first, at most THREAD_HISTORY_LIMIT. Comments have no
// thread here. Bounded on purpose: every message in it is customer text sent to the AI provider.

export function interleave(
  items: { text: string; receivedAt: string }[],
  replies: { text: string; sentAt: string }[],
  limit = THREAD_HISTORY_LIMIT,
): ThreadMessage[] {
  const all = [
    ...items.map((i) => ({ from: "customer" as const, text: i.text, at: i.receivedAt })),
    ...replies.map((r) => ({ from: "business" as const, text: r.text, at: r.sentAt })),
  ]
    .filter((m) => m.text.trim())
    .sort((a, b) => a.at.localeCompare(b.at));
  return all.slice(-limit).map(({ from, text }) => ({ from, text }));
}

export async function loadThreadHistory(
  db: ServiceClient,
  itemId: string,
): Promise<ThreadMessage[]> {
  const { data: item } = await db
    .from("inbound_items")
    .select("kind, conversation_id, received_at")
    .eq("id", itemId)
    .single();
  if (!item || item.kind !== "dm" || !item.conversation_id) return [];

  const { data: earlier } = await db
    .from("inbound_items")
    .select("id, text, received_at")
    .eq("conversation_id", item.conversation_id)
    .lt("received_at", item.received_at)
    .order("received_at", { ascending: false })
    .limit(THREAD_HISTORY_LIMIT);
  if (!earlier?.length) return [];

  const { data: sent } = await db
    .from("drafts")
    .select("body, edited_body, sent_at")
    .in(
      "item_id",
      earlier.map((e) => e.id),
    )
    .eq("status", "sent")
    .not("sent_at", "is", null);

  return interleave(
    earlier.map((e) => ({ text: e.text, receivedAt: e.received_at })),
    (sent ?? []).map((d) => ({ text: d.edited_body ?? d.body, sentAt: d.sent_at! })),
  );
}
