import { describe, expect, it } from "vitest";
import { cleanLeakedReply, hasLeakedFields } from "./draft-leak";

const PROD =
  "My projects start at $2500, and the exact price depends on the project. What kind of automation are you looking to build? I'd be happy to help you figure it out. needsHuman: false reason: null lead: null}{";

describe("cleanLeakedReply", () => {
  it("cuts the production leak (26 Nov) after the reply", () => {
    expect(cleanLeakedReply(PROD)).toEqual({
      reply:
        "My projects start at $2500, and the exact price depends on the project. What kind of automation are you looking to build? I'd be happy to help you figure it out.",
      cleaned: true,
    });
  });

  it.each([
    ['Hi! We open at 9. "needsHuman": false, "reason": null', "Hi! We open at 9."],
    ["Hi! We open at 9. needs_human=true", "Hi! We open at 9."],
    ["Hi! We open at 9.\nreason: null\nlead: null", "Hi! We open at 9."],
    ["Hi! We open at 9. }{", "Hi! We open at 9."],
    ["Hi! We open at 9. }", "Hi! We open at 9."],
    ['Hi! We open at 9.", "needsHuman": false}', "Hi! We open at 9."],
    ['Hi! We open at 9. reason: "x", lead: {"name": null}', "Hi! We open at 9."],
    ["Hi! We open at 9.\n```json\n{}", "Hi! We open at 9."],
    ["reply: Hi! We open at 9. needsHuman: false", "Hi! We open at 9."],
  ])("cuts %j", (text, reply) => {
    expect(cleanLeakedReply(text)).toEqual({ reply, cleaned: true });
  });

  it("takes the reply out of a JSON-wrapped answer", () => {
    const json = '{"reply":"Hi! We open at 9.","needsHuman":false,"reason":null,"lead":null}';
    expect(cleanLeakedReply(json)).toEqual({ reply: "Hi! We open at 9.", cleaned: true });
  });

  it("takes the reply out of a fenced JSON answer", () => {
    const json = '```json\n{"reply": "Hi! \\"Open\\" at 9.", "needsHuman": false}\n```';
    expect(cleanLeakedReply(json)).toEqual({ reply: 'Hi! "Open" at 9.', cleaned: true });
  });

  it("reads the reply from a JSON answer cut short", () => {
    const json = '{"reply": "Hi! We open at 9.", "needsHuman": fal';
    expect(cleanLeakedReply(json)).toEqual({ reply: "Hi! We open at 9.", cleaned: true });
  });

  it.each([
    "The reason: we close at 5 on Sundays.",
    "Reason: our oven is being repaired, so no pizza today.",
    "Lead time: about 2 weeks for custom orders.",
    "Reply: yes, we're open on Sunday!",
    "Use code {SAVE10} at checkout.",
    "Our hours are {Mon-Fri} 9 to 5.",
    "We'll get back to you; the reason is that the owner is away.",
    "Need a human? Call us at the number in our bio.",
    'Our latte is called "The Lead" and costs $4.',
    "We can lead you through it: just come by at 3.",
    "Thanks! :)",
  ])("leaves legit text alone: %j", (text) => {
    expect(cleanLeakedReply(text)).toEqual({ reply: text, cleaned: false });
    expect(hasLeakedFields(text)).toBe(false);
  });

  it("keeps the text when nothing would be left, still flagged", () => {
    expect(cleanLeakedReply("needsHuman: true")).toEqual({
      reply: "needsHuman: true",
      cleaned: true,
    });
  });
});

describe("hasLeakedFields", () => {
  it("flags the production text and not its cleaned form", () => {
    expect(hasLeakedFields(PROD)).toBe(true);
    expect(hasLeakedFields(cleanLeakedReply(PROD).reply)).toBe(false);
  });
});
