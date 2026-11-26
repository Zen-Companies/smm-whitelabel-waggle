import { describe, expect, it } from "vitest";
import {
  addOutcome,
  buildWeekSummary,
  emptyTally,
  parseWeekSummary,
  type WeekItemRow,
} from "./summary";

const NOW = new Date("2026-11-30T12:00:00Z");
const END_OF_TODAY = new Date("2026-12-01T00:00:00Z");

const item = (over: Partial<WeekItemRow> = {}): WeekItemRow => ({
  social_account_id: "ig",
  kind: "comment",
  status: "sent",
  category: "faq",
  text: "How much is it?",
  dm_closes_at: null,
  ...over,
});

const accounts = [
  { id: "ig", platform: "instagram", name: "@harbourbean", state: "read" as const, reason: null },
  { id: "fb", platform: "facebook", name: "Harbour Bean", state: "read" as const, reason: null },
];

describe("addOutcome (counted-only messages)", () => {
  it("adds each outcome to the account's tally, with its topic", () => {
    let t = emptyTally();
    t = addOutcome(t, "answered_by_you", "price");
    t = addOutcome(t, "too_old", "hours");
    t = addOutcome(t, "no_reply_needed", null);
    t = addOutcome(t, "covered", "price");
    t = addOutcome(t, "insert", null);
    t = addOutcome(t, "known", null);
    expect(t).toEqual({
      answeredByYou: 1,
      tooOld: 1,
      covered: 1,
      noReplyNeeded: 1,
      found: 1,
      topics: { price: 2, hours: 1, praise: 1 },
    });
  });
});

describe("buildWeekSummary", () => {
  it("counts what Waggle has plus what only the read saw, and never twice", () => {
    const s = buildWeekSummary({
      items: [
        item(),
        item({ status: "sent", social_account_id: "fb" }),
        item({ status: "handled" }),
        item({ status: "awaiting_approval", kind: "dm", dm_closes_at: "2026-11-30T20:00:00Z" }),
        item({ status: "awaiting_approval", kind: "dm", dm_closes_at: "2026-12-01T09:00:00Z" }),
        item({ status: "escalated", text: "What time do you open?", category: "unclear" }),
        item({ status: "ignored", category: "spam", text: "Buy followers" }),
      ],
      tally: {
        ig: { ...emptyTally(), answeredByYou: 2, found: 1, topics: { price: 2 } },
        fb: { ...emptyTally(), tooOld: 1, noReplyNeeded: 3, topics: { praise: 3, hours: 1 } },
      },
      accounts,
      gaps: [{ text: "Do you have gluten-free bread?", times: 5 }],
      previousCameIn: 10,
      now: NOW,
      endOfToday: END_OF_TODAY,
    });
    expect(s.cameIn).toBe(13);
    expect(s.answeredByWaggle).toBe(2);
    expect(s.answeredByYou).toBe(3);
    expect(s.waiting).toBe(3);
    expect(s.closingToday).toBe(1);
    expect(s.found).toBe(1);
    expect(s.tooOld).toBe(1);
    expect(s.previousCameIn).toBe(10);
    expect(s.accounts).toEqual([
      expect.objectContaining({ id: "ig", count: 8 }),
      expect.objectContaining({ id: "fb", count: 5 }),
    ]);
    expect(s.topics.map((t) => [t.label, t.count])).toEqual([
      ["Prices", 7],
      ["Compliments", 3],
      ["Opening hours", 2],
    ]);
    expect(s.gaps).toEqual([{ text: "Do you have gluten-free bread?", times: 5 }]);
  });

  it("sorts the accounts busiest first and keeps ones that couldn't be read", () => {
    const s = buildWeekSummary({
      items: [item({ social_account_id: "fb" })],
      tally: {},
      accounts: [
        ...accounts,
        { id: "tt", platform: "tiktok", name: "TikTok", state: "failed", reason: "reconnect" },
      ],
      gaps: [],
      previousCameIn: null,
      now: NOW,
      endOfToday: END_OF_TODAY,
    });
    expect(s.accounts.map((a) => [a.id, a.count, a.state])).toEqual([
      ["fb", 1, "read"],
      ["ig", 0, "read"],
      ["tt", 0, "failed"],
    ]);
  });

  it("keeps at most five topics", () => {
    const s = buildWeekSummary({
      items: [],
      tally: {
        ig: {
          ...emptyTally(),
          topics: { price: 1, hours: 2, order: 3, delivery: 4, location: 5, question: 6 },
        },
      },
      accounts,
      gaps: [],
      previousCameIn: null,
      now: NOW,
      endOfToday: END_OF_TODAY,
    });
    expect(s.topics).toHaveLength(5);
    expect(s.topics[0].label).toBe("Questions");
  });
});

describe("parseWeekSummary", () => {
  it("reads a stored summary and refuses anything else", () => {
    const s = buildWeekSummary({
      items: [item()],
      tally: {},
      accounts,
      gaps: [],
      previousCameIn: null,
      now: NOW,
      endOfToday: END_OF_TODAY,
    });
    expect(parseWeekSummary(JSON.parse(JSON.stringify(s)))).toEqual(s);
    expect(parseWeekSummary({ cameIn: "lots" })).toBeNull();
    expect(parseWeekSummary(null)).toBeNull();
  });
});
