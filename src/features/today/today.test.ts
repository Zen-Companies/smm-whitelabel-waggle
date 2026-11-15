import { describe, expect, it } from "vitest";
import {
  firstName,
  greetingFor,
  groupGaps,
  joinNames,
  leadsLine,
  onlyYouLine,
  reasonChip,
  replyTime,
  shortAgo,
  sinceYesterdayLine,
} from "./today";

const entry = (over: Partial<Parameters<typeof reasonChip>[0]>) => ({
  status: "escalated",
  kind: "dm",
  text: "Hello?",
  category: null,
  draft: null,
  ...over,
});

describe("Today (T71)", () => {
  it("says why a message came to the owner", () => {
    expect(reasonChip(entry({ category: "complaint" }))).toBe("Upset customer");
    expect(reasonChip(entry({ status: "failed", category: "complaint" }))).toBe("Couldn't send");
    expect(reasonChip(entry({ text: "  " }))).toBe("Sent a photo");
    expect(reasonChip(entry({ draft: { needsHuman: true } }))).toBe("Not in your answers");
    expect(reasonChip(entry({ kind: "review", reviewRating: 1 }))).toBe("Upset customer");
    expect(reasonChip(entry({ kind: "call", call: { voicemail: true } }))).toBe("Voicemail");
    expect(reasonChip(entry({ category: "unclear" }))).toBe("Not sure what they want");
    expect(reasonChip(entry({}))).toBe("For you");
  });

  it("sums up what only the owner can answer", () => {
    expect(onlyYouLine(["Upset customer", "Sent a photo"])).toBe(
      "One upset customer and one photo Waggle couldn't read.",
    );
    expect(onlyYouLine(["Upset customer", "Upset customer", "For you"])).toBe(
      "Two upset customers and one message for you.",
    );
    expect(onlyYouLine([])).toBe("Nothing needs you right now.");
  });

  it("names the newest leads", () => {
    expect(
      leadsLine([
        { name: "Maya", request: "Wants a showing Saturday." },
        { name: null, request: null },
        { name: "Derek", request: "Selling his condo" },
      ]),
    ).toBe("Maya: Wants a showing Saturday. Someone got in touch. And 1 more.");
    expect(leadsLine([])).toBe("No new leads since yesterday.");
  });

  it("writes the line under the greeting", () => {
    expect(sinceYesterdayLine(12, 2)).toBe(
      "Since yesterday, Waggle answered 12 messages on its own and saved 2 new leads.",
    );
    expect(sinceYesterdayLine(1, 0)).toBe("Since yesterday, Waggle answered 1 message on its own.");
    expect(sinceYesterdayLine(0, 0)).toBe("Since yesterday, nothing new for Waggle to answer.");
  });

  it("small words", () => {
    expect(greetingFor(8)).toBe("Good morning");
    expect(greetingFor(14)).toBe("Good afternoon");
    expect(greetingFor(21)).toBe("Good evening");
    expect(firstName("Walter  White")).toBe("Walter");
    expect(firstName("")).toBeNull();
    expect(joinNames(["Jordan", "Lena", "Chris"])).toBe("Jordan, Lena and Chris");
    const now = new Date("2026-11-15T12:00:00Z");
    expect(shortAgo("2026-11-15T10:00:00Z", now)).toBe("2h ago");
    expect(shortAgo("2026-11-15T11:59:30Z", now)).toBe("just now");
    expect(replyTime(48)).toBe("48s");
    expect(replyTime(240)).toBe("4m");
    expect(replyTime(null)).toBe("–");
  });

  it("groups the same unanswered question, most asked first", () => {
    expect(
      groupGaps([
        { text: "Are pets OK?" },
        { text: "Do buyers pay you anything?" },
        { text: "do buyers pay you anything" },
        { text: "Do buyers pay you anything?!" },
        { text: "VA loans?" },
        { text: "Parking?" },
      ]),
    ).toEqual([
      { text: "Do buyers pay you anything?", times: 3 },
      { text: "Are pets OK?", times: 1 },
      { text: "VA loans?", times: 1 },
    ]);
  });
});
