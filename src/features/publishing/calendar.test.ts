import { describe, expect, it } from "vitest";
import {
  monthParam,
  monthWeeks,
  needsNewTime,
  parseDay,
  parseTime,
  parseMonth,
  postDay,
  postStatusWord,
  shiftMonth,
  shiftWeek,
  weekDays,
  weekLabel,
  weekStart,
  weekSummary,
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
    expect(parseTime("08:00")).toBe("08:00");
    expect(parseTime("24:00")).toBeNull();
    expect(parseTime("8am")).toBeNull();
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

describe("week view (T74a)", () => {
  it("finds the week's Sunday and its days", () => {
    expect(weekStart("2026-11-13")).toBe("2026-11-08");
    expect(weekStart("2026-11-08")).toBe("2026-11-08");
    expect(weekDays("2026-11-29")).toEqual([
      "2026-11-29",
      "2026-11-30",
      "2026-12-01",
      "2026-12-02",
      "2026-12-03",
      "2026-12-04",
      "2026-12-05",
    ]);
    expect(shiftWeek("2026-12-27", 1)).toBe("2027-01-03");
  });

  it("labels the week and sums it up", () => {
    expect(weekLabel("2026-11-08")).toBe("Nov 8 to 14");
    expect(weekLabel("2026-11-29")).toBe("Nov 29 to Dec 5");
    const p = (status: string, failure_reason: string | null = null) => ({
      status,
      failure_reason,
    });
    expect(
      weekSummary([p("published"), p("published"), p("published"), p("scheduled"), p("failed")]),
    ).toBe("3 posted · 1 planned · 1 needs you");
    expect(weekSummary([])).toBe("Nothing planned yet");
    expect(postStatusWord(p("cancelled", "payment"))).toBe("Needs you");
  });
});
