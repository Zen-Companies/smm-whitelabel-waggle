import type { ServiceClient } from "@/lib/supabase/service";
import { THREAD_HISTORY_LIMIT, THREAD_HISTORY_MAX, type ThreadMessage } from "./prompts";

// Earlier messages of a DM thread for the draft (T30): the customer's previous messages and the
// replies that actually went out, oldest first, at most THREAD_HISTORY_LIMIT. Comments have no
// thread here. Bounded on purpose: every message in it is customer text sent to the AI provider.
// Inbox by sender (26 Nov): the thread is the sender's Inbox row (an email sender across their
// threads), and the customer's messages still waiting are marked, and kept (up to
// THREAD_HISTORY_MAX), because the one reply answers them too.

export function interleave(
  items: { text: string; receivedAt: string; waiting?: boolean }[],
  replies: { text: string; sentAt: string }[],
  limit = THREAD_HISTORY_LIMIT,
): ThreadMessage[] {
  const all = [
    ...items.map((i) => ({
      from: "customer" as const,
      text: i.text,
      at: i.receivedAt,
      waiting: i.waiting === true,
    })),
    ...replies.map((r) => ({ from: "business" as const, text: r.text, at: r.sentAt, waiting: false })),
  ]
    .filter((m) => m.text.trim())
    .sort((a, b) => a.at.localeCompare(b.at));
  return all
    .slice(-limit)
    .map(({ from, text, waiting }) => (waiting ? { from, text, waiting } : { from, text }));
}

/** Statuses of a customer message nobody has answered yet. */
const UNANSWERED = new Set([
  "new",
  "classified",
  "drafted",
  "awaiting_approval",
  "awaiting_draft",
  "escalated",
  "failed",
  "paused",
]);

export const isUnanswered = (status: string) => UNANSWERED.has(status);

/**
 * Pure: how many history messages to send: THREAD_HISTORY_LIMIT, or enough to reach the oldest
 * waiting message (newest first in `earlierNewestFirst`), at most THREAD_HISTORY_MAX.
 */
export function historyLimit(earlierNewestFirst: { waiting: boolean }[]): number {
  let oldestWaiting = -1;
  earlierNewestFirst.forEach((m, i) => {
    if (m.waiting) oldestWaiting = i;
  });
  return Math.min(THREAD_HISTORY_MAX, Math.max(THREAD_HISTORY_LIMIT, oldestWaiting + 1));
}

export async function loadThreadHistory(
  db: ServiceClient,
  itemId: string,
): Promise<ThreadMessage[]> {
  const { data: item } = await db
    .from("inbound_items")
    .select("kind, tenant_id, conversation_id, group_key, received_at")
    .eq("id", itemId)
    .single();
  if (!item || item.kind !== "dm" || !item.conversation_id) return [];

  // The sender's row (group_key); a message stored before it existed falls back to its thread.
  let query = db
    .from("inbound_items")
    .select("id, text, received_at, status")
    .eq("tenant_id", item.tenant_id)
    .eq("kind", "dm")
    .neq("status", "ignored")
    .lt("received_at", item.received_at);
  query = item.group_key
    ? query.eq("group_key", item.group_key)
    : query.eq("conversation_id", item.conversation_id);
  const { data: earlier } = await query
    .order("received_at", { ascending: false })
    .limit(THREAD_HISTORY_MAX);
  if (!earlier?.length) return [];
  const marked = earlier.map((e) => ({ ...e, waiting: isUnanswered(e.status) }));

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
    marked.map((e) => ({ text: e.text, receivedAt: e.received_at, waiting: e.waiting })),
    (sent ?? []).map((d) => ({ text: d.edited_body ?? d.body, sentAt: d.sent_at! })),
    historyLimit(marked),
  );
}
