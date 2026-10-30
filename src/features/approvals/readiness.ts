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
