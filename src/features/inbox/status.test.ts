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
    for (const terminal of ["sent", "rejected", "ignored", "escalated", "failed"] as const) {
      for (const event of events) expect(nextStatus(terminal, event)).toBeNull();
    }
  });

  it("skipping a step is not allowed", () => {
    expect(nextStatus("new", "drafted")).toBeNull();
    expect(nextStatus("new", "send")).toBeNull();
    expect(nextStatus("classified", "send")).toBeNull();
    expect(nextStatus("awaiting_approval", "sent")).toBeNull();
  });

  it("covers every status", () => {
    for (const status of ITEM_STATUSES) expect(() => nextStatus(status, "fail")).not.toThrow();
  });
});
