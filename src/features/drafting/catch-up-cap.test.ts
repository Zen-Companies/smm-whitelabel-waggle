import { describe, expect, it } from "vitest";
import { holdPulledItem } from "./catch-up-cap";

describe("holdPulledItem (first-connect draft cap)", () => {
  it("a webhook item is always drafted", () => {
    expect(holdPulledItem({ catchUpId: null, draftRequestedAt: null })).toBe(false);
  });
  it("a pulled item waits until its draft is asked for", () => {
    expect(holdPulledItem({ catchUpId: "c1", draftRequestedAt: null })).toBe(true);
  });
  it("a pulled item picked for the reveal, or opened by the owner, is drafted", () => {
    expect(holdPulledItem({ catchUpId: "c1", draftRequestedAt: "2026-11-20T12:00:00Z" })).toBe(
      false,
    );
  });
});
