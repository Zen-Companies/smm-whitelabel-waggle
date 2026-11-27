import { describe, expect, it } from "vitest";
import {
  endsLabel,
  nextLine,
  nextSlotAfter,
  planNext,
  previewSlots,
  repeatChoiceProblem,
  repeatLabel,
  ruleFromFirst,
  repeatHeldLine,
  repeatInfo,
  ruleOfRow,
  slotsAfter,
  type RepeatRule,
} from "./repeat-rule";

const NY = "America/New_York";
const iso = (d: Date) => d.toISOString();

// Fri 27 Nov 2026, 9:00 AM in New York (EST, -5).
const FIRST = new Date("2026-11-27T14:00:00Z");

describe("a repeat's rule", () => {
  it("takes the weekday, day of month and time from the first post", () => {
    expect(ruleFromFirst({ every: "week", ends: "never" }, FIRST, NY)).toEqual({
      every: "week",
      weekday: 5,
      monthDay: null,
      time: "09:00",
      timeZone: NY,
      ends: "never",
      endDate: null,
      maxCount: null,
    });
    const monthly = ruleFromFirst({ every: "month", ends: "after", count: 6 }, FIRST, NY);
    expect(monthly).toMatchObject({ monthDay: 27, weekday: null, maxCount: 6, endDate: null });
  });

  it("reads the stored row", () => {
    expect(
      ruleOfRow({
        every: "day",
        weekday: null,
        month_day: null,
        at_time: "07:30",
        time_zone: "Asia/Manila",
        ends: "on",
        end_date: "2026-12-31",
        max_count: null,
      }),
    ).toMatchObject({ every: "day", time: "07:30", ends: "on", endDate: "2026-12-31" });
  });

  it("checks the end the owner picked", () => {
    expect(repeatChoiceProblem({ every: "week", ends: "never" }, FIRST, NY)).toBeNull();
    expect(repeatChoiceProblem({ every: "week", ends: "on", endDate: null }, FIRST, NY)).toBe(
      "Pick the last day.",
    );
    expect(
      repeatChoiceProblem({ every: "week", ends: "on", endDate: "2026-11-20" }, FIRST, NY),
    ).toBe("The last day can't be before the first post.");
    expect(repeatChoiceProblem({ every: "week", ends: "after", count: 1 }, FIRST, NY)).toMatch(
      /from 2 to/,
    );
    expect(repeatChoiceProblem({ every: "week", ends: "after", count: 4 }, FIRST, NY)).toBeNull();
  });
});

describe("the next times", () => {
  const weekly = ruleFromFirst({ every: "week", ends: "never" }, FIRST, NY);

  it("goes weekly on the same weekday and time", () => {
    expect(iso(nextSlotAfter(weekly, FIRST))).toBe("2026-12-04T14:00:00.000Z");
    // From the middle of the week, the coming Friday.
    expect(iso(nextSlotAfter(weekly, new Date("2026-12-01T10:00:00Z")))).toBe(
      "2026-12-04T14:00:00.000Z",
    );
  });

  it("keeps 9:00 local across a daylight-saving change", () => {
    // Fri 30 Oct 2026 9:00 EDT (-4) → New York falls back on 1 Nov → Fri 6 Nov 9:00 EST (-5).
    const before = new Date("2026-10-30T13:00:00Z");
    const rule = ruleFromFirst({ every: "week", ends: "never" }, before, NY);
    expect(rule.time).toBe("09:00");
    expect(iso(nextSlotAfter(rule, before))).toBe("2026-11-06T14:00:00.000Z");
    // Daily over the spring change (8 Mar 2026): 9:00 EST (-5) then 9:00 EDT (-4).
    const daily = ruleFromFirst(
      { every: "day", ends: "never" },
      new Date("2026-03-07T14:00:00Z"),
      NY,
    );
    expect(iso(nextSlotAfter(daily, new Date("2026-03-07T14:00:00Z")))).toBe(
      "2026-03-08T13:00:00.000Z",
    );
  });

  it("goes daily", () => {
    const daily = ruleFromFirst({ every: "day", ends: "never" }, FIRST, NY);
    expect(iso(nextSlotAfter(daily, FIRST))).toBe("2026-11-28T14:00:00.000Z");
  });

  it("goes monthly, on the month's last day when it's shorter", () => {
    const jan31 = new Date("2027-01-31T14:00:00Z");
    const rule = ruleFromFirst({ every: "month", ends: "never" }, jan31, NY);
    const feb = nextSlotAfter(rule, jan31);
    expect(iso(feb)).toBe("2027-02-28T14:00:00.000Z");
    // And back to the 31st when the month has one.
    expect(iso(nextSlotAfter(rule, feb))).toBe("2027-03-31T13:00:00.000Z");
  });

  it("uses the rule's own zone, not the server's", () => {
    // Manila 7:00 AM = 23:00 UTC the day before.
    const first = new Date("2026-11-26T23:00:00Z");
    const rule = ruleFromFirst({ every: "week", ends: "never" }, first, "Asia/Manila");
    expect(rule).toMatchObject({ weekday: 5, time: "07:00" });
    expect(iso(nextSlotAfter(rule, first))).toBe("2026-12-03T23:00:00.000Z");
  });
});

