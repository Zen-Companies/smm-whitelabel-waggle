import type { Category } from "@/lib/classifier/types";

// Batch comparison results (T28), pure so the page can total them as chunks arrive.

export const BATCH_CATEGORIES: Category[] = ["faq", "lead", "complaint", "spam", "unclear"];
/** Messages per server call: small enough to stop quickly and stay inside a request. */
export const BATCH_CHUNK = 5;
/** OpenRouter's free daily request limit without credits. */
export const FREE_DAILY_REQUESTS = 50;

export interface BatchRow {
  id: string;
  text: string;
  expected: Category;
  a: Category | null;
  b: Category | null;
  aError?: string;
  bError?: string;
}

export interface SideSummary {
  correct: number;
  errors: number;
  accuracy: number;
  /** Per expected category: correct / total. */
  perCategory: Record<Category, { total: number; correct: number }>;
}

function side(rows: BatchRow[], pick: (r: BatchRow) => Category | null): SideSummary {
  const perCategory = Object.fromEntries(
    BATCH_CATEGORIES.map((c) => [c, { total: 0, correct: 0 }]),
  ) as SideSummary["perCategory"];
  let correct = 0;
  let errors = 0;
  for (const r of rows) {
    const got = pick(r);
    perCategory[r.expected].total += 1;
    if (got === null) errors += 1;
    if (got === r.expected) {
      correct += 1;
      perCategory[r.expected].correct += 1;
    }
  }
  return { correct, errors, accuracy: rows.length ? correct / rows.length : 0, perCategory };
}

export function summarizeBatch(rows: BatchRow[]) {
  return {
    total: rows.length,
    a: side(rows, (r) => r.a),
    b: side(rows, (r) => r.b),
    /** Messages where A and B disagree: what B fixed and what it broke. */
    changed: rows
      .filter((r) => r.a !== r.b)
      .map((r) => ({
        ...r,
        verdict:
          r.b === r.expected
            ? ("fixed" as const)
            : r.a === r.expected
              ? ("broke" as const)
              : ("other" as const),
      })),
  };
}

export type ClassifierUse = "free" | "openrouter" | "fallback";

/** Which classifiers spend OpenRouter requests: llm and jev-openrouter always, production on Jev failures. */
export function classifierUse(classifier: string): ClassifierUse {
  if (classifier === "llm" || classifier === "jev-openrouter") return "openrouter";
  if (classifier === "production") return "fallback";
  return "free";
}

/** The pre-run line: how many calls, and whether it can exceed the free daily limit. */
export function batchEstimate(count: number, classifiers: [string, string]) {
  const calls = count * 2;
  const paid = classifiers.filter((c) => classifierUse(c) === "openrouter").length * count;
  const maybe = classifiers.filter((c) => classifierUse(c) === "fallback").length * count;
  return {
    calls,
    openRouterCalls: paid,
    openRouterIfJevDown: paid + maybe,
    overFreeLimit: paid > FREE_DAILY_REQUESTS,
    mayExceed: paid + maybe > FREE_DAILY_REQUESTS,
  };
}
