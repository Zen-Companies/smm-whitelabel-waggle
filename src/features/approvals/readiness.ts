// "Ready to reply on its own?" (T27, docs/tdd.md §19). "Ask me first" is the rehearsal: the
// owner's own decisions on drafts over the last 14 days say whether a category has earned
// auto-send. Advice only; the switch stays the owner's.

export const READINESS_DAYS = 14;
/** At least this many sent as written… */
export const READY_MIN_SENT = 10;
/** …and at most this share edited or rejected. Check against pilot data. */
export const READY_MAX_CHANGED = 0.1;

export interface ReadinessCounts {
  /** Approved and sent (or on its way) without changes. */
  asWritten: number;
  edited: number;
  rejected: number;
}

export interface Readiness {
  ready: boolean;
  summary: string | null;
  verdict: string;
}

/** Owner-decided drafts → counts. Auto-sent drafts (no owner decision) don't count. */
export function countDecisions(
  drafts: { status: string; edited_body: string | null; decided_by: string | null }[],
): ReadinessCounts {
  const counts: ReadinessCounts = { asWritten: 0, edited: 0, rejected: 0 };
  for (const d of drafts) {
    if (!d.decided_by) continue;
    if (d.status === "rejected") counts.rejected += 1;
    else if (d.edited_body !== null) counts.edited += 1;
    else if (d.status === "sent" || d.status === "approved") counts.asWritten += 1;
  }
  return counts;
}

const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

export function readiness(c: ReadinessCounts): Readiness {
  const total = c.asWritten + c.edited + c.rejected;
  if (total === 0) {
    return {
      ready: false,
      summary: null,
      verdict: `Not ready yet: no replies checked in the last ${READINESS_DAYS} days.`,
    };
  }
  const summary =
    `Last ${READINESS_DAYS} days: ${n(total, "reply", "replies")} drafted. ` +
    `You sent ${c.asWritten} as written, edited ${c.edited === 0 ? "none" : c.edited}, ` +
    `rejected ${c.rejected === 0 ? "none" : c.rejected}.`;
  const changed = c.edited + c.rejected;
  if (changed / total > READY_MAX_CHANGED) {
    return { ready: false, summary, verdict: `Not ready yet: you changed ${changed} of ${total}.` };
  }
  if (c.asWritten < READY_MIN_SENT) {
    return {
      ready: false,
      summary,
      verdict: `Not ready yet: ${n(READY_MIN_SENT - c.asWritten, "more reply", "more replies")} to check first.`,
    };
  }
  return { ready: true, summary, verdict: "Ready to reply on its own." };
}

/** The progress bar (T36 item 1): sent as written, out of the total or the minimum, whichever is more. */
export function readinessProgress(c: ReadinessCounts): { done: number; of: number } {
  const total = c.asWritten + c.edited + c.rejected;
  return { done: c.asWritten, of: Math.max(total, READY_MIN_SENT) };
}

export interface TopicChanges {
  /** null: the reply used no Business info. */
  topicId: string | null;
  title: string;
  count: number;
}

/**
 * Where the owner made changes (T36 item 2): edited or rejected drafts grouped by the Business info
 * topic the reply was based on (its best match, the first of kb_entry_ids), most changes first.
 */
export function changesByTopic(
  drafts: {
    status: string;
    edited_body: string | null;
    decided_by: string | null;
    kb_entry_ids: string[];
  }[],
  titles: Map<string, string>,
): TopicChanges[] {
  const groups = new Map<string, TopicChanges>();
  for (const d of drafts) {
    if (!d.decided_by) continue;
    const changed = d.status === "rejected" || d.edited_body !== null;
    if (!changed) continue;
    const id = d.kb_entry_ids[0] ?? null;
    const title = id ? (titles.get(id) ?? "A topic you removed") : "No business info";
    const key = id ?? "none";
    const g = groups.get(key) ?? { topicId: id && titles.has(id) ? id : null, title, count: 0 };
    g.count += 1;
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => b.count - a.count);
}
