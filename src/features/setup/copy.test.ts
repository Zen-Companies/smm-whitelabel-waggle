import { describe, expect, it } from "vitest";
import {
  ageLabel,
  answerMeter,
  batchProgress,
  firstNameOf,
  highlightParts,
  progressLine,
  replyMeta,
  sendingLine,
  sendingMinutes,
} from "./copy";

describe("sending", () => {
  it("says how long, honestly (25 s apart)", () => {
    expect(sendingMinutes(14, 25_000)).toBe(6);
    expect(sendingLine(14, 25_000)).toBe(
      "Sending 14 replies, about 6 minutes. You can leave this page.",
    );
    expect(sendingLine(2, 25_000)).toBe(
      "Sending 2 replies, about 1 minute. You can leave this page.",
    );
    expect(sendingLine(1, 25_000)).toBe("Sending 1 reply. You can leave this page.");
  });

  it("follows the real statuses", () => {
    const p = batchProgress(["sent", "sent", "sending", "sending", "sending", "failed", "x"]);
    expect(p).toEqual({ total: 6, sent: 2, left: 3, failed: 1 });
    expect(progressLine(p, 25_000, "Instagram")).toBe(
      "One every 25 seconds, so Instagram doesn’t flag the account. About 2 minutes left; you can go on.",
    );
    expect(progressLine(batchProgress(["sent"]), 25_000, "Instagram")).toBe("All sent.");
    expect(progressLine(batchProgress(["sent", "failed"]), 25_000, "Instagram")).toBe(
      "1 reply couldn’t go out. They’re in your Inbox.",
    );
  });
});

describe("answerMeter", () => {
  it("is X of Y with a percent", () => {
    expect(answerMeter(14, 20)).toEqual({ x: 14, y: 20, pct: 70 });
    expect(answerMeter(0, 0)).toEqual({ x: 0, y: 0, pct: 0 });
    expect(answerMeter(30, 20)).toEqual({ x: 20, y: 20, pct: 100 });
  });
});

describe("highlightParts", () => {
  it("marks each fact where it appears", () => {
    expect(highlightParts("A box of 12 is ₱720. Pickup or ₱720 delivery?", ["₱720"])).toEqual([
      { text: "A box of 12 is ", mark: false },
      { text: "₱720", mark: true },
      { text: ". Pickup or ", mark: false },
      { text: "₱720", mark: true },
      { text: " delivery?", mark: false },
    ]);
  });

  it("prefers the longer fact and leaves the reply alone without facts", () => {
    expect(highlightParts("Open 7am–6pm", ["7am", "7am–6pm"])).toEqual([
      { text: "Open ", mark: false },
      { text: "7am–6pm", mark: true },
    ]);
    expect(highlightParts("Hi!", [])).toEqual([{ text: "Hi!", mark: false }]);
  });
});

describe("small words", () => {
  it("names people and replies", () => {
    expect(firstNameOf("Fresh Sedoriosa", "x@y.z")).toBe("Fresh");
    expect(firstNameOf(undefined, "mika@shop.ph")).toBe("mika");
    expect(firstNameOf("", null)).toBe("there");
    expect(replyMeta({ kind: "dm", hoursLeft: 17, status: "awaiting_approval" })).toBe(
      "DM · 17h left",
    );
    expect(replyMeta({ kind: "comment", hoursLeft: null, status: "sent" })).toBe("comment · sent");
    const now = new Date("2026-11-20T12:00:00Z");
    expect(ageLabel("2026-11-19T10:00:00Z", now)).toBe("yesterday");
    expect(ageLabel("2026-11-17T10:00:00Z", now)).toBe("3 days");
    expect(ageLabel("2026-11-20T10:00:00Z", now)).toBe("today");
  });
});
