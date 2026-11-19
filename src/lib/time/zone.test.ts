import { describe, expect, it } from "vitest";
import { startOfDayIn, validTimeZone } from "./zone";

describe("the viewer's day", () => {
  it("starts at local midnight", () => {
    // 15:30 UTC = 23:30 in Manila, same day there.
    expect(startOfDayIn(new Date("2026-10-30T15:30:00Z"), "Asia/Manila").toISOString()).toBe(
      "2026-10-29T16:00:00.000Z",
    );
    // 17:00 UTC = 01:00 next day in Manila: a new day already.
    expect(startOfDayIn(new Date("2026-10-30T17:00:00Z"), "Asia/Manila").toISOString()).toBe(
      "2026-10-30T16:00:00.000Z",
    );
    // 03:00 UTC = 23:00 the day before in New York (EDT, -4).
    expect(startOfDayIn(new Date("2026-10-30T03:00:00Z"), "America/New_York").toISOString()).toBe(
      "2026-10-29T04:00:00.000Z",
    );
    expect(startOfDayIn(new Date("2026-10-30T15:30:00Z"), "UTC").toISOString()).toBe(
      "2026-10-30T00:00:00.000Z",
    );
  });

  it("handles a daylight-saving change during the day", () => {
    // New York falls back on 1 Nov 2026 at 02:00 EDT; midnight that day was still EDT (-4).
    expect(startOfDayIn(new Date("2026-11-01T18:00:00Z"), "America/New_York").toISOString()).toBe(
      "2026-11-01T04:00:00.000Z",
    );
  });

  it("only accepts real zones", () => {
    expect(validTimeZone("Asia/Manila")).toBe("Asia/Manila");
    expect(validTimeZone("Not/AZone")).toBe("UTC");
    expect(validTimeZone(undefined)).toBe("UTC");
  });
});
