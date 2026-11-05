import { describe, expect, it } from "vitest";
import { analyticsHref, parsePeriod, parsePlatform, parseSection, windowFor } from "./period";

describe("analytics controls", () => {
  it("parses section, period and platform with safe defaults", () => {
    expect(parseSection("posts")).toBe("posts");
    expect(parseSection("nope")).toBe("overview");
    expect(parsePeriod("7")).toBe(7);
    expect(parsePeriod("14")).toBe(30);
    expect(parsePeriod(undefined)).toBe(30);
    expect(parsePlatform("facebook", ["instagram", "facebook"])).toBe("facebook");
    // Only platforms the brand has connected.
    expect(parsePlatform("facebook", ["instagram"])).toBe("all");
  });

  it("builds links that keep the other controls", () => {
    const current = { section: "overview", period: 30, platform: "all" } as const;
    expect(analyticsHref(current, { period: 7 })).toBe(
      "/analytics?section=overview&period=7&platform=all",
    );
    expect(analyticsHref(current, { section: "posts", sort: "likes", type: undefined })).toBe(
      "/analytics?section=posts&period=30&platform=all&sort=likes",
    );
  });
});

describe("windowFor", () => {
  it("covers the period ending today and the one before", () => {
    const w = windowFor(7, new Date("2026-11-05T15:00:00Z"));
    expect(w.fromDate).toBe("2026-10-30");
    expect(w.toDate).toBe("2026-11-05");
    expect(w.from.toISOString()).toBe("2026-10-30T00:00:00.000Z");
    expect(w.to.toISOString()).toBe("2026-11-06T00:00:00.000Z");
    expect(w.prevFrom.toISOString()).toBe("2026-10-23T00:00:00.000Z");
    expect(w.prevTo).toEqual(w.from);
    expect(w.days).toHaveLength(7);
    expect(w.days[6]).toBe("2026-11-05");
  });
});
