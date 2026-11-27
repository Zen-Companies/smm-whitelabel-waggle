import { describe, expect, it } from "vitest";
import { pickRepliesBack, REPLIES_BACK_MAX, type HeldItem } from "./replies-back";

const NOW = new Date("2026-11-26T12:00:00Z");
const ago = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();
const item = (o: Partial<HeldItem>): HeldItem => ({
  id: "x",
  kind: "dm",
  platform: "instagram",
  receivedAt: ago(1),
  lastCustomerMessageAt: ago(1),
  reason: "ai_cap_reached",
  ...o,
});

describe("pickRepliesBack", () => {
  it("only the messages handed over because replies were out", () => {
    expect(
      pickRepliesBack(
        [
          item({ id: "a" }),
          item({ id: "b", reason: "complaint" }),
          item({ id: "c", reason: null }),
        ],
        NOW,
      ),
    ).toEqual(["a"]);
  });

  it("oldest window first, comments by when they came in", () => {
    expect(
      pickRepliesBack(
        [
          item({ id: "new", lastCustomerMessageAt: ago(1) }),
          item({ id: "comment", kind: "comment", receivedAt: ago(5), lastCustomerMessageAt: null }),
          item({ id: "old", lastCustomerMessageAt: ago(20) }),
        ],
        NOW,
      ),
    ).toEqual(["old", "comment", "new"]);
  });

  it("leaves DMs whose window closed with the owner (a reply can't go out)", () => {
    expect(
      pickRepliesBack(
        [
          item({ id: "closed", lastCustomerMessageAt: ago(25) }),
          item({ id: "tiktok", platform: "tiktok", lastCustomerMessageAt: ago(25) }),
          item({ id: "comment", kind: "comment", receivedAt: ago(100) }),
        ],
        NOW,
      ),
    ).toEqual(["comment", "tiktok"]);
  });

  it("is bounded", () => {
    const many = Array.from({ length: REPLIES_BACK_MAX + 20 }, (_, i) => item({ id: `i${i}` }));
    expect(pickRepliesBack(many, NOW)).toHaveLength(REPLIES_BACK_MAX);
  });
});
