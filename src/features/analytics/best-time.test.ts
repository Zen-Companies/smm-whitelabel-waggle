import { describe, expect, it } from "vitest";
import {
  hourLabel,
  nextOccurrence,
  onlineGrid,
  peakCell,
  slotLabel,
  toLocalSlot,
  topSlots,
} from "./best-time";

describe("best time in the viewer's time", () => {
  it("moves a UTC slot into local time, across midnight and the week's end", () => {
    // Saturday 00:00 UTC is Saturday 8 AM in Manila (UTC+8, offset -480).
    expect(toLocalSlot({ dayOfWeek: 5, hourUtc: 0 }, -480)).toEqual({
      dayOfWeek: 5,
      hour: 8,
      minute: 0,
    });
    // Monday 02:00 UTC is Sunday 9 PM in New York (UTC-5, offset 300).
    expect(toLocalSlot({ dayOfWeek: 0, hourUtc: 2 }, 300)).toEqual({
      dayOfWeek: 6,
      hour: 21,
      minute: 0,
    });
    // Sunday 23:00 UTC is Monday 4:30 AM in India (UTC+5:30).
    expect(toLocalSlot({ dayOfWeek: 6, hourUtc: 23 }, -330)).toEqual({
      dayOfWeek: 0,
      hour: 4,
      minute: 30,
    });
  });

  it("labels hours and slots", () => {
    expect(hourLabel(0)).toBe("12 AM");
    expect(hourLabel(12)).toBe("12 PM");
    expect(hourLabel(20, 30)).toBe("8:30 PM");
    expect(slotLabel({ dayOfWeek: 5, hour: 8, minute: 0 })).toBe("Sat 8 AM");
  });

  it("finds the next time a slot comes round, at least an hour away", () => {
    // Thursday Nov 5, 2026, 10 AM local.
    const now = new Date(2026, 10, 5, 10, 0);
    expect(nextOccurrence({ dayOfWeek: 5, hour: 8, minute: 0 }, now)).toEqual({
      day: "2026-11-07",
      time: "08:00",
    });
    // Same day, later: today.
    expect(nextOccurrence({ dayOfWeek: 3, hour: 19, minute: 0 }, now).day).toBe("2026-11-05");
    // Same day, already past: next week.
    expect(nextOccurrence({ dayOfWeek: 3, hour: 10, minute: 30 }, now).day).toBe("2026-11-12");
  });

  it("ranks slots that have posts behind them", () => {
    const slots = [
      { dayOfWeek: 1, hourUtc: 1, avgEngagement: 100, postCount: 3 },
      { dayOfWeek: 2, hourUtc: 1, avgEngagement: 900, postCount: 0 },
      { dayOfWeek: 3, hourUtc: 1, avgEngagement: 300, postCount: 2 },
    ];
    expect(topSlots(slots, 2).map((s) => s.dayOfWeek)).toEqual([3, 1]);
  });
});

describe("onlineGrid", () => {
  it("averages each weekday and hour; the day is the one before endTime", () => {
    const hours = (v: number) => new Array(24).fill(v);
    const grid = onlineGrid({
      days: [
        // Ends Sunday Nov 8 00:00 UTC: describes Saturday.
        { endTime: "2026-11-08T00:00:00Z", hours: hours(10) },
        { endTime: "2026-11-15T00:00:00Z", hours: hours(20) },
        // Ends Tuesday: describes Monday.
        { endTime: "2026-11-10T07:00:00Z", hours: [99, ...hours(1).slice(1)] },
      ],
    })!;
    expect(grid[5][3]).toBe(15);
    expect(grid[0][0]).toBe(99);
    expect(grid[2][0]).toBe(0);
    expect(peakCell(grid)).toEqual({ dayOfWeek: 0, hour: 0, value: 99 });
  });

  it("is null without data", () => {
    expect(onlineGrid(null)).toBeNull();
    expect(onlineGrid({ days: [] })).toBeNull();
  });
});
