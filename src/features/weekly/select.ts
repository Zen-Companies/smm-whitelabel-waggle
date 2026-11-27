import { needsReply, sortConversation } from "@/features/catch-up";
import type { ProviderComment, ProviderMessage } from "@/lib/social/types";

// Weekly check-up (board "Your week", approved 26 Nov): what to do with each message read from an
// account. No double drafts, the owner's explicit rule: every message is matched against what
// Waggle already has, by the platform's own message id. Pure, tested.
//
//   known            Waggle has it (any status, any draft, even a draft thrown away): only counted.
//   answered_by_you  answered on the platform itself (or already replied to): counted, no draft.
//   insert           Waggle never saw it and it can still be answered: into the Inbox, one draft.
//   too_old          a DM whose reply window closed: counted as missed, no draft.
//   covered          an older unanswered DM in a conversation whose newer messages are added: the
//                    one reply answers it too (Inbox by sender), so it is counted as waiting.
//   no_reply_needed  praise, friend tags, giveaway entries: counted, no draft.

export type WeekOutcome =
  "known" | "answered_by_you" | "insert" | "too_old" | "covered" | "no_reply_needed";

/** Two copies of one DM stored seconds apart (a webhook without the platform's id). */
const SAME_MESSAGE_MS = 5_000;

export interface KnownItemRow {
  kind: string;
  zernio_comment_id: string | null;
  platform_message_id: string | null;
  zernio_message_id: string | null;
  received_at: string;
  /** The item's conversation's Zernio id (DMs). */
  zernio_conversation_id: string | null;
}

export interface KnownMessages {
  commentIds: ReadonlySet<string>;
  /** Platform message ids and Zernio message ids of DMs Waggle has, and first-connect missed DMs. */
  dmIds: ReadonlySet<string>;
  /** Per Zernio conversation id: when each of its stored DMs was received (ms). */
  dmTimes: ReadonlyMap<string, readonly number[]>;
}

export function knownMessages(input: {
  items: readonly KnownItemRow[];
  /** missed_messages.platform_message_id of the account (first connect's locked DMs). */
  missed: readonly string[];
}): KnownMessages {
  const commentIds = new Set<string>();
  const dmIds = new Set<string>(input.missed);
  const dmTimes = new Map<string, number[]>();
  for (const r of input.items) {
    if (r.zernio_comment_id) commentIds.add(r.zernio_comment_id);
    if (r.kind !== "dm") continue;
    if (r.platform_message_id) dmIds.add(r.platform_message_id);
    if (r.zernio_message_id) dmIds.add(r.zernio_message_id);
    if (r.zernio_conversation_id) {
      const list = dmTimes.get(r.zernio_conversation_id) ?? [];
      list.push(Date.parse(r.received_at));
      dmTimes.set(r.zernio_conversation_id, list);
    }
  }
  return { commentIds, dmIds, dmTimes };
}

const inWeek = (iso: string | null, from: Date, to: Date): boolean => {
  if (!iso) return false;
  const t = Date.parse(iso);
  return Number.isFinite(t) && t >= from.getTime() && t < to.getTime();
};

/** A comment's outcome, or null when it isn't a customer's comment from the week. */
export function sortWeekComment(
  c: ProviderComment,
  ctx: { known: KnownMessages; from: Date; to: Date; giveaway: boolean },
): WeekOutcome | null {
  if (c.fromOwner || !inWeek(c.createdAt, ctx.from, ctx.to)) return null;
  if (ctx.known.commentIds.has(c.id)) return "known";
  if (c.ownerReplied) return "answered_by_you";
  if (ctx.giveaway || !needsReply(c.text)) return "no_reply_needed";
  return "insert";
}

function knownDm(m: ProviderMessage, conversationId: string, known: KnownMessages): boolean {
  if (known.dmIds.has(m.id)) return true;
  const at = Date.parse(m.createdAt);
  return (known.dmTimes.get(conversationId) ?? []).some((t) => Math.abs(t - at) <= SAME_MESSAGE_MS);
}

/**
 * One conversation's customer messages from the week, each with its outcome. Whether a message
 * was answered looks at the whole conversation (a reply after the week still counts); what can be
 * drafted follows the first-connect rules (catch-up's sortConversation) with the platform's own
 * reply window (null: none).
 */
export function sortWeekConversation(
  conversationId: string,
  messages: readonly ProviderMessage[],
  ctx: {
    known: KnownMessages;
    from: Date;
    to: Date;
    now: Date;
    replyWindowMs: number | null;
  },
): { message: ProviderMessage; outcome: WeekOutcome }[] {
  const { draft, missed } = sortConversation([...messages], ctx.now, ctx.from, ctx.replyWindowMs);
  const toDraft = new Set(draft.map((m) => m.id));
  const tooOld = new Set(missed.map((m) => m.id));
  // The customer's messages after the business's last reply (whole conversation).
  const newestFirst = [...messages]
    .filter((m) => Number.isFinite(Date.parse(m.createdAt)))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const unanswered = new Set<string>();
  for (const m of newestFirst) {
    if (m.direction !== "incoming") break;
    unanswered.add(m.id);
  }
  return newestFirst
    .filter((m) => m.direction === "incoming" && inWeek(m.createdAt, ctx.from, ctx.to))
    .reverse()
    .map((message) => {
      let outcome: WeekOutcome;
      if (knownDm(message, conversationId, ctx.known)) outcome = "known";
      else if (!unanswered.has(message.id)) outcome = "answered_by_you";
      else if (toDraft.has(message.id)) outcome = "insert";
      else if (tooOld.has(message.id)) outcome = "too_old";
      else outcome = "covered";
      return { message, outcome };
    });
}
