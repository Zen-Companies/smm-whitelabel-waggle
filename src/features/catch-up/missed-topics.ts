// Locked DMs sorted during the 30-day read (setup's "What they wanted", approved 23 Nov): one
// classifier call per conversation, at most MISSED_CLASSIFY_CAP per catch-up; the rest are left
// to setup's keywords. Pure, tested.

/** Conversations of locked DMs sorted per catch-up; beyond it, setup falls back to keywords. */
export const MISSED_CLASSIFY_CAP = 50;
/** The joined text sent to the classifier keeps its newest end, this long at most. */
export const MISSED_TEXT_MAX = 1000;

export type MissedRow = {
  zernio_conversation_id: string;
  text: string;
  received_at: string;
  category: string | null;
};

/**
 * The conversations still to sort, newest first, within what is left of the cap (conversations
 * already sorted count against it). Each one's text is its messages oldest first, newest last,
 * cut from the start when too long. Conversations with no words are skipped.
 */
export function missedToClassify(
  rows: readonly MissedRow[],
  cap: number = MISSED_CLASSIFY_CAP,
): { conversationId: string; text: string }[] {
  const byConversation = new Map<string, MissedRow[]>();
  for (const r of rows) {
    const list = byConversation.get(r.zernio_conversation_id) ?? [];
    list.push(r);
    byConversation.set(r.zernio_conversation_id, list);
  }
  const sorted = [...byConversation.values()].filter((list) => list.some((r) => r.category));
  const left = Math.max(0, cap - sorted.length);
  const newest = (list: MissedRow[]) => Math.max(...list.map((r) => Date.parse(r.received_at)));
  return [...byConversation.entries()]
    .filter(([, list]) => !list.some((r) => r.category))
    .map(([conversationId, list]) => {
      const text = [...list]
        .sort((a, b) => Date.parse(a.received_at) - Date.parse(b.received_at))
        .map((r) => r.text.trim())
        .filter(Boolean)
        .join("\n");
      return { conversationId, text: text.slice(-MISSED_TEXT_MAX), at: newest(list) };
    })
    .filter((c) => c.text.length > 0)
    .sort((a, b) => b.at - a.at)
    .slice(0, left)
    .map(({ conversationId, text }) => ({ conversationId, text }));
}
