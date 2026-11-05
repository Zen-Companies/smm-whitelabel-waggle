import { describe, expect, it } from "vitest";
import {
  INBOX_TABS,
  needsOwner,
  normalizeTab,
  todayLine,
  postTitle,
  responseTime,
  startOfTodayUtc,
} from "./inbox-data";

describe("inbox tabs (Waggle: For you / Answered / Ignored)", () => {
  it("For you holds everything that needs the owner", () => {
    expect(INBOX_TABS.map((t) => [t.label, t.statuses])).toEqual([
      ["For you", ["awaiting_approval", "escalated", "failed"]],
      ["Answered", ["sending", "sent"]],
      ["Ignored", ["ignored", "handled", "rejected"]],
    ]);
    expect(needsOwner("escalated")).toBe(true);
    expect(needsOwner("sent")).toBe(false);
  });

  it("old links land on the tab that now holds those items", () => {
    expect(normalizeTab("waiting")).toBe("for_you");
    expect(normalizeTab("needs")).toBe("for_you");
    expect(normalizeTab("sent")).toBe("answered");
    expect(normalizeTab("ignored")).toBe("ignored");
    expect(normalizeTab(undefined)).toBe("for_you");
    expect(normalizeTab("nope")).toBe("for_you");
  });
});

describe("card details", () => {
  it("ANSWERED · 6s: how long the customer waited", () => {
    const at = "2026-10-30T10:00:00Z";
    expect(responseTime(at, "2026-10-30T10:00:06Z")).toBe("6s");
    expect(responseTime(at, "2026-10-30T10:04:00Z")).toBe("4m");
    expect(responseTime(at, "2026-10-30T12:00:00Z")).toBe("2h");
    expect(responseTime(at, "2026-11-02T10:00:00Z")).toBe("3d");
  });

  it("a post's first line is its card title", () => {
    expect(postTitle("Fresh croissants!\nCome early.")).toBe("Fresh croissants!");
    expect(postTitle("")).toBe("Untitled post");
    expect(postTitle("x".repeat(80))).toHaveLength(58);
  });

  it("today starts at midnight UTC", () => {
    expect(startOfTodayUtc(new Date("2026-10-30T15:30:00Z")).toISOString()).toBe(
      "2026-10-30T00:00:00.000Z",
    );
  });
});

describe("todayLine (T40)", () => {
  it("mentions hidden spam only when there is some", () => {
    expect(todayLine({ answered: 12, ignored: 3, hidden: 0 })).toBe(
      "Today Waggle answered 12 and ignored 3.",
    );
    expect(todayLine({ answered: 12, ignored: 3, hidden: 1 })).toBe(
      "Today Waggle answered 12, ignored 3 and hid 1 spam comment.",
    );
    expect(todayLine({ answered: 12, ignored: 3, hidden: 2 })).toBe(
      "Today Waggle answered 12, ignored 3 and hid 2 spam comments.",
    );
  });
});