describe("the job's next step", () => {
  const base = { madeCount: 1, minAheadMs: 10 * 60_000 };

  it("makes the next post after the last slot", () => {
    const rule = ruleFromFirst({ every: "week", ends: "never" }, FIRST, NY);
    const step = planNext(rule, {
      ...base,
      lastSlot: FIRST,
      now: new Date("2026-11-27T14:05:00Z"),
    });
    expect(step).toEqual({ kind: "make", slot: new Date("2026-12-04T14:00:00Z") });
  });

  it("skips times already missed instead of posting late", () => {
    const rule = ruleFromFirst({ every: "day", ends: "never" }, FIRST, NY);
    const step = planNext(rule, {
      ...base,
      lastSlot: FIRST,
      now: new Date("2026-11-30T15:00:00Z"),
    });
    expect(step).toEqual({ kind: "make", slot: new Date("2026-12-01T14:00:00Z") });
    // Too close to now: the one after.
    const close = planNext(rule, {
      ...base,
      lastSlot: FIRST,
      now: new Date("2026-11-28T13:55:00Z"),
    });
    expect(close).toEqual({ kind: "make", slot: new Date("2026-11-29T14:00:00Z") });
  });

  it("finishes after N times", () => {
    const rule = ruleFromFirst({ every: "week", ends: "after", count: 3 }, FIRST, NY);
    const now = new Date("2026-11-27T14:05:00Z");
    expect(planNext(rule, { ...base, lastSlot: FIRST, madeCount: 2, now }).kind).toBe("make");
    expect(planNext(rule, { ...base, lastSlot: FIRST, madeCount: 3, now })).toEqual({
      kind: "finished",
    });
  });

  it("finishes after the last day, which still counts", () => {
    const rule = ruleFromFirst({ every: "week", ends: "on", endDate: "2026-12-04" }, FIRST, NY);
    const now = new Date("2026-11-27T14:05:00Z");
    expect(planNext(rule, { ...base, lastSlot: FIRST, now })).toEqual({
      kind: "make",
      slot: new Date("2026-12-04T14:00:00Z"),
    });
    expect(
      planNext(rule, { ...base, lastSlot: new Date("2026-12-04T14:00:00Z"), madeCount: 2, now }),
    ).toEqual({ kind: "finished" });
  });

  it("follows the rule after one post was moved on its own", () => {
    // The last slot is the rule's (Fri), even if that post was moved to Sat.
    const rule = ruleFromFirst({ every: "week", ends: "never" }, FIRST, NY);
    const step = planNext(rule, {
      ...base,
      lastSlot: FIRST,
      now: new Date("2026-11-28T16:00:00Z"),
    });
    expect(step).toEqual({ kind: "make", slot: new Date("2026-12-04T14:00:00Z") });
  });
});

describe("the composer's preview", () => {
  it("shows the first three times, then …", () => {
    const rule = ruleFromFirst({ every: "week", ends: "never" }, FIRST, NY);
    const { slots, more } = previewSlots(rule, FIRST);
    expect(slots.map(iso)).toEqual([
      "2026-11-27T14:00:00.000Z",
      "2026-12-04T14:00:00.000Z",
      "2026-12-11T14:00:00.000Z",
    ]);
    expect(more).toBe(true);
    expect(nextLine(slots, more, NY)).toBe("Next: Fri 27 Nov · Fri 4 Dec · Fri 11 Dec…");
  });

  it("stops at the end", () => {
    const twice = ruleFromFirst({ every: "week", ends: "after", count: 2 }, FIRST, NY);
    const two = previewSlots(twice, FIRST);
    expect(two.slots).toHaveLength(2);
    expect(two.more).toBe(false);
    expect(nextLine(two.slots, two.more, NY)).toBe("Next: Fri 27 Nov · Fri 4 Dec");
    const three = previewSlots(
      ruleFromFirst({ every: "week", ends: "after", count: 3 }, FIRST, NY),
      FIRST,
    );
    expect(three.more).toBe(false);
    const dated = ruleFromFirst({ every: "day", ends: "on", endDate: "2026-11-28" }, FIRST, NY);
    expect(previewSlots(dated, FIRST).slots).toHaveLength(2);
  });
});

