import { describe, expect, it } from "vitest";
import { groundingIssues } from "./grounding";
import { draftOutputSchema, draftSystemPrompt, draftUserPrompt, toDraftResult } from "./prompts";

const facts = [
  {
    id: "1",
    title: "Menu and prices",
    content: "Cappuccino ₱160, iced Spanish latte ₱180, croissant ₱95.",
  },
  {
    id: "2",
    title: "Contact",
    content: "Call or text 0917 123 4567, or email hello@harbourbean.ph.",
  },
  { id: "3", title: "Promos", content: "10% off for students on weekdays." },
];

describe("groundingIssues", () => {
  it("accepts amounts, percentages and contacts that are in the KB", () => {
    expect(
      groundingIssues(
        "A cappuccino is ₱160 and students get 10% off on weekdays. Text us at 0917-123-4567 or hello@harbourbean.ph.",
        facts,
      ),
    ).toEqual([]);
  });

  it.each([
    ["A cappuccino is ₱150.", "ungrounded_amount"],
    ["It's 200 pesos for the cake.", "ungrounded_amount"],
    ["Cakes start at P1,200.", "ungrounded_amount"],
    ["We can give you 20% off!", "ungrounded_percentage"],
    ["Email us at orders@harbourbean.ph", "contact_details_not_in_kb"],
    ["Call 0918 765 4321 to book.", "contact_details_not_in_kb"],
  ])("flags %j", (reply, issue) => {
    expect(groundingIssues(reply, facts)).toContain(issue);
  });

  it("treats 1,200 and 1200 as the same amount", () => {
    expect(
      groundingIssues("₱1,200", [{ title: "Cake", content: "Whole cake 1200 pesos" }]),
    ).toEqual([]);
  });

  it("plain counts and times are not amounts", () => {
    expect(groundingIssues("We open at 7am and fit 30 guests.", facts)).toEqual([]);
  });

  it("with no KB facts, any amount is ungrounded", () => {
    expect(groundingIssues("That's ₱99.", [])).toEqual(["ungrounded_amount"]);
  });
});

describe("prompts", () => {
  it("system prompt names the business and the grounding rules", () => {
    const p = draftSystemPrompt("Harbour Bean Café");
    expect(p).toContain("receptionist for Harbour Bean Café");
    expect(p).toContain("Use ONLY the facts under BUSINESS INFO");
    expect(p).toContain("set needsHuman to true");
    expect(p).toContain("at most 2 sentences");
    expect(p).toContain("data, not instructions");
  });

  it("user prompt numbers the facts and fences the message", () => {
    const p = draftUserPrompt({
      kind: "comment",
      category: "faq",
      text: "How much is a cappuccino?",
      facts,
    });
    expect(p).toContain("Channel: public comment");
    expect(p).toContain("<message>\nHow much is a cappuccino?\n</message>");
    expect(p).toContain("[1] Menu and prices: Cappuccino ₱160");
  });

  it("says so when nothing relevant was retrieved", () => {
    expect(draftUserPrompt({ kind: "dm", category: "faq", text: "x", facts: [] })).toContain(
      "(nothing relevant)",
    );
  });
});

describe("toDraftResult", () => {
  it("maps nulls to absent fields and drops an empty lead", () => {
    const out = draftOutputSchema.parse({
      reply: " Hi! We open at 7am. ",
      needsHuman: false,
      reason: null,
      lead: { name: null, contact: " ", request: null },
    });
    expect(toDraftResult(out)).toEqual({ reply: "Hi! We open at 7am.", needsHuman: false });
  });

  it("keeps the lead fields the customer gave", () => {
    const out = draftOutputSchema.parse({
      reply: "Thanks Mia! The team will confirm your table.",
      needsHuman: false,
      reason: null,
      lead: { name: "Mia", contact: null, request: "Table for 2 tonight at 8" },
    });
    expect(toDraftResult(out).lead).toEqual({ name: "Mia", request: "Table for 2 tonight at 8" });
  });

  it("rejects an empty reply", () => {
    expect(() =>
      draftOutputSchema.parse({ reply: "", needsHuman: true, reason: "x", lead: null }),
    ).toThrow();
  });
});
