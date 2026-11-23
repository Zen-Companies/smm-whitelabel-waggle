import { describe, expect, it } from "vitest";
import { MISSED_TEXT_MAX, missedToClassify, type MissedRow } from "./missed-topics";

const row = (c: string, text: string, at: string, category: string | null = null): MissedRow => ({
  zernio_conversation_id: c,
  text,
  received_at: at,
  category,
});

describe("missedToClassify", () => {
  it("joins each unsorted conversation oldest first, newest conversations first", () => {
    expect(
      missedToClassify([
        row("a", "how much?", "2026-11-10T10:05:00Z"),
        row("a", "hi", "2026-11-10T10:00:00Z"),
        row("b", "open sunday?", "2026-11-12T09:00:00Z"),
        row("c", "  ", "2026-11-13T09:00:00Z"),
      ]),
    ).toEqual([
      { conversationId: "b", text: "open sunday?" },
      { conversationId: "a", text: "hi\nhow much?" },
    ]);
  });

  it("skips sorted conversations and counts them against the cap", () => {
    const rows = [
      row("done", "x", "2026-11-14T00:00:00Z", "faq"),
      row("done", "y", "2026-11-15T00:00:00Z"),
      row("a", "a", "2026-11-10T00:00:00Z"),
      row("b", "b", "2026-11-11T00:00:00Z"),
    ];
    expect(missedToClassify(rows, 2).map((c) => c.conversationId)).toEqual(["b"]);
    expect(missedToClassify(rows, 1)).toEqual([]);
  });

  it("keeps the newest end of a long conversation", () => {
    const [c] = missedToClassify([
      row("a", "x".repeat(MISSED_TEXT_MAX), "2026-11-10T00:00:00Z"),
      row("a", "the newest", "2026-11-11T00:00:00Z"),
    ]);
    expect(c.text).toHaveLength(MISSED_TEXT_MAX);
    expect(c.text.endsWith("the newest")).toBe(true);
  });
});
