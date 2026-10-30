import { describe, expect, it } from "vitest";
import { checkDraft, countSentences, parseExpect, type DraftToCheck } from "./checks";

const base: DraftToCheck = {
  reply: "We're open 8am to 10pm on Sundays!",
  needsHuman: false,
  groundingIssues: [],
  kind: "comment",
  customerText: "What time do you open on Sundays?",
};
const failed = (d: Partial<DraftToCheck>) =>
  checkDraft({ ...base, ...d })
    .filter((r) => !r.ok)
    .map((r) => r.check);

describe("checkDraft", () => {
  it("a good comment passes everything", () => {
    expect(failed({})).toEqual([]);
  });

  it("an ungrounded amount fails unless it went to the owner", () => {
    expect(failed({ groundingIssues: ["ungrounded_amount"] })).toEqual(["grounding"]);
    expect(failed({ groundingIssues: ["ungrounded_amount"], needsHuman: true })).toEqual([]);
  });

  it("checks needsHuman against the sample's expectation", () => {
    expect(failed({ expect: "not_covered" })).toEqual(["needs_human"]);
    expect(failed({ expect: "covered", needsHuman: true })).toEqual(["needs_human"]);
    expect(failed({ expect: "not_covered", needsHuman: true })).toEqual([]);
  });

  it("comments are at most 2 sentences, DMs 4", () => {
    const three = "Hi! We open at 8. See you soon.";
    expect(failed({ reply: three })).toEqual(["length"]);
    expect(failed({ reply: three, kind: "dm" })).toEqual([]);
  });

  it("at most one emoji, and only if the customer used one", () => {
    expect(failed({ reply: "We open at 8! 😊" })).toEqual(["emoji"]);
    expect(failed({ reply: "We open at 8! 😊", customerText: "Open Sunday? 🙏" })).toEqual([]);
    expect(failed({ reply: "Yes! 😊😊", customerText: "Open? 🙏" })).toEqual(["emoji"]);
  });

  it("keeps the customer's language", () => {
    expect(failed({ reply: "Open po kami 8am!" })).toEqual(["language"]);
    expect(failed({ reply: "Open po kami 8am!", customerText: "Open po ba kayo?" })).toEqual([]);
  });

  it("no phone numbers or emails in a public comment", () => {
    expect(failed({ reply: "Text us at 0917 123 4567." })).toEqual(["no_contact_in_comment"]);
    expect(failed({ reply: "Text us at 0917 123 4567.", kind: "dm" })).toEqual([]);
  });
});

describe("helpers", () => {
  it("parses sample notes", () => {
    expect(parseExpect("covered: 8am-10pm")).toBe("covered");
    expect(parseExpect("NOT covered: needsHuman")).toBe("not_covered");
    expect(parseExpect("lead: name Carlo")).toBeNull();
    expect(parseExpect(undefined)).toBeNull();
  });

  it("counts sentences, ignoring emoji", () => {
    expect(countSentences("Hi! We open at 8. 😊")).toBe(2);
    expect(countSentences("")).toBe(0);
  });
});
