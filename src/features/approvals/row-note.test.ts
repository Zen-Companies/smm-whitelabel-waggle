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
