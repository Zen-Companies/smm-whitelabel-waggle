// Spaced-out sending (decided 20 Nov, first connect board "Sending, nothing to approve, and coming
// back"). Approving stays instant, but replies from the same social account go out at least
// SEND_SPACING_MS apart, so Instagram never sees a burst (20 approvals in a minute). Pure.
//
// Two layers: approving books the reply a slot (next_run_at) at least this far from every other
// reply booked on the account, never earlier than the undo window; and the send step checks the
// account's last send again right before sending, waiting (RetryLaterError: no attempt counted)
// if another reply went out too recently.

/** The least time between two replies from the same social account. */
export const SEND_SPACING_MS = 25_000;

/** Approvals further apart than this are separate rounds for "Sending N of M". */
export const SENDING_ROUND_GAP_MS = 10 * 60_000;

/**
 * The earliest moment at or after `earliestMs` that is at least `spacingMs` from every time in
 * `takenMs` (replies already booked or sent on the account). Fills a gap between bookings when
 * there is room, so a reply held back for minutes (a retry) doesn't push new ones after it.
 */
export function nextSendSlot(earliestMs: number, takenMs: number[], spacingMs: number): number {
  if (spacingMs <= 0) return earliestMs;
  let slot = earliestMs;
  for (const taken of [...takenMs].sort((a, b) => a - b)) {
    if (taken <= slot - spacingMs) continue;
    if (taken >= slot + spacingMs) break;
    slot = taken + spacingMs;
  }
  return slot;
}

/** How long a reply must still wait after the account's last send (0: it can go now). */
export function spacingWaitMs(nowMs: number, lastSendMs: number | null, spacingMs: number): number {
  if (lastSendMs === null || spacingMs <= 0) return 0;
  return Math.max(0, lastSendMs + spacingMs - nowMs);
}

export interface ApprovedReplyRow {
  /** When the owner approved it. */
  decidedAt: string;
  /** Sent already; otherwise still waiting its turn. */
  sent: boolean;
}

export interface SendingProgress {
  /** The reply going out now: "Sending 3 of 20…". */
  current: number;
  total: number;
  sent: number;
  queued: number;
}

/**
 * "Sending N of M…" for a brand: the current round is every reply still waiting its turn plus
 * the ones sent just before them (approvals no more than SENDING_ROUND_GAP_MS apart). Null when
 * nothing is queued or the round is a single reply (the Sent row covers that).
 */
export function sendingProgress(rows: ApprovedReplyRow[]): SendingProgress | null {
  const queuedTimes = rows.filter((r) => !r.sent).map((r) => Date.parse(r.decidedAt));
  if (queuedTimes.length === 0) return null;
  const sorted = [...rows].sort((a, b) => Date.parse(b.decidedAt) - Date.parse(a.decidedAt));
  const firstQueued = Math.min(...queuedTimes);
  let roundStart = firstQueued;
  // Walk back from the first queued reply over sent ones approved just before it.
  for (const row of sorted) {
    const at = Date.parse(row.decidedAt);
    if (at >= firstQueued) continue;
    if (roundStart - at > SENDING_ROUND_GAP_MS) break;
    roundStart = at;
  }
  const round = rows.filter((r) => Date.parse(r.decidedAt) >= roundStart);
  const total = round.length;
  if (total < 2) return null;
  const sent = round.filter((r) => r.sent).length;
  return { current: Math.min(sent + 1, total), total, sent, queued: total - sent };
}
