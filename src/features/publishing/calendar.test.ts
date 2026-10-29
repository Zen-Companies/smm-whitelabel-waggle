import { describe, expect, it } from "vitest";
import {
  monthParam,
  monthWeeks,
  needsNewTime,
  parseDay,
  parseMonth,
  postDay,
  shiftMonth,
} from "./calendar";

describe("calendar", () => {
  it("reads the month from the URL, falling back to this month", () => {
    const now = new Date(2026, 9, 29);
    expect(parseMonth("2026-11", now)).toEqual({ year: 2026, month: 11 });
    expect(parseMonth("2026-13", now)).toEqual({ year: 2026, month: 10 });
    expect(parseMonth(undefined, now)).toEqual({ year: 2026, month: 10 });
    expect(monthParam({ year: 2026, month: 3 })).toBe("2026-03");
  });

  it("moves across years", () => {
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
  });

  it("lays out October 2026 in Sunday-first weeks", () => {
    const weeks = monthWeeks({ year: 2026, month: 10 });
    expect(weeks).toHaveLength(5);
    expect(weeks[0][0]).toBe("2026-09-27");
    expect(weeks[0][4]).toBe("2026-10-01");
    expect(weeks[4][6]).toBe("2026-10-31");
    expect(weeks.every((w) => w.length === 7)).toBe(true);
  });

  it("adds a sixth row when the month needs it", () => {
    // August 2026 starts on a Saturday and has 31 days.
    expect(monthWeeks({ year: 2026, month: 8 })).toHaveLength(6);
  });

  it("only accepts real days", () => {
    expect(parseDay("2026-11-01")).toBe("2026-11-01");
    expect(parseDay("2026-02-30")).toBeNull();
    expect(parseDay("tomorrow")).toBeNull();
  });

  it("puts a post on the day it went out, else the day it's planned", () => {
    const local = (y: number, m: number, d: number, h = 9) =>
      new Date(y, m - 1, d, h).toISOString();
    expect(
      postDay({
        published_at: local(2026, 10, 27),
        scheduled_for: local(2026, 10, 26),
        created_at: local(2026, 10, 20),
      }),
    ).toBe("2026-10-27");
    expect(
      postDay({
        published_at: null,
        scheduled_for: local(2026, 10, 31),
        created_at: local(2026, 10, 20),
      }),
    ).toBe("2026-10-31");
  });

  it("flags posts that need a new time", () => {
    expect(needsNewTime({ status: "failed", failure_reason: null })).toBe(true);
    expect(needsNewTime({ status: "cancelled", failure_reason: "zernio_paused" })).toBe(true);
    expect(needsNewTime({ status: "cancelled", failure_reason: null })).toBe(false);
    expect(needsNewTime({ status: "scheduled", failure_reason: null })).toBe(false);
  });
});
