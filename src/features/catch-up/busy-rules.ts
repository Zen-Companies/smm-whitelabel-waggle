// First connect on a busy account (decided 20 Nov): sorting up to 500 pulled items can take
// 5–15 minutes, so the top questions are built early (once enough questions are sorted) and once
// more when sorting is done. Setup's steps 3 and 4 wait for them in place. Pure, tested; safe for
// client components (no server imports).

/** Questions sorted before the early top questions are built. */
export const EARLY_MIN_QUESTIONS = 50;
/** …or this long after the catch-up started, with at least one sorted question. */
export const EARLY_AFTER_MS = 2 * 60 * 1000;
/** Past this, a catch-up that never finished sorting no longer holds setup's questions back. */
export const WAIT_GIVE_UP_MS = 60 * 60 * 1000;
/** Step 3 shows only the waiting card for this long, then the usual questions below it. */
export const GENERIC_AFTER_MS = 60 * 1000;
/** How often steps 3 and 4 ask whether the questions are ready. */
export const WAIT_POLL_MS = 3000;
/** "Your customers' top 3 questions are ready". */
export const READY_LATER_TOP = 3;

export type TopQuestionsPass = "early" | "final" | null;

/**
 * Pure: which top questions pass is due for a catch-up. At most two AI calls ever: "early" while
 * sorting (once ≥ EARLY_MIN_QUESTIONS questions are sorted, or EARLY_AFTER_MS after it started
 * with at least one), then "final" once sorting is done. Nothing when either already ran.
 */
export function topQuestionsPass(input: {
  /** Pulled comments and DMs Jev sorted as questions so far. */
  questionsSorted: number;
  startedAt: Date;
  now: Date;
  /** When sorting finished (the finish pass claimed the catch-up). */
  sortedAt: string | null;
  /** When any top questions were last stored (early or final). */
  topQuestionsAt: string | null;
  /** When the final top questions were stored. */
  finalAt: string | null;
}): TopQuestionsPass {
  if (input.finalAt) return null;
  if (input.sortedAt) return "final";
  if (input.topQuestionsAt) return null;
  if (input.questionsSorted >= EARLY_MIN_QUESTIONS) return "early";
  const waited = input.now.getTime() - input.startedAt.getTime();
  return input.questionsSorted >= 1 && waited >= EARLY_AFTER_MS ? "early" : null;
}

/**
 * Pure: whether setup should wait for the customers' own questions: there's a catch-up whose
 * final top questions aren't in yet, none are cached, and it started under an hour ago (a
 * catch-up that stalled never holds setup back for good).
 */
export function waitingForTopQuestions(input: {
  hasCatchUp: boolean;
  finalAt: string | null;
  cached: number;
  startedAt: Date | null;
  now: Date;
}): boolean {
  if (!input.hasCatchUp || input.finalAt || input.cached > 0 || !input.startedAt) return false;
  return input.now.getTime() - input.startedAt.getTime() < WAIT_GIVE_UP_MS;
}

export type QuestionsWaitView =
  /** Questions are in (or there's nothing to wait for): the step as usual. */
  | "none"
  /** Step 3's first minute: only the waiting card and Skip for now. */
  | "waiting"
  /** After a minute: the waiting card, the note, and the usual questions below. */
  | "waiting-with-questions";

/** Pure: what step 3 shows while Waggle is still reading. */
export function questionsWaitView(input: {
  waiting: boolean;
  ready: boolean;
  elapsedMs: number;
}): QuestionsWaitView {
  if (!input.waiting || input.ready) return "none";
  return input.elapsedMs >= GENERIC_AFTER_MS ? "waiting-with-questions" : "waiting";
}

/**
 * Pure: the poll's answer calls for a refresh (the questions are in, or the catch-up finished
 * without any): "ready", "done", or null to keep waiting.
 */
export function refreshKey(p: {
  topQuestionsReady?: boolean;
  topQuestionsDone?: boolean;
}): string | null {
  if (p.topQuestionsReady) return "ready";
  if (p.topQuestionsDone) return "done";
  return null;
}

/** Pure: a question as the knowledge base keys it (spaces, case, ending punctuation). */
export function normalizeQuestion(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/[\s?!.。？！]+$/u, "");
}

/**
 * Pure: the top READY_LATER_TOP questions (most asked first) with no answer in the knowledge base
 * yet. An answer is a KB entry whose title is the same question (how setup's step 3 saves them).
 */
export function unansweredTopQuestions<Q extends { question: string; count: number }>(
  top: Q[],
  kbTitles: string[],
): Q[] {
  const have = new Set(kbTitles.map(normalizeQuestion));
  return [...top]
    .sort((a, b) => b.count - a.count)
    .slice(0, READY_LATER_TOP)
    .filter((q) => !have.has(normalizeQuestion(q.question)));
}
