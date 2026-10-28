import type { Category } from "@/lib/classifier/types";

// Triage report metrics (docs/tasks.md T7): pure, used by scripts/triage-report.ts.

export const REPORT_CATEGORIES: readonly Category[] = [
  "faq",
  "lead",
  "complaint",
  "spam",
  "unclear",
];

export interface LabeledMessage {
  id: string;
  text: string;
  kind: "comment" | "dm";
  expected: Category;
  lang: "en" | "taglish";
  /** Ambiguous on purpose (overlapping categories); `note` says why `expected` wins. */
  ambiguous?: boolean;
  note?: string;
}

export interface RunResult {
  id: string;
  expected: Category;
  /** null when the classifier threw. */
  predicted: Category | null;
  confidence?: number;
  latencyMs: number;
  error?: string;
  ambiguous?: boolean;
  lang?: LabeledMessage["lang"];
}

export interface CategoryStats {
  support: number;
  correct: number;
  /** correct / support (how many of this category were found). */
  recall: number;
  /** correct / predicted as this category. */
  precision: number;
}

export interface RunSummary {
  total: number;
  correct: number;
  accuracy: number;
  errors: number;
  perCategory: Record<Category, CategoryStats>;
  /** confusion[expected][predicted]; "error" column counts failures. */
  confusion: Record<Category, Record<Category | "error", number>>;
  latencyMs: { p50: number; p95: number; max: number };
  byLang: Record<string, { total: number; correct: number; accuracy: number }>;
  ambiguous: { total: number; correct: number; accuracy: number };
}

/** Nearest-rank percentile of `values` (p in 0..100). Empty → 0. */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[Math.min(rank, sorted.length) - 1];
}

export function confusionMatrix(results: RunResult[]): RunSummary["confusion"] {
  const matrix = Object.fromEntries(
    REPORT_CATEGORIES.map((e) => [
      e,
      Object.fromEntries([...REPORT_CATEGORIES, "error"].map((p) => [p, 0])),
    ]),
  ) as RunSummary["confusion"];
  for (const r of results) matrix[r.expected][r.predicted ?? "error"] += 1;
  return matrix;
}

const ratio = (a: number, b: number) => (b === 0 ? 0 : a / b);

export function summarizeRun(results: RunResult[]): RunSummary {
  const correct = results.filter((r) => r.predicted === r.expected).length;
  const confusion = confusionMatrix(results);
  const perCategory = Object.fromEntries(
    REPORT_CATEGORIES.map((c) => {
      const support = results.filter((r) => r.expected === c).length;
      const hit = confusion[c][c];
      const predicted = REPORT_CATEGORIES.reduce((sum, e) => sum + confusion[e][c], 0);
      return [
        c,
        { support, correct: hit, recall: ratio(hit, support), precision: ratio(hit, predicted) },
      ];
    }),
  ) as Record<Category, CategoryStats>;

  const ok = results.filter((r) => r.predicted !== null).map((r) => r.latencyMs);
  const byLang: RunSummary["byLang"] = {};
  for (const r of results) {
    const key = r.lang ?? "unknown";
    byLang[key] ??= { total: 0, correct: 0, accuracy: 0 };
    byLang[key].total += 1;
    if (r.predicted === r.expected) byLang[key].correct += 1;
  }
  for (const v of Object.values(byLang)) v.accuracy = ratio(v.correct, v.total);
  const amb = results.filter((r) => r.ambiguous);
  const ambCorrect = amb.filter((r) => r.predicted === r.expected).length;

  return {
    total: results.length,
    correct,
    accuracy: ratio(correct, results.length),
    errors: results.filter((r) => r.predicted === null).length,
    perCategory,
    confusion,
    latencyMs: {
      p50: percentile(ok, 50),
      p95: percentile(ok, 95),
      max: ok.length ? Math.max(...ok) : 0,
    },
    byLang,
    ambiguous: { total: amb.length, correct: ambCorrect, accuracy: ratio(ambCorrect, amb.length) },
  };
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const pad = (s: string | number, n: number) => String(s).padStart(n);

/** Plain-text report for one classifier. */
export function formatReport(
  name: string,
  s: RunSummary,
  extra: { costUsd?: number } = {},
): string {
  const lines: string[] = [];
  lines.push(`== ${name} ==`);
  lines.push(
    `accuracy ${pct(s.accuracy)} (${s.correct}/${s.total})  errors ${s.errors}  ` +
      `latency p50 ${Math.round(s.latencyMs.p50)} ms  p95 ${Math.round(s.latencyMs.p95)} ms  max ${Math.round(s.latencyMs.max)} ms` +
      (extra.costUsd !== undefined ? `  cost $${extra.costUsd.toFixed(5)}` : ""),
  );
  lines.push("");
  lines.push(`${"category".padEnd(10)}${pad("n", 5)}${pad("recall", 9)}${pad("precision", 11)}`);
  for (const c of REPORT_CATEGORIES) {
    const st = s.perCategory[c];
    lines.push(
      `${c.padEnd(10)}${pad(st.support, 5)}${pad(pct(st.recall), 9)}${pad(pct(st.precision), 11)}`,
    );
  }
  lines.push("");
  lines.push("confusion (rows = expected, columns = predicted)");
  const cols = [...REPORT_CATEGORIES, "error"] as const;
  lines.push(`${"".padEnd(10)}${cols.map((c) => pad(c, 10)).join("")}`);
  for (const e of REPORT_CATEGORIES) {
    lines.push(`${e.padEnd(10)}${cols.map((p) => pad(s.confusion[e][p], 10)).join("")}`);
  }
  lines.push("");
  const langs = Object.entries(s.byLang)
    .map(([lang, v]) => `${lang} ${pct(v.accuracy)} (${v.correct}/${v.total})`)
    .join("  ");
  lines.push(`by language: ${langs}`);
  if (s.ambiguous.total) {
    lines.push(
      `ambiguous cases: ${pct(s.ambiguous.accuracy)} (${s.ambiguous.correct}/${s.ambiguous.total})`,
    );
  }
  return lines.join("\n");
}
