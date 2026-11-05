import { median, percentDelta, type Delta } from "./format";

// Waggle's work (T52): what Waggle did in the period, from our own tables. Pure.
//
// "Answered by Waggle" is the inbox's "Answered on its own" (T27): a sent reply nobody approved
// (`drafts.decided_by` is null). A reply the owner approved, edited or wrote is "Sent by you".

export const MINUTES_PER_REPLY = 2;

export interface WorkItem {
  id: string;
  receivedAt: string;
  category: string | null;
}

export interface WorkReply {
  itemId: string;
  itemReceivedAt: string;
  sentAt: string;
  byWaggle: boolean;
  kbEntryIds: string[];
}

export interface WorkInput {
  days: string[];
  items: WorkItem[];
  previousItemCount: number;
  replies: WorkReply[];
  leads: number;
  /** Reason codes of messages handed to the owner in the period (from the audit log). */
  handedOver: (string | null)[];
  kbTitles: Map<string, string>;
}

export interface WorkSummary {
  messagesIn: number;
  messagesInDelta: Delta | null;
  byWaggle: number;
  byYou: number;
  /** Share of replies Waggle sent on its own, 0-100; null with no replies. */
  waggleShare: number | null;
  /** Median seconds from message to first reply. */
  firstReplyWaggle: number | null;
  firstReplyYou: number | null;
  leads: number;
  minutesSaved: number;
  perDay: { date: string; waggle: number; you: number }[];
  cameIn: { label: string; count: number }[];
  mostAsked: { title: string; count: number }[];
  neededYou: { reason: string; label: string; count: number }[];
}

const CATEGORY_WORDS: Record<string, string> = {
  faq: "Questions",
  lead: "Leads",
  complaint: "Complaints",
  unclear: "Not sure",
  spam: "Spam",
};

/** Why a message came to the owner, in the owner's words (design.md §7). */
export const HANDED_OVER_WORDS: Record<string, string> = {
  needs_human: "Not in your Business info",
  complaint: "Complaints",
  unclear: "Not sure what they meant",
  low_confidence: "Not sure what they meant",
  dm_window_closed: "DM window closed first",
  dm_window_closing: "DM window about to close",
  mode_off: "Replies are off for that kind",
  ai_cap_reached: "AI allowance used up",
  retries_exhausted: "Couldn't be sent",
  send_rejected: "Couldn't be sent",
  delivery_failed: "Couldn't be sent",
  account_inactive: "Account disconnected",
};

const countBy = <T>(values: T[], key: (v: T) => string | null) => {
  const out = new Map<string, number>();
  for (const v of values) {
    const k = key(v);
    if (k !== null) out.set(k, (out.get(k) ?? 0) + 1);
  }
  return out;
};

const byCountDesc = (a: { count: number }, b: { count: number }) => b.count - a.count;

export function summarizeWork(input: WorkInput): WorkSummary {
  const byWaggle = input.replies.filter((r) => r.byWaggle).length;
  const byYou = input.replies.length - byWaggle;

  // Time to first reply: each message's earliest reply, split by who sent it.
  const first = new Map<string, WorkReply>();
  for (const r of input.replies) {
    const seen = first.get(r.itemId);
    if (!seen || r.sentAt < seen.sentAt) first.set(r.itemId, r);
  }
  const waits = (waggle: boolean) =>
    [...first.values()]
      .filter((r) => r.byWaggle === waggle)
      .map((r) => Math.max(0, (Date.parse(r.sentAt) - Date.parse(r.itemReceivedAt)) / 1000));

  const perDay = new Map(input.days.map((d) => [d, { date: d, waggle: 0, you: 0 }]));
  for (const r of input.replies) {
    const day = perDay.get(r.sentAt.slice(0, 10));
    if (day) day[r.byWaggle ? "waggle" : "you"] += 1;
  }

  const cameIn = [...countBy(input.items, (i) => i.category ?? "unsorted")]
    .map(([k, count]) => ({ label: CATEGORY_WORDS[k] ?? "Not sorted yet", count }))
    .sort(byCountDesc);

  const topics = countBy(
    input.replies.flatMap((r) => r.kbEntryIds),
    (id) => input.kbTitles.get(id) ?? null,
  );
  const mostAsked = [...topics]
    .map(([title, count]) => ({ title, count }))
    .sort(byCountDesc)
    .slice(0, 5);

  const reasons = countBy(input.handedOver, (r) => r ?? "other");
  const merged = new Map<string, { reason: string; label: string; count: number }>();
  for (const [reason, count] of reasons) {
    const label = HANDED_OVER_WORDS[reason] ?? "Other reasons";
    const row = merged.get(label) ?? { reason, label, count: 0 };
    row.count += count;
    merged.set(label, row);
  }

  return {
    messagesIn: input.items.length,
    messagesInDelta: percentDelta(input.items.length, input.previousItemCount),
    byWaggle,
    byYou,
    waggleShare: input.replies.length ? Math.round((byWaggle / input.replies.length) * 100) : null,
    firstReplyWaggle: median(waits(true)),
    firstReplyYou: median(waits(false)),
    leads: input.leads,
    minutesSaved: byWaggle * MINUTES_PER_REPLY,
    perDay: [...perDay.values()],
    cameIn,
    mostAsked,
    neededYou: [...merged.values()].sort(byCountDesc),
  };
}
