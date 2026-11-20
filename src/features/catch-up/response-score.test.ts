import { describe, expect, it } from "vitest";
import {
  commentResponse,
  conversationResponse,
  responseScore,
  responseWord,
} from "./response-score";

const now = new Date("2026-11-20T12:00:00Z");
const since = new Date("2026-10-21T12:00:00Z");
const h = (hours: number) => new Date(now.getTime() - hours * 3_600_000).toISOString();

describe("responseScore", () => {
  it("is hidden under 5 messages", () => {
    expect(responseScore({ messages: 4, answered: 4 })).toBeNull();
    expect(responseScore({ messages: 0, answered: 0 })).toBeNull();
  });

  it("is the rounded share answered within 24 hours", () => {
    expect(responseScore({ messages: 64, answered: 26 })).toEqual({
      score: 41,
      word: "Needs work",
      messages: 64,
      answered: 26,
    });
    expect(responseScore({ messages: 3 + 3, answered: 4 })?.score).toBe(67);
  });

  it("names the bands at their edges", () => {
    expect(responseWord(59)).toBe("Needs work");
    expect(responseWord(60)).toBe("Good");
    expect(responseWord(84)).toBe("Good");
    expect(responseWord(85)).toBe("Great");
    expect(responseWord(100)).toBe("Great");
  });

  it("never goes above 100", () => {
    expect(responseScore({ messages: 5, answered: 9 })?.score).toBe(100);
  });
});

describe("commentResponse", () => {
  it("counts the business's reply within 24 hours as answered", () => {
    expect(
      commentResponse(
        { createdAt: h(50), fromOwner: false, ownerReplied: true, ownerRepliedAt: h(30) },
        since,
        now,
      ),
    ).toBe("answered");
  });

  it("counts a late reply as missed", () => {
    expect(
      commentResponse(
        { createdAt: h(80), fromOwner: false, ownerReplied: true, ownerRepliedAt: h(50) },
        since,
        now,
      ),
    ).toBe("missed");
  });

  it("counts a reply with no time as answered", () => {
    expect(
      commentResponse({ createdAt: h(80), fromOwner: false, ownerReplied: true }, since, now),
    ).toBe("answered");
  });

  it("leaves out a comment still inside its first 24 hours", () => {
    expect(commentResponse({ createdAt: h(5), fromOwner: false }, since, now)).toBeNull();
    expect(commentResponse({ createdAt: h(25), fromOwner: false }, since, now)).toBe("missed");
  });

  it("leaves out the business's own comments and older ones", () => {
    expect(commentResponse({ createdAt: h(40), fromOwner: true }, since, now)).toBeNull();
    expect(commentResponse({ createdAt: h(24 * 40), fromOwner: false }, since, now)).toBeNull();
    expect(commentResponse({ createdAt: null, fromOwner: false }, since, now)).toBeNull();
  });
});

describe("conversationResponse", () => {
  it("judges each customer message by the next business reply", () => {
    const tally = conversationResponse(
      [
        { direction: "incoming", createdAt: h(100) },
        { direction: "incoming", createdAt: h(99) },
        { direction: "outgoing", createdAt: h(90) },
        { direction: "incoming", createdAt: h(60) },
        { direction: "outgoing", createdAt: h(20) },
        { direction: "incoming", createdAt: h(10) },
      ],
      since,
      now,
    );
    // Two answered in 10 h, one answered after 40 h, the last still open (left out).
    expect(tally).toEqual({ messages: 3, answered: 2 });
  });

  it("counts an old message with no reply as missed", () => {
    expect(conversationResponse([{ direction: "incoming", createdAt: h(30) }], since, now)).toEqual(
      { messages: 1, answered: 0 },
    );
  });

  it("skips messages before the window, in any order", () => {
    expect(
      conversationResponse(
        [
          { direction: "outgoing", createdAt: h(24 * 40 - 1) },
          { direction: "incoming", createdAt: h(24 * 40) },
        ],
        since,
        now,
      ),
    ).toEqual({ messages: 0, answered: 0 });
  });
});
