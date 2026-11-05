import { describe, expect, it } from "vitest";
import {
  compact,
  duration,
  formatName,
  full,
  gainedDelta,
  median,
  percent,
  percentDelta,
  pointsDelta,
  shortDate,
  timeSaved,
} from "./format";

describe("number formatting", () => {
  it("prints full numbers up to 9,999 and compact ones above", () => {
    expect(compact(312)).toBe("312");
    expect(compact(4048)).toBe("4,048");
    expect(compact(18_400)).toBe("18.4K");
    expect(compact(1_240_000)).toBe("1.2M");
    expect(full(6204.4)).toBe("6,204");
    expect(percent(4.6)).toBe("4.6%");
    expect(percent(10)).toBe("10%");
  });

  it("names formats and dates", () => {
    expect(formatName("reel")).toBe("Reel");
    expect(formatName("igtv")).toBe("Igtv");
    expect(shortDate("2026-10-26")).toBe("Oct 26");
    expect(shortDate("2026-10-26T23:30:00Z")).toBe("Oct 26");
  });
});

describe("changes vs the previous period", () => {
  it("percent changes carry an arrow and words", () => {
    expect(percentDelta(112, 100)).toEqual({ direction: "up", text: "▲ 12%" });
    expect(percentDelta(92, 100)).toEqual({ direction: "down", text: "▼ 8%" });
    expect(percentDelta(100, 100)).toEqual({ direction: "flat", text: "No change" });
  });

  it("has nothing to say without a previous number", () => {
    expect(percentDelta(10, null)).toBeNull();
    expect(percentDelta(10, 0)).toBeNull();
    expect(pointsDelta(4.6, undefined)).toBeNull();
  });

  it("rates change in points", () => {
    expect(pointsDelta(4.6, 4.9)).toEqual({ direction: "down", text: "▼ 0.3 points" });
    expect(pointsDelta(5, 4)).toEqual({ direction: "up", text: "▲ 1 point" });
    expect(pointsDelta(4.61, 4.6)).toEqual({ direction: "flat", text: "No change" });
  });

  it("followers gained or lost", () => {
    expect(gainedDelta(114)).toEqual({ direction: "up", text: "▲ 114 new" });
    expect(gainedDelta(-3)).toEqual({ direction: "down", text: "▼ 3 fewer" });
    expect(gainedDelta(0).direction).toBe("flat");
  });
});

describe("median", () => {
  it("handles odd, even and empty lists", () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

describe("durations", () => {
  it("prints short waits", () => {
    expect(duration(6)).toBe("6 s");
    expect(duration(240)).toBe("4 min");
    expect(duration(7800)).toBe("2 h 10 min");
    expect(duration(7200)).toBe("2 h");
    expect(duration(3 * 86_400)).toBe("3 d");
  });

  it("time saved at 2 minutes a reply", () => {
    expect(timeSaved(20)).toBe("40 min");
    expect(timeSaved(45)).toBe("1 h 30 min");
    expect(timeSaved(243)).toBe("8 h");
  });
});
