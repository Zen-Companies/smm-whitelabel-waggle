import { describe, expect, it } from "vitest";
import { postDay } from "./calendar";
import { clockIn, dateTimeIn, dayKeyIn, zoneLine } from "./post-time";

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
