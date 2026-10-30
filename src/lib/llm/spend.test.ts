import { describe, expect, it } from "vitest";
import {
  aiSpendStatus,
  DEFAULT_AI_MONTHLY_CAP_USD,
  defaultAiCap,
  monthStart,
  nextMonthStart,
} from "./spend";

const now = new Date("2026-10-30T15:00:00Z");

describe("AI spend cap (T32)", () => {
  it("counts the calendar month, UTC", () => {
    expect(monthStart(now).toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(nextMonthStart(now).toISOString()).toBe("2026-11-01T00:00:00.000Z");
    expect(nextMonthStart(new Date("2026-12-31T23:59:00Z")).toISOString()).toBe(
      "2027-01-01T00:00:00.000Z",
    );
  });

  it("warns from 80% and stops drafting at the cap", () => {
    expect(aiSpendStatus(10, 20, now).level).toBe("ok");
    expect(aiSpendStatus(16, 20, now).level).toBe("warn");
    expect(aiSpendStatus(20, 20, now).level).toBe("reached");
    expect(aiSpendStatus(25, 20, now).level).toBe("reached");
    // A cap of 0 turns drafting off.
    expect(aiSpendStatus(0, 0, now).level).toBe("reached");
  });

  it("uses the business's own cap, else AI_MONTHLY_CAP_USD, else the default", () => {
    expect(aiSpendStatus(1, 5, now, {})).toMatchObject({ capUsd: 5, customCap: true });
    expect(aiSpendStatus(1, null, now, { AI_MONTHLY_CAP_USD: "50" })).toMatchObject({
      capUsd: 50,
      customCap: false,
    });
    expect(defaultAiCap({})).toBe(DEFAULT_AI_MONTHLY_CAP_USD);
    expect(defaultAiCap({ AI_MONTHLY_CAP_USD: "-1" })).toBe(DEFAULT_AI_MONTHLY_CAP_USD);
    expect(defaultAiCap({ AI_MONTHLY_CAP_USD: "abc" })).toBe(DEFAULT_AI_MONTHLY_CAP_USD);
    expect(defaultAiCap({ AI_MONTHLY_CAP_USD: "0" })).toBe(0);
  });
});
