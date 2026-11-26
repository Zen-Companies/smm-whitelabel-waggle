import { senderAddress } from "./email-text";

// Inbox by sender (approved 26 Nov): one Inbox row per sender per connected account. The key is
// saved on every message when it arrives (inbound_items.sender_key); the database builds the row
// key from it (group_key). Pure. Must match private.fallback_sender_key in the migration
// 20261126120000_inbox_by_sender.sql for messages stored without one.

const MAX = 320;

export type SenderKeyInput =
  | {
      kind: "dm";
      email: boolean;
      sender: { id?: string | null; username?: string | null; name?: string | null };
    }
  | { kind: "comment"; authorId?: string | null; authorName?: string | null }
  | { kind: "review" | "call" };

/**
 * Email: the sender's address, lower-case (any field that holds one), else their id lower-case.
 * DMs: the platform's sender id. Comments: the commenter's id, else "name:" and their handle.
 * Reviews and calls: none (each is its own row).
 */
export function senderKeyFor(input: SenderKeyInput): string | null {
  if (input.kind === "dm") {
    if (input.email) {
      const address = senderAddress(input.sender);
      const id = input.sender.id?.trim().toLowerCase();
      return clip(address ?? (id || null));
    }
    return clip(input.sender.id?.trim() || null);
  }
  if (input.kind === "comment") {
    const id = input.authorId?.trim();
    if (id) return clip(id);
    // btrim(author_name, ' @') in SQL: spaces and @ off both ends.
    const handle = input.authorName?.replace(/^[ @]+|[ @]+$/g, "").toLowerCase();
    return handle ? clip(`name:${handle}`) : null;
  }
  return null;
}

const clip = (v: string | null) => (v ? v.slice(0, MAX) : null);
