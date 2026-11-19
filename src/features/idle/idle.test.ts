import { describe, expect, it } from "vitest";
import {
  accountName,
  DAY_MS,
  daysAway,
  decideIdle,
  disconnectDate,
  idleNoticeCopy,
  isFreeForIdle,
  joinAccounts,
  lastActiveAt,
  noticeOpen,
  type IdleState,
} from "./idle";

const now = new Date("2026-11-20T12:00:00Z");
const ago = (days: number) => new Date(now.getTime() - days * DAY_MS);
const fresh: IdleState = { warnedAt: null, warnedForActiveAt: null };
const base = { now, free: true, hasActiveAccounts: true, state: fresh };

describe("isFreeForIdle", () => {
  it("is Free with no bill or a bill that isn't live", () => {
    expect(isFreeForIdle({ billStatus: null, hasTestBrand: false })).toBe(true);
    expect(isFreeForIdle({ billStatus: "canceled", hasTestBrand: false })).toBe(true);
    expect(isFreeForIdle({ billStatus: "unpaid", hasTestBrand: false })).toBe(true);
    expect(isFreeForIdle({ billStatus: "incomplete_expired", hasTestBrand: false })).toBe(true);
  });
  it("never counts a paid plan (trialing, active, past due) as Free", () => {
    for (const s of ["trialing", "active", "past_due"]) {
      expect(isFreeForIdle({ billStatus: s, hasTestBrand: false })).toBe(false);
    }
  });
  it("exempts organizations with a test brand", () => {
    expect(isFreeForIdle({ billStatus: null, hasTestBrand: true })).toBe(false);
  });
});

describe("lastActiveAt", () => {
  it("takes the latest signal and skips missing ones", () => {
    expect(
      lastActiveAt([null, "2026-10-01T00:00:00Z", undefined, new Date("2026-10-05T00:00:00Z")]),
    ).toEqual(new Date("2026-10-05T00:00:00Z"));
  });
  it("is null with no signal at all", () => {
    expect(lastActiveAt([null, undefined, "not a date"])).toBeNull();
  });
});

describe("date math", () => {
  it("counts whole days away", () => {
    expect(daysAway(ago(23), now)).toBe(23);
    expect(daysAway(new Date(now.getTime() - 23 * DAY_MS + 1), now)).toBe(22);
    expect(daysAway(new Date(now.getTime() + DAY_MS), now)).toBe(0);
  });
  it("disconnects on day 30 when warned on day 23", () => {
    const last = ago(23);
    expect(disconnectDate(last, now)).toEqual(new Date(last.getTime() + 30 * DAY_MS));
    expect(disconnectDate(last, now)).toEqual(new Date(now.getTime() + 7 * DAY_MS));
  });
  it("gives a late warning its full 7 days", () => {
    expect(disconnectDate(ago(60), now)).toEqual(new Date(now.getTime() + 7 * DAY_MS));
  });
});

describe("decideIdle: the warning", () => {
  it("does nothing before day 23", () => {
    expect(decideIdle({ ...base, lastActive: ago(22) })).toEqual({ kind: "none" });
  });
  it("warns on day 23, for day 30", () => {
    expect(decideIdle({ ...base, lastActive: ago(23) })).toEqual({
      kind: "warn",
      days: 23,
      disconnectOn: new Date(now.getTime() + 7 * DAY_MS),
    });
  });
  it("warns (never disconnects) an organization first seen long after day 30", () => {
    expect(decideIdle({ ...base, lastActive: ago(90) })).toMatchObject({ kind: "warn", days: 90 });
  });
  it("never warns a paid organization or one with nothing connected", () => {
    expect(decideIdle({ ...base, free: false, lastActive: ago(40) })).toEqual({ kind: "none" });
    expect(decideIdle({ ...base, hasActiveAccounts: false, lastActive: ago(40) })).toEqual({
      kind: "none",
    });
  });
});

