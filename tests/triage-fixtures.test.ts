import { describe, expect, it } from "vitest";
import { loadLabeledSet } from "@/features/triage/labeled-set";

// The labeled set for scripts/triage-report (docs/tasks.md T7) stays well-formed.
const set = loadLabeledSet("tests/fixtures/triage");

describe("triage labeled set", () => {
  it("has about 30 messages per category", () => {
    const byCategory = new Map<string, number>();
    for (const m of set.messages.filter((m) => !m.ambiguous)) {
      byCategory.set(m.expected, (byCategory.get(m.expected) ?? 0) + 1);
    }
    for (const category of ["faq", "lead", "complaint", "spam", "unclear"]) {
      expect(byCategory.get(category)).toBeGreaterThanOrEqual(30);
    }
  });

  it("includes English and Taglish, comments and DMs", () => {
    const langs = new Set(set.messages.map((m) => m.lang));
    const kinds = new Set(set.messages.map((m) => m.kind));
    expect(langs).toEqual(new Set(["en", "taglish"]));
    expect(kinds).toEqual(new Set(["comment", "dm"]));
  });

  it("every ambiguous case says why its label wins", () => {
    const ambiguous = set.messages.filter((m) => m.ambiguous);
    expect(ambiguous.length).toBeGreaterThanOrEqual(20);
    for (const m of ambiguous) expect(m.note?.length).toBeGreaterThan(5);
  });

  it("names the business the messages are written for", () => {
    expect(set.business.name).toBe("Harbour Bean Café");
  });
});
