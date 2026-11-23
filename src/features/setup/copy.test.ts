import { describe, expect, it } from "vitest";
import {
  ageLabel,
  answerMeter,
  batchProgress,
  doneLines,
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

describe("doneLines", () => {
  const sending = { total: 0, sent: 0, left: 0, failed: 0 };
  it("lists what's done, as on the board", () => {
    expect(
      doneLines({
        platforms: ["Instagram"],
        sending: { total: 2, sent: 2, left: 0, failed: 0 },
        mode: "approve",
        waiting: [{ author: "Leo", category: "complaint" }],
      }),
    ).toEqual([
      "Instagram connected",
      "2 replies sent",
      "Ask me first before sending",
      "Leo’s complaint is in your Inbox",
    ]);
  });

  it("says replies still going out, on its own, and several waiting", () => {
    expect(
      doneLines({
        platforms: ["Instagram", "Facebook"],
        sending: { total: 3, sent: 1, left: 2, failed: 0 },
        mode: "auto",
        waiting: [
          { author: "Leo", category: "faq" },
          { author: "Ana", category: "lead" },
        ],
      }),
    ).toEqual([
      "Instagram and Facebook connected",
      "3 replies on their way",
      "Waggle replies on its own",
      "2 messages wait for you in your Inbox",
    ]);
  });

  it("never counts replies that couldn't go out as sent", () => {
    expect(
      doneLines({
        platforms: ["Instagram"],
        sending: { total: 2, sent: 0, left: 0, failed: 2 },
        mode: "approve",
        waiting: [],
      }),
    ).toEqual([
      "Instagram connected",
      "2 replies couldn’t go out. They’re in your Inbox.",
      "Ask me first before sending",
    ]);
    expect(
      doneLines({
        platforms: [],
        sending: { total: 4, sent: 2, left: 1, failed: 1 },
        mode: "approve",
        waiting: [],
      }),
    ).toEqual([
      "3 replies on their way",
      "1 reply couldn’t go out. They’re in your Inbox.",
      "Ask me first before sending",
    ]);
    expect(
      doneLines({
        platforms: [],
        sending: { total: 3, sent: 2, left: 0, failed: 1 },
        mode: "approve",
        waiting: [],
      }),
    ).toEqual([
      "2 replies sent",
      "1 reply couldn’t go out. They’re in your Inbox.",
      "Ask me first before sending",
    ]);
  });

  it("leaves out what didn't happen", () => {
    expect(doneLines({ platforms: [], sending, mode: "approve", waiting: [] })).toEqual([
      "Ask me first before sending",
    ]);
  });
});
