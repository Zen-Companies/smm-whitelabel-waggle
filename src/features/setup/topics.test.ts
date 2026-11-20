import { describe, expect, it } from "vitest";
import {
  batchReplies,
  hoursLeft,
  restTitle,
  setupTopic,
  topicCounts,
  topicsLine,
  type ReplyRow,
} from "./topics";

describe("setupTopic", () => {
  it.each([
    ["How much is the sourdough?", "price"],
    ["Magkano po ang ensaymada?", "price"],
    ["Do you take orders for birthdays?", "order"],
    ["Can I pre-order 2 loaves for tomorrow?", "order"],
    ["Do you deliver to Mandaue?", "delivery"],
    ["Are you open this Sunday?", "hours"],
    ["Where are you located?", "location"],
    ["Looks so good!", "other"],
  ] as const)("%s → %s", (text, topic) => {
    expect(setupTopic(text)).toBe(topic);
  });

  it("puts price before order, and a lead with no clearer topic under orders", () => {
    expect(setupTopic("How much for 50 pcs order?")).toBe("price");
    expect(setupTopic("I want this one", "lead")).toBe("order");
    expect(setupTopic("I want this one", "faq")).toBe("other");
  });
});

describe("topicCounts", () => {
  it("counts most first with Other last", () => {
    expect(
      topicCounts([
        { text: "How much?" },
        { text: "Price please" },
        { text: "Do you deliver?" },
        { text: "nice" },
        { text: "nice too" },
        { text: "nice three" },
      ]).map((t) => [t.label, t.count]),
    ).toEqual([
      ["Prices", 2],
      ["Delivery", 1],
      ["Other", 3],
    ]);
  });
});

const now = new Date("2026-11-20T12:00:00Z");
const ago = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString();
const row = (over: Partial<ReplyRow>): ReplyRow => ({
  itemId: "i",
  draftId: "d",
  kind: "comment",
  author: "Ana",
  text: "How much?",
  reply: "₱280",
  category: "faq",
  receivedAt: ago(30),
  status: "awaiting_approval",
  ...over,
});

describe("hoursLeft", () => {
  it("is whole hours left in a DM's 24 hours, at least 1, null after", () => {
    expect(hoursLeft("dm", ago(7), now)).toBe(17);
    expect(hoursLeft("dm", ago(23.9), now)).toBe(1);
    expect(hoursLeft("dm", ago(25), now)).toBeNull();
    expect(hoursLeft("comment", ago(1), now)).toBeNull();
  });
});

describe("batchReplies", () => {
  it("puts money first, DMs with the least time left first, then comments newest first", () => {
    const { money, rest } = batchReplies(
      [
        row({ itemId: "c-old", receivedAt: ago(50) }),
        row({ itemId: "c-new", receivedAt: ago(10) }),
        row({ itemId: "dm-7", kind: "dm", receivedAt: ago(7) }),
        row({ itemId: "dm-20", kind: "dm", receivedAt: ago(20) }),
        row({ itemId: "hours", text: "Open Sunday?" }),
      ],
      now,
    );
    expect(money.map((r) => r.itemId)).toEqual(["dm-20", "dm-7", "c-new", "c-old"]);
    expect(rest.map((r) => r.itemId)).toEqual(["hours"]);
    expect(money[0].hoursLeft).toBe(4);
  });

  it("leaves out DMs whose window closed, but keeps sent ones", () => {
    const { money } = batchReplies(
      [
        row({ itemId: "closed", kind: "dm", receivedAt: ago(30) }),
        row({ itemId: "sent", kind: "dm", receivedAt: ago(30), status: "sent" }),
      ],
      now,
    );
    expect(money.map((r) => [r.itemId, r.approved])).toEqual([["sent", true]]);
  });
});

describe("restTitle and topicsLine", () => {
  it("names the batch", () => {
    const quick = [{ topic: "hours" }, { topic: "delivery" }, { topic: "location" }] as const;
    expect(restTitle(quick)).toBe("3 quick questions");
    expect(restTitle([{ topic: "other" }])).toBe("1 more question");
    expect(topicsLine(quick)).toBe("Delivery, hours and where you are.");
    expect(topicsLine([])).toBe("");
  });
});
