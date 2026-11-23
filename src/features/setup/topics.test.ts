import { describe, expect, it } from "vitest";
import {
  batchReplies,
  conversationTopic,
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
    ["Looks so good!", "question"],
  ] as const)("no category: %s → %s (keywords)", (text, topic) => {
    expect(setupTopic(text)).toBe(topic);
    expect(setupTopic(text, null)).toBe(topic);
  });

  it("groups by Jev's category, keywords only refine questions", () => {
    expect(setupTopic("I want this one", "lead")).toBe("order");
    expect(setupTopic("How much for 50 pcs?", "lead")).toBe("order");
    expect(setupTopic("What time do you open on Sunday?", "faq")).toBe("hours");
    expect(setupTopic("How much is the sourdough?", "faq")).toBe("price");
    expect(setupTopic("Do you have oat milk?", "faq")).toBe("question");
    expect(setupTopic("Do you take orders for birthdays?", "faq")).toBe("question");
    expect(setupTopic("hmm where?", "unclear")).toBe("location");
    expect(setupTopic("My order came cold", "complaint")).toBe("complaint");
    expect(setupTopic("Follow me for free followers, how much?", "spam")).toBe("spam");
  });

  it("puts price before buying when only the words decide", () => {
    expect(setupTopic("How much for 50 pcs order?")).toBe("price");
  });
});

describe("conversationTopic", () => {
  it("is money when any message is, else the first clearer topic, else a question", () => {
    expect(conversationTopic(["hi", "how much po?"], null)).toBe("price");
    expect(conversationTopic(["hi", "open sunday?"], "faq")).toBe("hours");
    expect(conversationTopic(["hi", "thanks"], "faq")).toBe("question");
    expect(conversationTopic(["hi"], "lead")).toBe("order");
    expect(conversationTopic(["promo for you"], "spam")).toBe("spam");
  });
});

describe("topicCounts", () => {
  it("counts most first, spam last and grey, never Other", () => {
    const counts = topicCounts([
      "spam",
      "spam",
      "spam",
      "spam",
      "order",
      "hours",
      "hours",
      "question",
      "complaint",
    ]);
    expect(counts.map((t) => [t.label, t.count, t.muted])).toEqual([
      ["Opening hours", 2, false],
      ["Wants to buy", 1, false],
      ["Questions", 1, false],
      ["Complaints", 1, false],
      ["Not about your business", 4, true],
    ]);
    expect(counts.some((t) => t.label === "Other")).toBe(false);
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
    expect(restTitle([{ topic: "question" }])).toBe("1 more question");
    expect(topicsLine(quick)).toBe("Delivery, hours and where you are.");
    expect(topicsLine([])).toBe("");
  });
});
