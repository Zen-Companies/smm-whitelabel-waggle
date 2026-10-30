import { describe, expect, it } from "vitest";
import { batchEstimate, summarizeBatch, type BatchRow } from "./batch";

const row = (
  id: string,
  expected: BatchRow["expected"],
  a: BatchRow["a"],
  b: BatchRow["b"],
): BatchRow => ({
  id,
  text: id,
  expected,
  a,
  b,
});

describe("summarizeBatch", () => {
  const rows = [
    row("1", "faq", "faq", "faq"),
    row("2", "lead", "faq", "lead"),
    row("3", "faq", "faq", "lead"),
    row("4", "spam", null, "spam"),
    row("5", "unclear", "faq", "lead"),
  ];
  const s = summarizeBatch(rows);

  it("totals each side", () => {
    expect(s.total).toBe(5);
    expect(s.a).toMatchObject({ correct: 2, errors: 1, accuracy: 0.4 });
    expect(s.b).toMatchObject({ correct: 3, errors: 0, accuracy: 0.6 });
    expect(s.a.perCategory.lead).toEqual({ total: 1, correct: 0 });
    expect(s.b.perCategory.faq).toEqual({ total: 2, correct: 1 });
  });

  it("lists what B fixed and broke", () => {
    expect(s.changed.map((c) => [c.id, c.verdict])).toEqual([
      ["2", "fixed"],
      ["3", "broke"],
      ["4", "fixed"],
      ["5", "other"],
    ]);
  });
});

describe("batchEstimate", () => {
  it("jev only is free", () => {
    expect(batchEstimate(175, ["jev", "jev"])).toMatchObject({
      calls: 350,
      openRouterCalls: 0,
      overFreeLimit: false,
      mayExceed: false,
    });
  });
  it("the LLM classifier counts against the free limit", () => {
    expect(batchEstimate(30, ["jev", "llm"])).toMatchObject({
      openRouterCalls: 30,
      overFreeLimit: false,
    });
    expect(batchEstimate(60, ["jev", "llm"]).overFreeLimit).toBe(true);
  });
  it("production may fall back to OpenRouter when Jev is down", () => {
    expect(batchEstimate(30, ["production", "production"])).toMatchObject({
      openRouterCalls: 0,
      openRouterIfJevDown: 60,
      mayExceed: true,
    });
  });
});
