import { describe, expect, it } from "vitest";
import { allowanceNotice } from "./allowance-notice";

const resetsAt = new Date("2026-11-01T00:00:00Z");

describe("allowanceNotice (T32)", () => {
  it("says nothing while there's plenty left", () => {
    expect(allowanceNotice({ level: "ok", resetsAt })).toBeNull();
  });

  it("warns before, and says what happens once it's used up", () => {
    expect(allowanceNotice({ level: "warn", resetsAt })).toContain("used most of");
    expect(allowanceNotice({ level: "reached", resetsAt })).toBe(
      "This month's AI allowance is used up. New messages are still sorted, but they come to you without a suggested reply until the end of October.",
    );
  });
});