describe("labels", () => {
  const rule = (r: Partial<RepeatRule>): RepeatRule => ({
    every: "week",
    weekday: 5,
    monthDay: null,
    time: "09:00",
    timeZone: NY,
    ends: "never",
    endDate: null,
    maxCount: null,
    ...r,
  });

  it("says how it repeats", () => {
    expect(repeatLabel(rule({}))).toBe("Every week on Friday at 9:00 AM");
    expect(repeatLabel(rule({ every: "day", time: "18:30" }))).toBe("Every day at 6:30 PM");
    expect(repeatLabel(rule({ every: "month", monthDay: 1 }))).toBe(
      "Every month on the 1st at 9:00 AM",
    );
    expect(repeatLabel(rule({ every: "month", monthDay: 22 }))).toBe(
      "Every month on the 22nd at 9:00 AM",
    );
    expect(repeatLabel(rule({ every: "month", monthDay: 12 }))).toBe(
      "Every month on the 12th at 9:00 AM",
    );
    expect(repeatLabel(rule({ every: "month", monthDay: 31 }))).toBe(
      "Every month on the 31st (or the month's last day) at 9:00 AM",
    );
  });

  it("says when it ends", () => {
    expect(endsLabel(rule({}))).toBe("Until I stop it");
    expect(endsLabel(rule({ ends: "on", endDate: "2026-12-19" }))).toBe("Until Sat 19 Dec");
    expect(endsLabel(rule({ ends: "after", maxCount: 6 }))).toBe("6 times in all");
  });
});

describe("the post panel's next times", () => {
  it("lists the times after the latest post, within the end", () => {
    const rule = ruleFromFirst({ every: "week", ends: "after", count: 3 }, FIRST, NY);
    const after = slotsAfter(rule, FIRST, 1);
    expect(after.slots.map(iso)).toEqual(["2026-12-04T14:00:00.000Z", "2026-12-11T14:00:00.000Z"]);
    expect(after.more).toBe(false);
    expect(slotsAfter(rule, FIRST, 3).slots).toEqual([]);
    const open = slotsAfter(ruleFromFirst({ every: "day", ends: "never" }, FIRST, NY), FIRST, 1);
    expect(open.more).toBe(true);
  });
});

describe("the post panel's repeat block", () => {
  const row = {
    id: "r1",
    every: "week",
    weekday: 5,
    month_day: null,
    at_time: "09:00",
    time_zone: NY,
    ends: "never",
    end_date: null,
    max_count: null,
    made_count: 1,
    last_post_id: "p1",
    last_slot: "2026-11-27T14:00:00Z",
    last_error: null,
    stopped_at: null,
    finished_at: null,
  };

  it("shows the next times on the latest post only", () => {
    expect(repeatInfo(row, "p1", NY)).toEqual({
      id: "r1",
      label: "Every week on Friday at 9:00 AM",
      ends: "Until I stop it",
      then: "Then: Fri 4 Dec · Fri 11 Dec…",
      state: "live",
      made: 1,
      held: null,
    });
    expect(repeatInfo(row, "older", NY).then).toBeNull();
  });

  it("says when it stopped, finished or is waiting", () => {
    expect(repeatInfo({ ...row, stopped_at: "2026-11-28T00:00:00Z" }, "p1", NY).state).toBe(
      "stopped",
    );
    expect(repeatInfo({ ...row, finished_at: "2026-11-28T00:00:00Z" }, "p1", NY).state).toBe(
      "finished",
    );
    expect(repeatInfo({ ...row, last_error: "account_disconnected" }, "p1", NY).held).toMatch(
      /Reconnect/,
    );
    expect(repeatHeldLine(null)).toBeNull();
    expect(repeatHeldLine("save_failed")).toMatch(/tries again/);
  });
});
