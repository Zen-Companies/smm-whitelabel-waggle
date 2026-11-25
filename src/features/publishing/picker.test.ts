import { describe, expect, it } from "vitest";
import {
  dayName,
  from12h,
  isPastDay,
  monthGrid,
  monthTitle,
  pickLabel,
  readTime,
  shiftMonthKey,
  stepTime,
  to12h,
} from "./picker";

// Waggle's own date and time picker (Posts Round 3).

describe("the month", () => {
  it("starts on Monday, with blanks before the 1st (November 2026 starts on a Sunday)", () => {
    const grid = monthGrid("2026-11");
    expect(grid[0]).toEqual([null, null, null, null, null, null, "2026-11-01"]);
    expect(grid[1][0]).toBe("2026-11-02");
    expect(grid.flat().filter(Boolean)).toHaveLength(30);
    expect(grid.every((w) => w.length === 7)).toBe(true);
    expect(grid[grid.length - 1]).toEqual(["2026-11-30", null, null, null, null, null, null]);
  });

  it("moves between months and years", () => {
    expect(shiftMonthKey("2026-12", 1)).toBe("2027-01");
    expect(shiftMonthKey("2026-01", -1)).toBe("2025-12");
    expect(monthTitle("2026-11")).toBe("November 2026");
  });

  it("past days can't be picked; today can", () => {
    expect(isPastDay("2026-11-24", "2026-11-25")).toBe(true);
    expect(isPastDay("2026-11-25", "2026-11-25")).toBe(false);
    expect(dayName("2026-11-26")).toBe("Thursday, November 26");
  });
});

describe("the time", () => {
  it("converts between 24 h and AM/PM", () => {
    expect(to12h("19:00")).toEqual({ hour: 7, minute: 0, pm: true });
    expect(to12h("00:15")).toEqual({ hour: 12, minute: 15, pm: false });
    expect(to12h("12:30")).toEqual({ hour: 12, minute: 30, pm: true });
    expect(from12h(12, 0, false)).toBe("00:00");
    expect(from12h(12, 0, true)).toBe("12:00");
    expect(from12h(7, 45, true)).toBe("19:45");
  });

  it("moves in 15-minute steps, snapped, within the day", () => {
    expect(stepTime("09:00", 1)).toBe("09:15");
    expect(stepTime("09:07", 0)).toBe("09:00");
    expect(stepTime("09:08", 0)).toBe("09:15");
    expect(stepTime("23:45", 1)).toBe("00:00");
    expect(stepTime("00:00", -1)).toBe("23:45");
  });

  it("reads a typed time, or says it can't", () => {
    expect(readTime("7", "00", true)).toBe("19:00");
    expect(readTime("7", "20", false)).toBe("07:15");
    expect(readTime("13", "00", false)).toBeNull();
    expect(readTime("x", "00", false)).toBeNull();
  });

  it("names the result on the button", () => {
    expect(pickLabel("Move to", "2026-11-26", "19:00")).toBe("Move to Thu 26 · 7:00 PM");
    expect(pickLabel("Use", "2026-11-27", "12:00")).toBe("Use Fri 27 · 12:00 PM");
  });
});
