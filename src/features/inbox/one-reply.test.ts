import { describe, expect, it } from "vitest";
import { answeredByLaterMessage, coveredByReply, type ConversationMessage } from "./one-reply";
import { nextStatus } from "./status";

const m = (
  id: string,
  receivedAt: string,
  status: string,
  kind = "dm",
): ConversationMessage => ({ id, kind, status, receivedAt });

describe("one reply per conversation (26 Nov)", () => {
  const first = m("a", "2026-11-25T11:38:00Z", "classified");
  const second = m("b", "2026-11-25T11:39:00Z", "new");
  const third = m("c", "2026-11-25T11:40:00Z", "awaiting_approval");

  it("doesn't draft a message the same sender followed up while the later one is open", () => {
    expect(answeredByLaterMessage(first, [second, third])).toBe(true);
    expect(answeredByLaterMessage(third, [first, second])).toBe(false);
  });

  it("drafts it when the later message is already done (answered, hidden)", () => {
    expect(answeredByLaterMessage(first, [m("b", second.receivedAt, "sent")])).toBe(false);
    expect(answeredByLaterMessage(first, [m("b", second.receivedAt, "ignored")])).toBe(false);
  });

  it("keeps a reply per comment (each is answered under itself)", () => {
    const c1 = m("x", "2026-11-25T09:00:00Z", "classified", "comment");
    const c2 = m("y", "2026-11-25T09:05:00Z", "new", "comment");
    expect(answeredByLaterMessage(c1, [c2])).toBe(false);
    expect(coveredByReply(c2, [m("x", c1.receivedAt, "awaiting_approval", "comment")])).toEqual(
      [],
    );
  });

  it("a reply to the latest closes the earlier ones that wait on the owner, not later ones", () => {
    const waiting = [
      m("a", "2026-11-25T11:38:00Z", "awaiting_draft"),
      m("b", "2026-11-25T11:39:00Z", "awaiting_approval"),
      m("old", "2026-11-20T10:00:00Z", "sent"),
      m("later", "2026-11-25T12:00:00Z", "escalated"),
      m("busy", "2026-11-25T11:00:00Z", "classified"),
      m("f", "2026-11-25T10:00:00Z", "failed"),
    ];
    expect(coveredByReply(third, waiting).map((x) => x.id)).toEqual(["a", "b", "f"]);
  });

  it("orders two messages with the same time by id", () => {
    const same = "2026-11-25T11:40:00Z";
    expect(answeredByLaterMessage(m("a", same, "new"), [m("b", same, "new")])).toBe(true);
    expect(answeredByLaterMessage(m("b", same, "new"), [m("a", same, "new")])).toBe(false);
  });

  it("every status a covered message can be in closes as handled", () => {
    for (const s of ["awaiting_approval", "awaiting_draft", "escalated", "failed"] as const) {
      expect(nextStatus(s, "answered_together")).toBe("handled");
    }
    expect(nextStatus("sent", "answered_together")).toBeNull();
    expect(nextStatus("classified", "answered_together")).toBeNull();
  });

  it("an automated sender's new email is set aside, never drafted", () => {
    expect(nextStatus("new", "automated_sender")).toBe("ignored");
    expect(nextStatus("classified", "automated_sender")).toBeNull();
  });
});
