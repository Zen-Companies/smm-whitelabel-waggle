import type { Category, UnclearReason } from "./types";

// docs/tdd.md §9.3. Code constants until T7 tunes them on fixtures.
export const YES = 0.5;
export const SPAM_YES = 0.85;
export const MIN_CONFIDENCE = 0.5;
export const SPAM_MIN_WORDS = 4;

/** Safest first: a higher category wins any overlap. `unclear` is never asked. */
export const PRECEDENCE = ["complaint", "lead", "faq", "spam"] as const;
export type AskedCategory = (typeof PRECEDENCE)[number];
export type CategoryScores = Record<AskedCategory, number>;

export interface PickedCategory {
  category: Category;
  confidence: number;
  reason?: UnclearReason;
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed === "" ? 0 : trimmed.split(/\s+/).length;
}

/**
 * Picks the category from independent yes-probabilities (they don't sum to 1).
 * confidence = p[winner] × Π(1 − p[h]) over the categories above the winner.
 */
export function pickCategory(scores: CategoryScores, opts: { wordCount: number }): PickedCategory {
  // Short replies ("ok", "thanks") score high on the off-topic question: they can never be spam.
  const p: CategoryScores = opts.wordCount < SPAM_MIN_WORDS ? { ...scores, spam: 0 } : scores;

  const unclear = (reason: UnclearReason): PickedCategory => ({
    category: "unclear",
    confidence: 1 - Math.max(...PRECEDENCE.map((c) => p[c])),
    reason,
  });

  const winnerIndex = PRECEDENCE.findIndex((c) => p[c] >= (c === "spam" ? SPAM_YES : YES));
  if (winnerIndex === -1) return unclear("no_match");

  const winner = PRECEDENCE[winnerIndex];
  const confidence = PRECEDENCE.slice(0, winnerIndex).reduce(
    (acc, higher) => acc * (1 - p[higher]),
    p[winner],
  );
  if (confidence < MIN_CONFIDENCE) return unclear("low_confidence");

  return { category: winner, confidence };
}
