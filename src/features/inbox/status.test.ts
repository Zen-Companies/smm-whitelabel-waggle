import { describe, expect, it } from "vitest";
import { ITEM_STATUSES, nextStatus, type ItemStatus, type StatusEvent } from "./status";

describe("nextStatus", () => {
  it.each<[ItemStatus, StatusEvent, ItemStatus]>([
    ["new", "classified", "classified"],
    ["classified", "drafted", "drafted"],
    ["classified", "ignore", "ignored"],
    ["classified", "escalate", "escalated"],
    ["drafted", "await_approval", "awaiting_approval"],
    ["drafted", "send", "sending"],
    ["drafted", "escalate", "escalated"],
    ["awaiting_approval", "send", "sending"],
    ["awaiting_approval", "reject", "rejected"],
    ["sending", "sent", "sent"],
    ["sending", "escalate", "escalated"],
    ["sending", "await_approval", "awaiting_approval"],
    ["sent", "delivery_failed", "failed"],
    ["escalated", "handle", "handled"],
    // T41: "Reply publicly" after a comment's DM couldn't go out.
    ["escalated", "await_approval", "awaiting_approval"],
    // MCP Q1: the owner's own reply to a handed-over message.
    ["escalated", "send", "sending"],
    ["failed", "handle", "handled"],
    ["paused", "resume", "new"],
  ])("%s --%s--> %s (TDD §6)", (from, event, to) => {
    expect(nextStatus(from, event)).toBe(to);
  });

  it.each<ItemStatus>(["new", "classified", "drafted"])("%s can pause", (from) => {
    expect(nextStatus(from, "pause")).toBe("paused");
  });

  it.each<ItemStatus>(["awaiting_approval", "sending", "sent", "failed"])(
    "%s never pauses",
    (from) => {
      expect(nextStatus(from, "pause")).toBeNull();
    },
  );

  it.each<ItemStatus>(["new", "classified", "drafted", "sending"])(
    "%s fails when retries run out",
    (from) => {
      expect(nextStatus(from, "fail")).toBe("failed");
    },
  );

  it("terminal statuses accept nothing", () => {
    const events: StatusEvent[] = [
      "classified",
      "drafted",
      "ignore",
      "escalate",
      "await_approval",
      "send",
      "sent",
      "reject",
      "pause",
      "resume",
      "fail",
    ];
    for (const terminal of [
      "sent",
      "rejected",
      "ignored",
      "escalated",
      "failed",
      "handled",
    ] as const) {
      for (const event of events) {
        if (terminal === "escalated" && event === "await_approval") continue; // T41
        if (terminal === "escalated" && event === "send") continue; // MCP Q1
        expect(nextStatus(terminal, event)).toBeNull();
      }
    }
  });

  it("skipping a step is not allowed", () => {
    expect(nextStatus("new", "drafted")).toBeNull();
    expect(nextStatus("new", "send")).toBeNull();
    expect(nextStatus("classified", "send")).toBeNull();
    expect(nextStatus("awaiting_approval", "sent")).toBeNull();
  });

  it("only a sent reply can fail delivery", () => {
    for (const status of ITEM_STATUSES.filter((s) => s !== "sent")) {
      expect(nextStatus(status, "delivery_failed")).toBeNull();
    }
  });

  it("covers every status", () => {
    for (const status of ITEM_STATUSES) expect(() => nextStatus(status, "fail")).not.toThrow();
  });
});

describe("answered on the platform (T65)", () => {
  it("moves anything Waggle hasn't sent to handled", () => {
    for (const from of [
      "new",
      "classified",
      "drafted",
      "awaiting_approval",
      "escalated",
      "failed",
      "paused",
    ] as const) {
      expect(nextStatus(from, "answered_elsewhere")).toBe("handled");
    }
  });
  it("never touches a reply Waggle is sending or sent", () => {
    expect(nextStatus("sending", "answered_elsewhere")).toBeNull();
    expect(nextStatus("sent", "answered_elsewhere")).toBeNull();
    expect(nextStatus("handled", "answered_elsewhere")).toBeNull();
  });
});

describe("first connect: drafts past the reveal's 20 (20 Nov)", () => {
  it("a pulled question past the cap waits undrafted, and is drafted when opened", () => {
    expect(nextStatus("classified", "hold")).toBe("awaiting_draft");
    expect(nextStatus("awaiting_draft", "request_draft")).toBe("classified");
  });
  it("an undrafted item can be dealt with by the owner or on the platform", () => {
    expect(nextStatus("awaiting_draft", "handle")).toBe("handled");
    expect(nextStatus("awaiting_draft", "answered_elsewhere")).toBe("handled");
  });
  it("nothing else moves an undrafted item (no send, no draft without asking)", () => {
    for (const event of ["drafted", "send", "await_approval", "classified", "pause"] as const) {
      expect(nextStatus("awaiting_draft", event)).toBeNull();
    }
    expect(nextStatus("new", "hold")).toBeNull();
    expect(nextStatus("drafted", "hold")).toBeNull();
  });
  it("a draft waiting for approval is rewritten after the owner changes an answer", () => {
    expect(nextStatus("awaiting_approval", "redraft")).toBe("classified");
    for (const from of ["sending", "sent", "drafted", "escalated"] as const) {
      expect(nextStatus(from, "redraft")).toBeNull();
    }
  });
});
