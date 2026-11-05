import { describe, expect, it } from "vitest";
import { summarizeWork, type WorkInput } from "./work";

const base: WorkInput = {
  days: ["2026-11-04", "2026-11-05"],
  items: [
    { id: "a", receivedAt: "2026-11-04T10:00:00Z", category: "faq" },
    { id: "b", receivedAt: "2026-11-04T11:00:00Z", category: "faq" },
    { id: "c", receivedAt: "2026-11-05T09:00:00Z", category: "lead" },
    { id: "d", receivedAt: "2026-11-05T09:30:00Z", category: null },
  ],
  previousItemCount: 2,
  replies: [
    // Waggle on its own, 6 s and 10 s after the message.
    {
      itemId: "a",
      itemReceivedAt: "2026-11-04T10:00:00Z",
      sentAt: "2026-11-04T10:00:06Z",
      byWaggle: true,
      kbEntryIds: ["kb1"],
    },
    {
      itemId: "b",
      itemReceivedAt: "2026-11-04T11:00:00Z",
      sentAt: "2026-11-04T11:00:10Z",
      byWaggle: true,
      kbEntryIds: ["kb1", "kb2"],
    },
    // The owner, two hours later; a second reply on the same thread doesn't change the wait.
    {
      itemId: "c",
      itemReceivedAt: "2026-11-05T09:00:00Z",
      sentAt: "2026-11-05T11:00:00Z",
      byWaggle: false,
      kbEntryIds: ["gone"],
    },
    {
      itemId: "c",
      itemReceivedAt: "2026-11-05T09:00:00Z",
      sentAt: "2026-11-05T12:00:00Z",
      byWaggle: false,
      kbEntryIds: [],
    },
  ],
  leads: 1,
  handedOver: ["needs_human", "needs_human", "unclear", "low_confidence", null],
  kbTitles: new Map([
    ["kb1", "Opening hours"],
    ["kb2", "Prices"],
  ]),
};

describe("summarizeWork", () => {
  const s = summarizeWork(base);

  it("counts messages in against the previous period", () => {
    expect(s.messagesIn).toBe(4);
    expect(s.messagesInDelta).toEqual({ direction: "up", text: "▲ 100%" });
  });

  it("splits replies into Waggle on its own and you", () => {
    expect(s.byWaggle).toBe(2);
    expect(s.byYou).toBe(2);
    expect(s.waggleShare).toBe(50);
    expect(s.minutesSaved).toBe(4);
  });

  it("times the first reply per message", () => {
    expect(s.firstReplyWaggle).toBe(8);
    expect(s.firstReplyYou).toBe(7200);
  });

  it("counts replies per day", () => {
    expect(s.perDay).toEqual([
      { date: "2026-11-04", waggle: 2, you: 0 },
      { date: "2026-11-05", waggle: 0, you: 2 },
    ]);
  });

  it("groups what came in, the topics used and why Waggle needed you", () => {
    expect(s.cameIn).toEqual([
      { label: "Questions", count: 2 },
      { label: "Leads", count: 1 },
      { label: "Not sorted yet", count: 1 },
    ]);
    // Deleted Business info entries drop out.
    expect(s.mostAsked).toEqual([
      { title: "Opening hours", count: 2 },
      { title: "Prices", count: 1 },
    ]);
    expect(s.neededYou).toEqual([
      { reason: "needs_human", label: "Not in your Business info", count: 2 },
      { reason: "unclear", label: "Not sure what they meant", count: 2 },
      { reason: "other", label: "Other reasons", count: 1 },
    ]);
  });

  it("has no share or waits without replies", () => {
    const empty = summarizeWork({ ...base, replies: [], previousItemCount: 0 });
    expect(empty.waggleShare).toBeNull();
    expect(empty.firstReplyWaggle).toBeNull();
    expect(empty.messagesInDelta).toBeNull();
  });
});
