import { describe, expect, it } from "vitest";
import { countWords, pickCategory, type CategoryScores } from "./pick-category";

const none: CategoryScores = { complaint: 0, lead: 0, faq: 0, spam: 0 };
const long = { wordCount: 10 };

describe("pickCategory", () => {
  it("picks the only yes", () => {
    expect(pickCategory({ ...none, faq: 0.9 }, long)).toEqual({ category: "faq", confidence: 0.9 });
  });

  it("follows precedence complaint > lead > faq > spam", () => {
    const all = { complaint: 0.9, lead: 0.9, faq: 0.9, spam: 0.9 };
    expect(pickCategory(all, long).category).toBe("complaint");
    expect(pickCategory({ ...all, complaint: 0 }, long).category).toBe("lead");
    expect(pickCategory({ ...all, complaint: 0, lead: 0 }, long).category).toBe("faq");
    expect(pickCategory({ ...none, spam: 0.9 }, long).category).toBe("spam");
  });

  it("a price question with purchase intent is a lead", () => {
    expect(pickCategory({ ...none, lead: 0.8, faq: 0.95 }, long).category).toBe("lead");
  });

  it("treats exactly YES (0.5) as yes", () => {
    expect(pickCategory({ ...none, lead: 0.5 }, long)).toEqual({
      category: "lead",
      confidence: 0.5,
    });
  });

  it("discounts confidence by higher-precedence scores (TDD §9.3 example)", () => {
    const picked = pickCategory({ ...none, faq: 0.95, complaint: 0.4 }, long);
    expect(picked.category).toBe("faq");
    expect(picked.confidence).toBeCloseTo(0.57);
  });

  it("ignores lower-precedence scores in the confidence", () => {
    const picked = pickCategory({ ...none, lead: 0.9, faq: 0.99, spam: 0.99 }, long);
    expect(picked).toEqual({ category: "lead", confidence: 0.9 });
  });

  it("multiplies every higher category", () => {
    const picked = pickCategory({ complaint: 0.2, lead: 0.3, faq: 0.95, spam: 0 }, long);
    expect(picked.category).toBe("faq");
    expect(picked.confidence).toBeCloseTo(0.95 * 0.8 * 0.7);
  });

  it("returns unclear (no_match) when nothing is yes, confidence 1 - max(p)", () => {
    const picked = pickCategory({ complaint: 0.1, lead: 0.3, faq: 0.45, spam: 0.2 }, long);
    expect(picked.category).toBe("unclear");
    expect(picked.reason).toBe("no_match");
    expect(picked.confidence).toBeCloseTo(0.55);
  });

  it("returns unclear (low_confidence) when a close higher competitor drags it under 0.5", () => {
    const picked = pickCategory({ ...none, faq: 0.9, complaint: 0.49 }, long);
    expect(picked.category).toBe("unclear");
    expect(picked.reason).toBe("low_confidence");
    expect(picked.confidence).toBeCloseTo(0.1);
  });

  it("needs SPAM_YES (0.85) for spam", () => {
    expect(pickCategory({ ...none, spam: 0.84 }, long).category).toBe("unclear");
    expect(pickCategory({ ...none, spam: 0.85 }, long).category).toBe("spam");
  });

  it("a real request wrapped in junk is not spam", () => {
    expect(pickCategory({ ...none, lead: 0.7, spam: 0.95 }, long).category).toBe("lead");
  });

  it("never calls a message under 4 words spam", () => {
    const picked = pickCategory({ ...none, spam: 0.99 }, { wordCount: 3 });
    expect(picked.category).toBe("unclear");
    expect(picked.reason).toBe("no_match");
    // The disqualified spam score doesn't count towards max(p) either.
    expect(picked.confidence).toBe(1);
    expect(pickCategory({ ...none, spam: 0.99 }, { wordCount: 4 }).category).toBe("spam");
  });

  it("still lets short messages be faq, lead or complaint", () => {
    expect(pickCategory({ ...none, faq: 0.9, spam: 0.99 }, { wordCount: 2 }).category).toBe("faq");
  });
});

describe("countWords", () => {
  it("counts whitespace-separated words", () => {
    expect(countWords("  ok  thanks\n so much ")).toBe(4);
    expect(countWords("")).toBe(0);
    expect(countWords("   ")).toBe(0);
  });
});
