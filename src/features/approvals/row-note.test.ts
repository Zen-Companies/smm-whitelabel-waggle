import { describe, expect, it } from "vitest";
import type { InboxEntry } from "./inbox-data";
import { rowNote } from "./row-note";

const entry = (
  over: Partial<InboxEntry & { status: string }>,
): InboxEntry & { status: string } => ({
  itemId: "i",
  kind: "dm",
  platform: "instagram",
  authorName: "paolo.cruz",
  text: "GCash?",
  receivedAt: "2026-10-30T10:00:00Z",
  category: "faq",
  confidence: 0.9,
  classifierUsed: "jev",
  draft: null,
  dmWindowClosesAt: null,
  permalink: null,
  hiddenOnPlatformAt: null,
  attempts: 0,
  status: "awaiting_approval",
  ...over,
});

const draft = (over: Partial<NonNullable<InboxEntry["draft"]>> = {}) => ({
  id: "d",
  body: "Yes!",
  editedBody: null,
  needsHuman: false,
  needsHumanReason: null,
  facts: [],
  status: "pending",
  sentAt: null,
  decidedByOwner: true,
  replyVia: "public" as const,
  ...over,
});

describe("rowNote (Paper rule 4: what happens next, in plain words)", () => {
  it("replies waiting for the owner's OK", () => {
    expect(rowNote(entry({ draft: draft() }))).toEqual({
      tone: "none",
      text: "Reply ready to send",
    });
    expect(rowNote(entry({ category: "lead", draft: draft() }))).toEqual({
      tone: "lead",
      label: "Lead",
      text: "reply ready",
    });
  });

  it("messages handed to the owner say why", () => {
    expect(rowNote(entry({ status: "escalated", category: "complaint" }))).toMatchObject({
      tone: "complaint",
      label: "Complaint",
    });
    expect(rowNote(entry({ status: "escalated", draft: draft({ needsHuman: true }) })).text).toBe(
      "Not in your business info",
    );
    expect(rowNote(entry({ status: "failed" })).text).toBe("Couldn't be sent");
  });

  it("answered rows say who answered and how fast", () => {
    expect(
      rowNote(
        entry({
          status: "sent",
          draft: draft({ sentAt: "2026-10-30T10:00:06Z", decidedByOwner: false }),
        }),
      ),
    ).toEqual({ tone: "done", text: "Answered by Waggle in 6 s" });
    expect(
      rowNote(entry({ status: "sent", draft: draft({ sentAt: "2026-10-30T10:04:00Z" }) })).text,
    ).toBe("Answered by you in 4 m");
  });

  it("ignored and closed items", () => {
    expect(rowNote(entry({ status: "ignored" })).text).toBe("Ignored: looked like spam");
    expect(rowNote(entry({ status: "rejected" })).text).toBe("You chose not to reply");
  });
});

describe("rowNote: spam comments (T40)", () => {
  const spam = { kind: "comment" as const, category: "spam" };
  it("a spam comment waiting for the owner says so", () => {
    expect(rowNote(entry({ ...spam, status: "escalated" }))).toEqual({
      tone: "none",
      text: "Looks like spam: hide it",
    });
  });
  it("a hidden comment says where it was hidden", () => {
    const hidden = { ...spam, hiddenOnPlatformAt: "2026-10-30T10:01:00Z" };
    expect(rowNote(entry({ ...hidden, status: "ignored" })).text).toBe("Hidden on Instagram");
    expect(rowNote(entry({ ...hidden, status: "handled", platform: "facebook" })).text).toBe(
      "Hidden on Facebook",
    );
  });
});

describe("rowNote: comments answered in DM (T41)", () => {
  const dm = { kind: "comment" as const, category: "lead" };
  it("says the ready reply goes by DM", () => {
    expect(rowNote(entry({ ...dm, draft: draft({ replyVia: "dm" }) }))).toEqual({
      tone: "lead",
      label: "Lead",
      text: "reply ready, in DM",
    });
  });
  it("says it was answered in DM", () => {
    expect(
      rowNote(
        entry({
          ...dm,
          status: "sent",
          draft: draft({ replyVia: "dm", status: "sent", sentAt: "2026-10-30T10:01:00Z" }),
        }),
      ).text,
    ).toBe("Replied in DM by you");
  });
});
