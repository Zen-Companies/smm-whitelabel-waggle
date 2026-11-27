import { writeAudit } from "@/lib/audit";
import type { ServiceClient } from "@/lib/supabase/service";
import { transitionItem, type ItemStatus } from "./status";

// One reply per conversation (Inbox by sender, approved 26 Nov). When a sender has several
// messages waiting, Waggle writes one reply, to the latest, with the others as its earlier
// messages; the older ones are not drafted on their own, and once that reply is sent (or the
// owner handles the conversation) they close as answered together. DMs and email only: a comment
// is answered under itself, so each comment keeps its own reply.

/** Still on its way through Waggle, or waiting on the owner: a later message that will be answered. */
const OPEN: readonly ItemStatus[] = [
  "new",
  "classified",
  "drafted",
  "awaiting_approval",
  "awaiting_draft",
  "escalated",
  "sending",
  "paused",
  "failed",
];

/** Waiting on the owner: closed when the conversation's reply goes out. */
const CLOSABLE: readonly ItemStatus[] = [
  "awaiting_approval",
  "awaiting_draft",
  "escalated",
  "failed",
];

export interface ConversationMessage {
  id: string;
  kind: string;
  status: string;
  receivedAt: string;
}

const later = (a: ConversationMessage, b: ConversationMessage) =>
  a.receivedAt > b.receivedAt || (a.receivedAt === b.receivedAt && a.id > b.id);

/**
 * Pure: true when `item` should not get a reply of its own because the same sender wrote again
 * after it and that later message is still open (it gets the one reply, with this one as context).
 */
export function answeredByLaterMessage(
  item: ConversationMessage,
  sameSender: readonly ConversationMessage[],
): boolean {
  if (item.kind !== "dm") return false;
  return sameSender.some(
    (m) =>
      m.id !== item.id &&
      m.kind === "dm" &&
      later(m, item) &&
      (OPEN as readonly string[]).includes(m.status),
  );
}

/**
 * Pure: the sender's other messages a reply to `answered` covers: DMs received up to it that
 * still wait on the owner.
 */
export function coveredByReply(
  answered: ConversationMessage,
  sameSender: readonly ConversationMessage[],
): ConversationMessage[] {
  if (answered.kind !== "dm") return [];
  return sameSender.filter(
    (m) =>
      m.id !== answered.id &&
      m.kind === "dm" &&
      !later(m, answered) &&
      (CLOSABLE as readonly string[]).includes(m.status),
  );
}

/** The same sender's messages on the same account (the Inbox row), newest first, at most 50. */
export async function loadSameSender(
  db: ServiceClient,
  itemId: string,
): Promise<{ item: ConversationMessage & { tenantId: string }; others: ConversationMessage[] } | null> {
  const { data: item, error } = await db
    .from("inbound_items")
    .select("id, tenant_id, kind, status, received_at, group_key")
    .eq("id", itemId)
    .maybeSingle();
  if (error) throw new Error(`same sender: item lookup failed: ${error.message}`);
  if (!item) return null;
  const self = {
    id: item.id,
    tenantId: item.tenant_id,
    kind: item.kind,
    status: item.status,
    receivedAt: item.received_at,
  };
  if (item.kind !== "dm" || !item.group_key) return { item: self, others: [] };
  const { data: rows, error: rowsError } = await db
    .from("inbound_items")
    .select("id, kind, status, received_at")
    .eq("tenant_id", item.tenant_id)
    .eq("group_key", item.group_key)
    .neq("id", item.id)
    .order("received_at", { ascending: false })
    .limit(50);
  if (rowsError) throw new Error(`same sender: lookup failed: ${rowsError.message}`);
  return {
    item: self,
    others: (rows ?? []).map((r) => ({
      id: r.id,
      kind: r.kind,
      status: r.status,
      receivedAt: r.received_at,
    })),
  };
}

/**
 * The sender's earlier waiting messages close as answered together with `itemId` (its reply was
 * sent, or the owner handled the conversation): each through the status machine, its unsent
 * draft superseded, and one audit row. Returns how many closed.
 */
export async function closeAnsweredTogether(
  db: ServiceClient,
  input: { itemId: string; /** "system" or the owner's user id. */ actor: string },
): Promise<number> {
  const found = await loadSameSender(db, input.itemId);
  if (!found) return 0;
  const covered = coveredByReply(found.item, found.others);
  let closed = 0;
  for (const m of covered) {
    const { applied } = await transitionItem(db, {
      itemId: m.id,
      from: m.status as ItemStatus,
      event: "answered_together",
      details: { answeredWith: input.itemId },
    });
    if (!applied) continue;
    closed += 1;
    await db
      .from("drafts")
      .update({ status: "superseded" })
      .eq("item_id", m.id)
      .in("status", ["pending", "failed"]);
    await writeAudit(db, {
      tenantId: found.item.tenantId,
      itemId: m.id,
      action: "answered_together",
      actor: input.actor,
      details: { answeredWith: input.itemId, previousStatus: m.status },
    });
  }
  return closed;
}
