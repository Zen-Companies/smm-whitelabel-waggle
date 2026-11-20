// Response score (decision 5, Febron 20 Nov): the share of customer messages in the last 30 days
// that got an answer within 24 hours, × 100, rounded. "Needs work" under 60, "Good" 60–84, "Great"
// 85 and up. Hidden with fewer than 5 messages. Pure; the catch-up job counts while it reads
// (job.ts), setup's "here's your last 30 days" shows it.
//
// What counts: a customer's comment that needs a reply (needsReply, not a giveaway post) and every
// customer DM. Answered: the business's first reply came within 24 hours (comments: the account's
// own reply among the inline replies Zernio carries; DMs: the next message the business sent).
// A message still inside its first 24 hours with no answer yet is left out: it can still be
// answered in time.

const DAY_MS = 24 * 60 * 60 * 1000;

/** Answered within this long counts. */
export const RESPONSE_WINDOW_MS = DAY_MS;
/** Fewer messages than this: no score (too few to say anything). */
export const RESPONSE_SCORE_MIN = 5;

export interface ResponseTally {
  messages: number;
  answered: number;
}

export const emptyTally = (): ResponseTally => ({ messages: 0, answered: 0 });

export function addTally(a: ResponseTally, b: ResponseTally): ResponseTally {
  return { messages: a.messages + b.messages, answered: a.answered + b.answered };
}

const time = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
};

/**
 * One customer comment: "answered" (the business replied within 24 hours), "missed", or null
 * when it doesn't count (outside the window, the business's own, or still open under 24 hours).
 * `ownerReplied` with no time known counts as answered: the reply is there, its time isn't.
 */
export function commentResponse(
  c: {
    createdAt: string | null;
    fromOwner: boolean;
    ownerReplied?: boolean;
    ownerRepliedAt?: string | null;
  },
  since: Date,
  now: Date,
): "answered" | "missed" | null {
  if (c.fromOwner) return null;
  const at = time(c.createdAt);
  if (at === null || at < since.getTime()) return null;
  const replied = time(c.ownerRepliedAt);
  if (replied !== null) return replied - at <= RESPONSE_WINDOW_MS ? "answered" : "missed";
  if (c.ownerReplied) return "answered";
  return now.getTime() - at < RESPONSE_WINDOW_MS ? null : "missed";
}

/** A DM conversation's customer messages since `since`, each judged by the next business reply. */
export function conversationResponse(
  messages: { direction: "incoming" | "outgoing"; createdAt: string }[],
  since: Date,
  now: Date,
): ResponseTally {
  const sorted = messages
    .map((m) => ({ direction: m.direction, at: time(m.createdAt) }))
    .filter((m): m is { direction: "incoming" | "outgoing"; at: number } => m.at !== null)
    .sort((a, b) => a.at - b.at);
  const tally = emptyTally();
  for (let i = 0; i < sorted.length; i += 1) {
    const m = sorted[i];
    if (m.direction !== "incoming" || m.at < since.getTime()) continue;
    const reply = sorted.slice(i + 1).find((r) => r.direction === "outgoing" && r.at >= m.at);
    if (reply) {
      tally.messages += 1;
      if (reply.at - m.at <= RESPONSE_WINDOW_MS) tally.answered += 1;
    } else if (now.getTime() - m.at >= RESPONSE_WINDOW_MS) {
      tally.messages += 1;
    }
  }
  return tally;
}

export type ResponseWord = "Needs work" | "Good" | "Great";

export interface ResponseScore {
  /** 0–100. */
  score: number;
  word: ResponseWord;
  messages: number;
  answered: number;
}

export function responseWord(score: number): ResponseWord {
  if (score >= 85) return "Great";
  if (score >= 60) return "Good";
  return "Needs work";
}

/** The score, or null when fewer than RESPONSE_SCORE_MIN messages were counted. */
export function responseScore(t: ResponseTally): ResponseScore | null {
  if (t.messages < RESPONSE_SCORE_MIN) return null;
  const answered = Math.min(t.answered, t.messages);
  const score = Math.round((100 * answered) / t.messages);
  return { score, word: responseWord(score), messages: t.messages, answered };
}
