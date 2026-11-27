import { describe, expect, it } from "vitest";
import type { ProviderComment, ProviderMessage } from "@/lib/social/types";
import { knownMessages, sortWeekComment, sortWeekConversation } from "./select";

// No double drafts (the owner's explicit rule, board "Your week" 26 Nov): every message is matched
// against what Waggle already has; only messages Waggle never saw are added, and only those get a
// draft.

const NOW = new Date("2026-11-30T12:00:00Z");
const FROM = new Date("2026-11-23T00:00:00Z");
const TO = new Date("2026-11-30T00:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();
const DAY = 24 * 3_600_000;

const comment = (over: Partial<ProviderComment> = {}): ProviderComment => ({
  id: "c1",
  text: "How much is the cake?",
  authorName: "mika",
  fromOwner: false,
  createdAt: hoursAgo(30),
  ...over,
});

const none = knownMessages({ items: [], missed: [] });

describe("knownMessages", () => {
  it("keys what Waggle has by comment id, platform message id and Zernio message id", () => {
    const known = knownMessages({
      items: [
        {
          kind: "comment",
          zernio_comment_id: "c1",
          platform_message_id: null,
          zernio_message_id: null,
          received_at: hoursAgo(30),
          zernio_conversation_id: null,
        },
        {
          kind: "dm",
          zernio_comment_id: null,
          platform_message_id: "mid_1",
          zernio_message_id: "pulled:mid_1",
          received_at: hoursAgo(5),
          zernio_conversation_id: "conv_1",
        },
        {
          kind: "dm",
          zernio_comment_id: null,
          platform_message_id: null,
          zernio_message_id: "zmsg_2",
          received_at: hoursAgo(4),
          zernio_conversation_id: "conv_1",
        },
      ],
      missed: ["mid_old"],
    });
    expect(known.commentIds.has("c1")).toBe(true);
    expect(known.dmIds.has("mid_1")).toBe(true);
    expect(known.dmIds.has("zmsg_2")).toBe(true);
    expect(known.dmIds.has("mid_old")).toBe(true);
    expect(known.dmTimes.get("conv_1")).toHaveLength(2);
  });
});

describe("sortWeekComment", () => {
  const ctx = { known: none, from: FROM, to: TO, giveaway: false };

  it("adds a customer's question Waggle never saw (it gets one draft, like any new message)", () => {
    expect(sortWeekComment(comment(), ctx)).toBe("insert");
  });

  it("only counts a comment Waggle already has, whatever its draft (never added or drafted again)", () => {
    const known = knownMessages({
      items: [
        {
          kind: "comment",
          zernio_comment_id: "c1",
          platform_message_id: null,
          zernio_message_id: null,
          received_at: hoursAgo(30),
          zernio_conversation_id: null,
        },
      ],
      missed: [],
    });
    expect(sortWeekComment(comment(), { ...ctx, known })).toBe("known");
    // Even when the owner answered it on the platform too.
    expect(sortWeekComment(comment({ ownerReplied: true }), { ...ctx, known })).toBe("known");
  });

  it("counts a comment the owner answered on the platform as answered by you, no draft", () => {
    expect(sortWeekComment(comment({ ownerReplied: true }), ctx)).toBe("answered_by_you");
  });

  it("counts praise, friend tags and giveaway comments without drafting them", () => {
    expect(sortWeekComment(comment({ text: "love this! 😍" }), ctx)).toBe("no_reply_needed");
    expect(sortWeekComment(comment(), { ...ctx, giveaway: true })).toBe("no_reply_needed");
  });

  it("leaves out the business's own comments and comments outside the week", () => {
    expect(sortWeekComment(comment({ fromOwner: true }), ctx)).toBeNull();
    expect(sortWeekComment(comment({ createdAt: hoursAgo(10 * 24) }), ctx)).toBeNull();
    expect(sortWeekComment(comment({ createdAt: hoursAgo(2) }), ctx)).toBeNull();
    expect(sortWeekComment(comment({ createdAt: null }), ctx)).toBeNull();
  });
});

const msg = (
  id: string,
  direction: "incoming" | "outgoing",
  createdAt: string,
): ProviderMessage => ({ id, direction, text: "Do you deliver?", createdAt });

describe("sortWeekConversation", () => {
  const base = { from: FROM, to: TO, now: NOW, replyWindowMs: DAY as number | null };

  it("adds an unanswered DM inside the reply window that Waggle never saw", () => {
    const out = sortWeekConversation("conv", [msg("m1", "incoming", hoursAgo(13))], {
      ...base,
      known: none,
    });
    expect(out).toEqual([expect.objectContaining({ outcome: "insert" })]);
  });

  it("counts a DM whose reply window closed as too old to answer, no draft", () => {
    const out = sortWeekConversation("conv", [msg("m1", "incoming", hoursAgo(50))], {
      ...base,
      known: none,
    });
    expect(out.map((o) => o.outcome)).toEqual(["too_old"]);
  });

  it("adds an old unanswered DM where the platform has no reply window", () => {
    const out = sortWeekConversation("conv", [msg("m1", "incoming", hoursAgo(50))], {
      ...base,
      replyWindowMs: null,
      known: none,
    });
    expect(out.map((o) => o.outcome)).toEqual(["insert"]);
  });

  it("counts a DM the owner already replied to as answered by you", () => {
    const out = sortWeekConversation(
      "conv",
      [msg("m1", "incoming", hoursAgo(20)), msg("r1", "outgoing", hoursAgo(19))],
      { ...base, known: none },
    );
    expect(out.map((o) => o.outcome)).toEqual(["answered_by_you"]);
  });

  it("a reply after the week still counts the message as answered", () => {
    const out = sortWeekConversation(
      "conv",
      [msg("m1", "incoming", hoursAgo(14)), msg("r1", "outgoing", hoursAgo(1))],
      { ...base, known: none },
    );
    expect(out.map((o) => o.outcome)).toEqual(["answered_by_you"]);
  });

  it("only counts a DM Waggle has, matched by the platform's message id", () => {
    const known = knownMessages({
      items: [
        {
          kind: "dm",
          zernio_comment_id: null,
          platform_message_id: "m1",
          zernio_message_id: "zm1",
          received_at: hoursAgo(13),
          zernio_conversation_id: "conv",
        },
      ],
      missed: [],
    });
    const out = sortWeekConversation("conv", [msg("m1", "incoming", hoursAgo(13))], {
      ...base,
      known,
    });
    expect(out.map((o) => o.outcome)).toEqual(["known"]);
  });

  it("matches a DM stored without the platform's id by its conversation and time", () => {
    const known = knownMessages({
      items: [
        {
          kind: "dm",
          zernio_comment_id: null,
          platform_message_id: null,
          zernio_message_id: "zm1",
          received_at: new Date(Date.parse(hoursAgo(13)) + 2000).toISOString(),
          zernio_conversation_id: "conv",
        },
      ],
      missed: [],
    });
    const out = sortWeekConversation("conv", [msg("m1", "incoming", hoursAgo(13))], {
      ...base,
      known,
    });
    expect(out.map((o) => o.outcome)).toEqual(["known"]);
    // Another conversation at the same time is a different message.
    const other = sortWeekConversation("conv_2", [msg("m1", "incoming", hoursAgo(13))], {
      ...base,
      known,
    });
    expect(other.map((o) => o.outcome)).toEqual(["insert"]);
  });

  it("a DM listed as missed at first connect is known (never drafted)", () => {
    const known = knownMessages({ items: [], missed: ["m1"] });
    const out = sortWeekConversation("conv", [msg("m1", "incoming", hoursAgo(13))], {
      ...base,
      known,
    });
    expect(out.map((o) => o.outcome)).toEqual(["known"]);
  });

  it("only adds the newest unanswered messages Waggle missed; older ones in the window are covered by that reply", () => {
    const out = sortWeekConversation(
      "conv",
      [
        msg("m1", "incoming", hoursAgo(40)),
        msg("m2", "incoming", hoursAgo(14)),
        msg("m3", "incoming", hoursAgo(13)),
      ],
      { ...base, known: none },
    );
    expect(Object.fromEntries(out.map((o) => [o.message.id, o.outcome]))).toEqual({
      m1: "covered",
      m2: "insert",
      m3: "insert",
    });
  });

  it("leaves out the business's own messages and messages outside the week", () => {
    const out = sortWeekConversation(
      "conv",
      [
        msg("old", "incoming", hoursAgo(9 * 24)),
        msg("r", "outgoing", hoursAgo(8 * 24)),
        msg("late", "incoming", hoursAgo(3)),
      ],
      { ...base, known: none },
    );
    expect(out).toEqual([]);
  });
});
