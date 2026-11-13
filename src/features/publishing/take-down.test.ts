import { describe, expect, it } from "vitest";
import { canTakeDown, statusAfterTakeDown, takeDownSplit } from "./take-down";

describe("take down", () => {
  it("Instagram, TikTok and Snapchat can't be removed by an app", () => {
    for (const p of ["instagram", "tiktok", "snapchat"]) expect(canTakeDown(p)).toBe(false);
    for (const p of ["facebook", "youtube", "linkedin", "threads", "bluesky"]) {
      expect(canTakeDown(p)).toBe(true);
    }
  });

  it("splits a post's platforms", () => {
    expect(takeDownSplit(["instagram", "facebook", "facebook", "tiktok", "youtube"])).toEqual({
      removable: ["facebook", "youtube"],
      byHand: ["instagram", "tiktok"],
    });
  });

  it("cancelled only when it's gone everywhere", () => {
    expect(statusAfterTakeDown(2, 2)).toBe("cancelled");
    expect(statusAfterTakeDown(1, 2)).toBe("published");
    expect(statusAfterTakeDown(0, 0)).toBe("published");
  });
});