describe("decideIdle: once warned", () => {
  const last = ago(25);
  const warned: IdleState = { warnedAt: ago(2), warnedForActiveAt: last };

  it("doesn't warn twice in the same stretch", () => {
    expect(decideIdle({ ...base, lastActive: last, state: warned })).toEqual({ kind: "none" });
  });
  it("disconnects on day 30", () => {
    const at30 = ago(30);
    const state: IdleState = { warnedAt: ago(7), warnedForActiveAt: at30 };
    expect(decideIdle({ ...base, lastActive: at30, state })).toEqual({
      kind: "disconnect",
      days: 30,
    });
  });
  it("waits a full 7 days after a late warning", () => {
    const old = ago(60);
    const state: IdleState = { warnedAt: ago(6), warnedForActiveAt: old };
    expect(decideIdle({ ...base, lastActive: old, state })).toEqual({ kind: "none" });
    const state7: IdleState = { warnedAt: ago(7), warnedForActiveAt: old };
    expect(decideIdle({ ...base, lastActive: old, state: state7 })).toMatchObject({
      kind: "disconnect",
    });
  });
  it("never disconnects without a warning first", () => {
    expect(decideIdle({ ...base, lastActive: ago(45), state: fresh }).kind).toBe("warn");
  });
});

describe("decideIdle: coming back resets", () => {
  const warned: IdleState = { warnedAt: ago(3), warnedForActiveAt: ago(26) };

  it("clears the warning when anyone signs in", () => {
    expect(decideIdle({ ...base, lastActive: ago(1), state: warned })).toEqual({ kind: "clear" });
  });
  it("clears it on day 30 too: the sign-in wins", () => {
    const state: IdleState = { warnedAt: ago(7), warnedForActiveAt: ago(30) };
    expect(decideIdle({ ...base, lastActive: ago(0), state })).toEqual({ kind: "clear" });
  });
  it("starts a new stretch: a later 23 days warns again", () => {
    const old: IdleState = { warnedAt: ago(40), warnedForActiveAt: ago(63) };
    expect(decideIdle({ ...base, lastActive: ago(23), state: old })).toMatchObject({
      kind: "warn",
      days: 23,
    });
  });
  it("clears it when the organization picks a plan", () => {
    expect(decideIdle({ ...base, free: false, lastActive: ago(29), state: warned })).toEqual({
      kind: "clear",
    });
  });
});

describe("account names", () => {
  it("uses the handle, else the platform", () => {
    expect(accountName({ platformLabel: "Instagram", username: "harbourbean" })).toBe(
      "@harbourbean",
    );
    expect(accountName({ platformLabel: "Instagram", username: "@harbourbean" })).toBe(
      "@harbourbean",
    );
    expect(accountName({ platformLabel: "Facebook", username: null })).toBe(
      "your Facebook account",
    );
  });
  it("joins several", () => {
    expect(
      joinAccounts([
        { platformLabel: "Instagram", username: "a" },
        { platformLabel: "TikTok", username: "b" },
        { platformLabel: "Facebook", username: null },
      ]),
    ).toBe("@a, @b and your Facebook account");
  });
});

describe("the note on Today", () => {
  it("says what was disconnected", () => {
    expect(idleNoticeCopy([{ platformLabel: "Instagram", username: "harbourbean" }])).toEqual({
      title: "We disconnected @harbourbean while you were away",
      body: "Free accounts disconnect after 30 days without a sign-in. Everything Waggle learned is still here.",
    });
  });
  it("shows until dismissed, and again after a later disconnect", () => {
    expect(noticeOpen({ disconnectedAt: null, dismissedAt: null })).toBe(false);
    expect(noticeOpen({ disconnectedAt: "2026-11-01T00:00:00Z", dismissedAt: null })).toBe(true);
    expect(
      noticeOpen({ disconnectedAt: "2026-11-01T00:00:00Z", dismissedAt: "2026-11-02T00:00:00Z" }),
    ).toBe(false);
    expect(
      noticeOpen({ disconnectedAt: "2026-12-05T00:00:00Z", dismissedAt: "2026-11-02T00:00:00Z" }),
    ).toBe(true);
  });
});
