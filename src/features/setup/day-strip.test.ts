import { describe, expect, it } from "vitest";
import { dayStrip, dayTip, marksScale, stripTicks } from "./day-strip";

const now = new Date("2026-11-21T10:00:00Z");

describe("dayStrip", () => {
  it("puts each message on its day, today last", () => {
    const days = dayStrip(
      [
        { kind: "dm", receivedAt: "2026-11-21T08:00:00Z", noReply: true },
        { kind: "comment", receivedAt: "2026-11-21T01:00:00Z", noReply: false },
        { kind: "dm", receivedAt: "2026-11-20T23:00:00Z", noReply: false },
        { kind: "comment", receivedAt: "2026-10-23T12:00:00Z", noReply: true },
      ],
      now,
    );
    expect(days).toHaveLength(30);
    expect(days[29]).toEqual({ dms: 1, comments: 1, noReply: 1 });
    expect(days[28]).toEqual({ dms: 1, comments: 0, noReply: 0 });
    expect(days[0]).toEqual({ dms: 0, comments: 1, noReply: 1 });
  });
  it("leaves out anything older than 30 days or unreadable", () => {
    const days = dayStrip(
      [
        { kind: "dm", receivedAt: "2026-10-01T00:00:00Z", noReply: true },
        { kind: "dm", receivedAt: "nope", noReply: true },
      ],
      now,
    );
    expect(days.every((d) => d.dms + d.comments === 0)).toBe(true);
  });
});

describe("marksScale", () => {
  it("is 1 until the busiest day overflows, then groups messages per mark", () => {
    const quiet = dayStrip(
      [{ kind: "dm", receivedAt: "2026-11-21T08:00:00Z", noReply: false }],
      now,
    );
    expect(marksScale(quiet, 8)).toBe(1);
    const busy = dayStrip(
      Array.from({ length: 20 }, () => ({
        kind: "dm",
        receivedAt: "2026-11-21T08:00:00Z",
        noReply: false,
      })),
      now,
    );
    expect(marksScale(busy, 8)).toBe(3);
  });
});

describe("stripTicks", () => {
  it("labels a day every week back from today", () => {
    expect(stripTicks(new Date("2026-11-21T10:00:00Z"))).toEqual([
      { index: 1, label: "24 Oct" },
      { index: 8, label: "31 Oct" },
      { index: 15, label: "7 Nov" },
      { index: 22, label: "14 Nov" },
      { index: 29, label: "today" },
    ]);
  });
});

describe("dayTip", () => {
  const at = new Date("2026-11-21T10:00:00Z");
  it("says the day and what came in", () => {
    expect(dayTip({ dms: 2, comments: 0, noReply: 1 }, 5, at)).toBe(
      "Wed 28 Oct · 2 DMs · 1 no reply",
    );
    expect(dayTip({ dms: 1, comments: 3, noReply: 0 }, 29, at)).toBe("Today · 1 DM · 3 comments");
    expect(dayTip({ dms: 0, comments: 0, noReply: 0 }, 0, at)).toBe("Fri 23 Oct · nothing came in");
  });
});
