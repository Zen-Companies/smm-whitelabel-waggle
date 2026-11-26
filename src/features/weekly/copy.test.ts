import { describe, expect, it } from "vitest";
import {
  answeredSplit,
  checkedLine,
  checkingLabel,
  couldntReadLine,
  firstRunLine,
  foundLine,
  isQuietWeek,
  justCheckedLine,
  quietLine,
  readingLine,
  usedTodayLine,
  vsLastWeek,
  waitingLine,
  weekRange,
} from "./copy";

const zone = "Asia/Manila";

describe("weekRange", () => {
  // Mon 23 Nov 00:00 → Mon 30 Nov 00:00 Manila.
  const from = new Date("2026-11-22T16:00:00Z");
  const to = new Date("2026-11-29T16:00:00Z");
  it("names the week's first and last day", () => {
    expect(weekRange(from, to, zone)).toBe("Mon 23 – Sun 29 Nov");
    expect(weekRange(from, to, zone, "short")).toBe("23–29 Nov");
  });
  it("names both months when the week crosses one", () => {
    const f = new Date("2026-11-29T16:00:00Z");
    const t = new Date("2026-12-06T16:00:00Z");
    expect(weekRange(f, t, zone)).toBe("Mon 30 Nov – Sun 6 Dec");
    expect(weekRange(f, t, zone, "short")).toBe("30 Nov – 6 Dec");
  });
});

describe("header and tiles", () => {
  it("says when it was checked and how many accounts", () => {
    expect(checkedLine(new Date("2026-11-29T23:00:00Z"), 6, zone)).toBe(
      "checked Mon 7:00 AM · 6 accounts",
    );
    expect(checkedLine(new Date("2026-11-30T01:14:00Z"), 1, zone)).toBe(
      "checked Mon 9:14 AM · 1 account",
    );
  });
  it("compares with last week", () => {
    expect(vsLastWeek(148, 136)).toBe("▲ 12 vs last week");
    expect(vsLastWeek(130, 136)).toBe("▼ 6 vs last week");
    expect(vsLastWeek(5, 5)).toBe("Same as last week");
    expect(vsLastWeek(5, null)).toBeNull();
  });
  it("splits the answers", () => {
    expect(answeredSplit(96, 35)).toBe("96 by Waggle · 35 by you");
  });
  it("warns about DMs closing today", () => {
    expect(waitingLine(3)).toBe("3 DMs close today");
    expect(waitingLine(1)).toBe("1 DM closes today");
    expect(waitingLine(0)).toBeNull();
  });
  it("says where the missed ones went", () => {
    expect(foundLine(8, 0)).toBe("now in your Inbox");
    expect(foundLine(0, 0)).toBe("nothing missed");
    expect(foundLine(2, 3)).toBe("now in your Inbox · 3 too old to answer");
  });
});

describe("quiet weeks", () => {
  const s = { cameIn: 4, waiting: 0, found: 0, gaps: [] as unknown[] };
  it("is quiet with a few messages, all answered, nothing to teach", () => {
    expect(isQuietWeek(s)).toBe(true);
    expect(isQuietWeek({ ...s, waiting: 1 })).toBe(false);
    expect(isQuietWeek({ ...s, gaps: [{}] })).toBe(false);
    expect(isQuietWeek({ ...s, cameIn: 40 })).toBe(false);
  });
  it("says it in one line", () => {
    expect(quietLine(4)).toBe("A quiet week: 4 messages, all answered.");
    expect(quietLine(1)).toBe("A quiet week: 1 message, answered.");
    expect(quietLine(0)).toBe("A quiet week: no messages came in.");
  });
});

describe("Check now", () => {
  it("shows progress", () => {
    expect(checkingLabel(3, 6)).toBe("Checking… 3 of 6 accounts");
    expect(checkingLabel(0, 1)).toBe("Checking… 0 of 1 account");
    expect(readingLine(["Instagram", "Facebook", "Gmail"])).toBe(
      "Reading Instagram, Facebook, Gmail…",
    );
    expect(readingLine([])).toBeNull();
  });
  it("says what it found", () => {
    expect(justCheckedLine(2)).toBe("Found 2 messages Waggle hadn't seen; they're in your Inbox.");
    expect(justCheckedLine(1)).toBe("Found 1 message Waggle hadn't seen; it's in your Inbox.");
    expect(justCheckedLine(0)).toBe("Waggle had every message. Nothing was missed.");
  });
  it("says when it can be used again", () => {
    expect(usedTodayLine(new Date("2026-11-30T01:14:00Z"), zone)).toBe(
      "Checked today at 9:14 AM. You can check again tomorrow.",
    );
  });
  it("names accounts it couldn't read", () => {
    expect(couldntReadLine(["TikTok"])).toBe(
      "Couldn't read TikTok this time (it needs reconnecting).",
    );
    expect(couldntReadLine(["TikTok", "Facebook"])).toBe(
      "Couldn't read TikTok and Facebook this time (they need reconnecting).",
    );
  });
  it("before the first check-up, says when it comes", () => {
    expect(firstRunLine(new Date("2026-11-29T23:00:00Z"), zone)).toBe(
      "Waggle checks your week every Monday at 7:00 AM. The first check-up is Mon 30 Nov.",
    );
  });
});
