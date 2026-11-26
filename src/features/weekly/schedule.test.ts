import { describe, expect, it } from "vitest";
import {
  businessZone,
  checkNowOpen,
  checkNowWindow,
  endOfLocalDay,
  localDayKey,
  mondayRun,
  nextMondayRun,
} from "./schedule";

const at = (iso: string) => new Date(iso);

describe("businessZone", () => {
  it("uses the stored zone when the runtime knows it", () => {
    expect(businessZone("Asia/Manila")).toBe("Asia/Manila");
  });
  it("falls back to US Eastern when none is stored or it is unknown", () => {
    expect(businessZone(null)).toBe("America/New_York");
    expect(businessZone("Not/AZone")).toBe("America/New_York");
  });
});

describe("mondayRun", () => {
  it("is due from 7:00 AM on Monday in the business's zone", () => {
    // Monday 30 Nov 2026, 07:00 in Manila = Sunday 29 Nov 23:00 UTC.
    const run = mondayRun(at("2026-11-29T23:00:00Z"), "Asia/Manila");
    expect(run.weekStart).toBe("2026-11-30");
    expect(run.due).toBe(true);
    // The week read is the full week before: Mon 23 Nov 00:00 → Mon 30 Nov 00:00, Manila.
    expect(run.from.toISOString()).toBe("2026-11-22T16:00:00.000Z");
    expect(run.to.toISOString()).toBe("2026-11-29T16:00:00.000Z");
  });

  it("is not due before 7:00 AM on Monday", () => {
    const run = mondayRun(at("2026-11-29T22:59:00Z"), "Asia/Manila");
    expect(run.weekStart).toBe("2026-11-30");
    expect(run.due).toBe(false);
  });

  it("is not due later in the week (a missed Monday isn't run on Wednesday)", () => {
    const run = mondayRun(at("2026-12-02T03:00:00Z"), "Asia/Manila");
    expect(run.weekStart).toBe("2026-11-30");
    expect(run.due).toBe(false);
  });

  it("stays due for the rest of Monday", () => {
    // Monday 30 Nov 23:30 New York = 1 Dec 04:30 UTC.
    const run = mondayRun(at("2026-12-01T04:30:00Z"), "America/New_York");
    expect(run.weekStart).toBe("2026-11-30");
    expect(run.due).toBe(true);
  });

  it("on a Sunday belongs to the Monday six days before", () => {
    const run = mondayRun(at("2026-11-29T15:00:00Z"), "America/New_York");
    expect(run.weekStart).toBe("2026-11-23");
    expect(run.due).toBe(false);
  });
});

describe("nextMondayRun", () => {
  it("is this Monday's 7:00 AM when it hasn't come yet", () => {
    expect(nextMondayRun(at("2026-11-29T22:00:00Z"), "Asia/Manila").toISOString()).toBe(
      "2026-11-29T23:00:00.000Z",
    );
  });
  it("is next week's once this one has passed", () => {
    expect(nextMondayRun(at("2026-11-26T03:00:00Z"), "Asia/Manila").toISOString()).toBe(
      "2026-11-29T23:00:00.000Z",
    );
    expect(nextMondayRun(at("2026-11-30T01:00:00Z"), "Asia/Manila").toISOString()).toBe(
      "2026-12-06T23:00:00.000Z",
    );
  });
});

describe("checkNowWindow", () => {
  it("is the last 7 days up to now", () => {
    const w = checkNowWindow(at("2026-11-26T10:00:00Z"));
    expect(w.from.toISOString()).toBe("2026-11-19T10:00:00.000Z");
    expect(w.to.toISOString()).toBe("2026-11-26T10:00:00.000Z");
  });
});

describe("checkNowOpen (once a day per business)", () => {
  const zone = "Asia/Manila";
  it("is open when the business never checked", () => {
    expect(checkNowOpen(null, at("2026-11-26T10:00:00Z"), zone)).toBe(true);
  });
  it("is closed for the rest of the business's day after a check", () => {
    // 9:14 AM and 11 PM Manila, same day.
    expect(checkNowOpen(at("2026-11-26T01:14:00Z"), at("2026-11-26T15:00:00Z"), zone)).toBe(false);
  });
  it("opens again at the business's midnight", () => {
    expect(checkNowOpen(at("2026-11-26T01:14:00Z"), at("2026-11-26T16:00:00Z"), zone)).toBe(true);
  });
});

describe("localDayKey", () => {
  it("is the calendar day in the zone", () => {
    expect(localDayKey(at("2026-11-26T16:30:00Z"), "Asia/Manila")).toBe("2026-11-27");
    expect(localDayKey(at("2026-11-26T16:30:00Z"), "America/New_York")).toBe("2026-11-26");
  });
});

describe("endOfLocalDay", () => {
  it("is the next midnight in the zone", () => {
    expect(endOfLocalDay(at("2026-11-26T10:00:00Z"), "Asia/Manila").toISOString()).toBe(
      "2026-11-26T16:00:00.000Z",
    );
  });
});
