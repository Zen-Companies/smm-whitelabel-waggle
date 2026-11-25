import { describe, expect, it } from "vitest";
import { postDay } from "./calendar";
import {
  clock12,
  clockIn,
  dateTimeIn,
  dayKeyIn,
  fromWallClock,
  shortWhen,
  wallClockIn,
  zoneLine,
} from "./post-time";

// The calendar renders on a UTC server (Posts round 1, 25 Nov): times and days in the viewer's
// zone.

describe("times in the viewer's zone", () => {
  const nineManila = "2026-11-25T01:00:00.000Z"; // 9:00 AM in Manila

  it("shows 9:00 AM in Manila, not the server's 1:00 AM", () => {
    expect(clockIn(nineManila, "Asia/Manila")).toBe("9:00 AM");
    expect(clockIn(nineManila, "UTC")).toBe("1:00 AM");
    expect(dateTimeIn(nineManila, "Asia/Manila")).toBe("Wed, Nov 25, 9:00 AM");
  });

  it("puts an early post on its own day, not the day before", () => {
    const earlyManila = "2026-11-24T23:30:00.000Z"; // 7:30 AM on the 25th in Manila
    expect(dayKeyIn(new Date(earlyManila), "Asia/Manila")).toBe("2026-11-25");
    expect(dayKeyIn(new Date(earlyManila), "UTC")).toBe("2026-11-24");
    expect(
      postDay(
        { published_at: null, scheduled_for: earlyManila, created_at: "2026-11-20T00:00:00Z" },
        "Asia/Manila",
      ),
    ).toBe("2026-11-25");
  });

  it("names the zone once", () => {
    expect(zoneLine("America/New_York")).toBe("Times in America/New York");
  });
});

describe("wall-clock times (Posts Round 3)", () => {
  it("reads a day and time in the zone", () => {
    expect(wallClockIn("2026-11-25T23:30:00.000Z", "Asia/Manila")).toEqual({
      day: "2026-11-26",
      time: "07:30",
    });
    expect(wallClockIn("2026-11-25T00:00:00.000Z", "UTC")).toEqual({
      day: "2026-11-25",
      time: "00:00",
    });
  });

  it("turns a wall-clock time back into the instant, in any zone", () => {
    expect(fromWallClock("2026-11-26", "09:00", "Asia/Manila").toISOString()).toBe(
      "2026-11-26T01:00:00.000Z",
    );
    expect(fromWallClock("2026-11-26", "09:00", "America/New_York").toISOString()).toBe(
      "2026-11-26T14:00:00.000Z",
    );
  });

  it("keeps 9:00 as 9:00 across a daylight-saving change", () => {
    // New York leaves daylight time on Sun 1 Nov 2026.
    expect(fromWallClock("2026-10-31", "09:00", "America/New_York").toISOString()).toBe(
      "2026-10-31T13:00:00.000Z",
    );
    expect(fromWallClock("2026-11-02", "09:00", "America/New_York").toISOString()).toBe(
      "2026-11-02T14:00:00.000Z",
    );
  });

  it("names a day and time short", () => {
    expect(shortWhen("2026-11-26", "19:00")).toBe("Thu 26 · 7:00 PM");
    expect(shortWhen("2026-11-27", "00:15")).toBe("Fri 27 · 12:15 AM");
    expect(clock12("12:00")).toBe("12:00 PM");
  });
});
