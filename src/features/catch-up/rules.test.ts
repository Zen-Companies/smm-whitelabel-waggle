import { describe, expect, it } from "vitest";
import type { ProviderMessage } from "@/lib/social/types";
import {
  accountHandle,
  catchUpCopy,
  catchUpWindows,
  commentToDraft,
  firstStage,
  messageAge,
  nextStage,
  pulledDmKey,
  pullsPastDms,
  sortConversation,
} from "./rules";

const NOW = new Date("2026-11-20T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();
const msg = (id: string, direction: "incoming" | "outgoing", h: number): ProviderMessage => ({
  id,
  direction,
  text: id,
  createdAt: hoursAgo(h),
});
const { dmsSince, commentsSince } = catchUpWindows(NOW);

describe("catchUpWindows", () => {
  it("looks back 30 days for comments and DMs, 90 days for posts", () => {
    const w = catchUpWindows(NOW);
    expect(w.commentsSince.toISOString()).toBe("2026-10-21T12:00:00.000Z");
    expect(w.dmsSince.toISOString()).toBe("2026-10-21T12:00:00.000Z");
    expect(w.postsSince.toISOString()).toBe("2026-08-22T12:00:00.000Z");
  });
});

describe("stages", () => {
  it("starts with comments when there are any, else DMs, else nothing", () => {
    expect(firstStage({ comments: true, dms: true })).toBe("comments");
    expect(firstStage({ comments: false, dms: true })).toBe("dms");
    expect(firstStage({ comments: false, dms: false })).toBeNull();
  });
  it("comments → DMs → DMs again → done; skips DMs where there are none", () => {
    expect(nextStage("comments", true)).toBe("dms");
    expect(nextStage("comments", false)).toBe("done");
    expect(nextStage("dms", true)).toBe("dms_again");
    expect(nextStage("dms_again", true)).toBe("done");
  });
  it("only Instagram and Facebook pull past DMs", () => {
    expect(pullsPastDms("instagram")).toBe(true);
    expect(pullsPastDms("facebook")).toBe(true);
    expect(pullsPastDms("threads")).toBe(false);
  });
});

describe("commentToDraft", () => {
  const c = { id: "1", text: "hi", authorName: "a", fromOwner: false, createdAt: hoursAgo(5) };
  it("drafts a customer's unanswered comment from the window", () => {
    expect(commentToDraft(c, commentsSince)).toBe(true);
  });
  it("skips our own comments, ones we replied to, older ones and undated ones", () => {
    expect(commentToDraft({ ...c, fromOwner: true }, commentsSince)).toBe(false);
    expect(commentToDraft({ ...c, ownerReplied: true }, commentsSince)).toBe(false);
    expect(commentToDraft({ ...c, createdAt: hoursAgo(31 * 24) }, commentsSince)).toBe(false);
    expect(commentToDraft({ ...c, createdAt: null }, commentsSince)).toBe(false);
  });
});

describe("sortConversation", () => {
  it("business replied last: nothing to draft, nothing missed", () => {
    expect(
      sortConversation([msg("a", "incoming", 3), msg("b", "outgoing", 2)], NOW, dmsSince),
    ).toEqual({ draft: [], missed: [] });
  });

  it("customer wrote within 24 hours: drafts their unanswered messages inside the window", () => {
    const r = sortConversation(
      [
        msg("old", "incoming", 30),
        msg("reply", "outgoing", 28),
        msg("a", "incoming", 5),
        msg("b", "incoming", 1),
      ],
      NOW,
      dmsSince,
    );
    expect(r.draft.map((m) => m.id)).toEqual(["b", "a"]);
    expect(r.missed).toEqual([]);
  });

  it("a thread whose newest message is in the window drafts only the in-window part", () => {
    const r = sortConversation([msg("a", "incoming", 30), msg("b", "incoming", 2)], NOW, dmsSince);
    expect(r.draft.map((m) => m.id)).toEqual(["b"]);
    expect(r.missed).toEqual([]);
  });

  it("customer's last message is older than 24 hours: missed, never drafted", () => {
    const r = sortConversation(
      [msg("x", "outgoing", 200), msg("a", "incoming", 100), msg("b", "incoming", 48)],
      NOW,
      dmsSince,
    );
    expect(r.draft).toEqual([]);
    expect(r.missed.map((m) => m.id)).toEqual(["b", "a"]);
  });

  it("keeps missed messages to the last 30 days", () => {
    const r = sortConversation(
      [msg("ancient", "incoming", 40 * 24), msg("b", "incoming", 48)],
      NOW,
      dmsSince,
    );
    expect(r.missed.map((m) => m.id)).toEqual(["b"]);
    expect(sortConversation([msg("ancient", "incoming", 40 * 24)], NOW, dmsSince)).toEqual({
      draft: [],
      missed: [],
    });
  });

  it("order of the input doesn't matter; empty and undated input is safe", () => {
    const r = sortConversation([msg("b", "incoming", 1), msg("x", "outgoing", 2)], NOW, dmsSince);
    expect(r.draft.map((m) => m.id)).toEqual(["b"]);
    expect(sortConversation([], NOW, dmsSince)).toEqual({ draft: [], missed: [] });
    expect(
      sortConversation([{ ...msg("z", "incoming", 1), createdAt: "nope" }], NOW, dmsSince),
    ).toEqual({ draft: [], missed: [] });
  });
});

describe("pulledDmKey", () => {
  it("keys a pulled DM by Meta's id, apart from Zernio's own ids", () => {
    expect(pulledDmKey("m_123")).toBe("pulled:m_123");
  });
});

describe("card words", () => {
  const base = {
    handle: "@harbourbean",
    finished: true,
    comments: 12,
    dms: 3,
    missed: 37,
    pullsDms: true,
  };
  it("names the account like the platform does", () => {
    expect(accountHandle("harbourbean", "Instagram")).toBe("@harbourbean");
    expect(accountHandle("@harbourbean", "Instagram")).toBe("@harbourbean");
    expect(accountHandle("Harbour Bean Café", "Facebook")).toBe("Harbour Bean Café");
    expect(accountHandle(null, "Facebook")).toBe("Facebook");
  });
  it("says what was caught up and what was missed", () => {
    expect(catchUpCopy(base)).toEqual({
      title: "Waggle caught up on @harbourbean",
      lines: [
        "12 comments from the last 30 days, drafts ready",
        "3 DMs from the last 24 hours, drafts ready",
      ],
      missedTitle: "You missed 37 customer messages this month",
      missedLink: "See the 37 messages",
    });
  });
  it("one of each, none missed, no DMs on the platform", () => {
    const one = catchUpCopy({ ...base, comments: 1, dms: 1, missed: 1 });
    expect(one.lines).toEqual([
      "1 comment from the last 30 days, drafts ready",
      "1 DM from the last 24 hours, drafts ready",
    ]);
    expect(one.missedTitle).toBe("You missed 1 customer message this month");
    expect(one.missedLink).toBe("See the message");
    const none = catchUpCopy({ ...base, comments: 0, dms: 0, missed: 0, pullsDms: false });
    expect(none.lines).toEqual(["No unanswered comments from the last 30 days"]);
    expect(none.missedTitle).toBeNull();
  });
  it("while it runs, says it's reading", () => {
    expect(catchUpCopy({ ...base, finished: false }).title).toBe(
      "Waggle is catching up on @harbourbean",
    );
  });
  it("ages in hours, then days", () => {
    expect(messageAge(hoursAgo(26), NOW)).toBe("26h ago");
    expect(messageAge(hoursAgo(24 * 5 + 3), NOW)).toBe("5d ago");
  });
});
