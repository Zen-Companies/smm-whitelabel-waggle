import { describe, expect, it } from "vitest";
import { confusionMatrix, formatReport, percentile, summarizeRun, type RunResult } from "./report";

const r = (
  expected: RunResult["expected"],
  predicted: RunResult["predicted"],
  latencyMs = 100,
  extra: Partial<RunResult> = {},
): RunResult => ({
  id: Math.random().toString(36),
  expected,
  predicted,
  latencyMs,
  ...extra,
});

describe("percentile (nearest rank)", () => {
  it("p50 and p95", () => {
    const values = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(values, 50)).toBe(50);
    expect(percentile(values, 95)).toBe(95);
    expect(percentile(values, 100)).toBe(100);
  });
  it("small and empty sets", () => {
    expect(percentile([300, 100, 200], 50)).toBe(200);
    expect(percentile([7], 95)).toBe(7);
    expect(percentile([], 50)).toBe(0);
  });
});

describe("confusionMatrix", () => {
  it("rows are expected, columns predicted, failures in the error column", () => {
    const m = confusionMatrix([
      r("faq", "faq"),
      r("faq", "lead"),
      r("lead", "lead"),
      r("spam", null),
    ]);
    expect(m.faq).toMatchObject({ faq: 1, lead: 1, error: 0 });
    expect(m.lead.lead).toBe(1);
    expect(m.spam.error).toBe(1);
  });
});

describe("summarizeRun", () => {
  const results = [
    r("faq", "faq", 100, { lang: "en" }),
    r("faq", "faq", 200, { lang: "taglish" }),
    r("faq", "lead", 300, { lang: "taglish", ambiguous: true }),
    r("lead", "lead", 400, { lang: "en" }),
    r("complaint", "unclear", 500, { lang: "en" }),
    r("spam", null, 9000, { lang: "en", error: "http 500" }),
  ];
  const s = summarizeRun(results);

  it("overall accuracy and errors", () => {
    expect(s.total).toBe(6);
    expect(s.correct).toBe(3);
    expect(s.accuracy).toBeCloseTo(0.5);
    expect(s.errors).toBe(1);
  });

  it("recall and precision per category", () => {
    expect(s.perCategory.faq).toEqual({ support: 3, correct: 2, recall: 2 / 3, precision: 1 });
    expect(s.perCategory.lead).toEqual({ support: 1, correct: 1, recall: 1, precision: 0.5 });
    expect(s.perCategory.unclear).toMatchObject({ support: 0, recall: 0, precision: 0 });
  });

  it("latency ignores failed calls", () => {
    expect(s.latencyMs).toEqual({ p50: 300, p95: 500, max: 500 });
  });

  it("splits by language and reports the ambiguous set", () => {
    expect(s.byLang.taglish).toEqual({ total: 2, correct: 1, accuracy: 0.5 });
    expect(s.ambiguous).toEqual({ total: 1, correct: 0, accuracy: 0 });
  });

  it("formats a readable report", () => {
    const text = formatReport("jev (local)", s, { costUsd: 0.00042 });
    expect(text).toContain("== jev (local) ==");
    expect(text).toContain("accuracy 50.0% (3/6)");
    expect(text).toContain("p50 300 ms");
    expect(text).toContain("cost $0.00042");
    expect(text).toMatch(/confusion \(rows = expected/);
  });
});
