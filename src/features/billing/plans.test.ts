import { describe, expect, it } from "vitest";
import {
  accountAllowance,
  canConnectAnother,
  EXTRAS,
  FOUNDING,
  monthlyPrice,
  PLANS,
  PROMOTED_PLAN,
  replyAllowance,
  TRIAL,
  trialEndsAt,
} from "./plans";
import { limitEmailDue, NEVER_DARK, replyLimit, replyLimitNote } from "./reply-limit";

describe("plans match the Pricing Bible (16 Nov 2026)", () => {
  it("prices, accounts and replies", () => {
    expect(PLANS.solo).toMatchObject({ monthlyUsd: 49, yearlyUsd: 490, accounts: 3, replies: 200 });
    expect(PLANS.business).toMatchObject({
      monthlyUsd: 99,
      yearlyUsd: 990,
      accounts: 4,
      replies: 750,
    });
    expect(PLANS.team).toMatchObject({
      monthlyUsd: 199,
      accounts: 10,
      replies: 1500,
      forSale: false,
    });
    expect(PROMOTED_PLAN).toBe("business");
  });

  it("what each plan includes", () => {
    expect(PLANS.solo.features).toMatchObject({ autoReply: false, leadsFlagged: false });
    expect(PLANS.business.features).toMatchObject({
      autoReply: true,
      leadsFlagged: true,
      followUps: "soon",
      team: false,
    });
    expect(PLANS.team.features.team).toBe("soon");
  });

  it("trial, extras and the founding offer", () => {
    expect(TRIAL).toEqual({ days: 7, cardRequired: true });
    expect(trialEndsAt(new Date("2026-11-18T10:00:00Z")).toISOString()).toBe(
      "2026-11-25T10:00:00.000Z",
    );
    expect(EXTRAS.accountUsd).toBe(10);
    expect(EXTRAS.topUp).toMatchObject({ usd: 15, replies: 200 });
    expect(EXTRAS.autoTopUp.maxPerMonth).toBe(2);
    expect(FOUNDING).toMatchObject({ plan: "business", monthlyUsd: 79, months: 6, spots: 50 });
  });

  it("monthly price: founding for 6 months, then $99; yearly as its monthly share", () => {
    const since = new Date("2026-11-20T00:00:00Z");
    expect(
      monthlyPrice("business", { founding: { since, now: new Date("2027-05-19T00:00:00Z") } }),
    ).toBe(79);
    expect(
      monthlyPrice("business", { founding: { since, now: new Date("2027-05-20T00:00:00Z") } }),
    ).toBe(99);
    expect(monthlyPrice("solo", { founding: { since, now: since } })).toBe(49);
    expect(monthlyPrice("solo", { yearly: true })).toBe(40.83);
    expect(monthlyPrice("business", { yearly: true })).toBe(82.5);
    expect(monthlyPrice("team", { yearly: true })).toBe(199);
  });

  it("accounts and replies with extras", () => {
    expect(accountAllowance("solo")).toBe(3);
    expect(accountAllowance("business", 2)).toBe(6);
    expect(canConnectAnother(3, accountAllowance("solo"))).toBe(false);
    expect(canConnectAnother(2, 3)).toBe(true);
    expect(replyAllowance("solo")).toBe(200);
    expect(replyAllowance("solo", { thisMonth: 1, carriedReplies: 50 })).toBe(450);
  });
});

describe("the AI reply limit", () => {
  const now = new Date("2026-11-18T12:00:00Z");

  it("80% warns, 100% pauses drafting", () => {
    expect(replyLimit(159, 200, now).level).toBe("ok");
    expect(replyLimit(160, 200, now).level).toBe("warn");
    expect(replyLimit(200, 200, now)).toMatchObject({ level: "reached", left: 0 });
    expect(replyLimit(10, 200, now).resetsAt.toISOString()).toBe("2026-12-01T00:00:00.000Z");
  });

  it("says it in the Bible's words", () => {
    expect(replyLimitNote(replyLimit(10, 200, now), "solo")).toBeNull();
    expect(replyLimitNote(replyLimit(160, 200, now), "solo")).toEqual({
      title: "You've used 160 of 200 replies.",
      body: "Resets on December 1.",
      offers: [],
    });
    const solo = replyLimitNote(replyLimit(200, 200, now), "solo")!;
    expect(solo.body).toContain(NEVER_DARK);
    expect(solo.offers).toEqual(["+200 replies for $15", "Upgrade to Business"]);
    expect(replyLimitNote(replyLimit(750, 750, now), "business")!.offers).toEqual([
      "+200 replies for $15",
    ]);
  });

  it("sends each email once a month", () => {
    const warn = replyLimit(160, 200, now);
    expect(limitEmailDue(warn, { warn: false, reached: false })).toBe("warn");
    expect(limitEmailDue(warn, { warn: true, reached: false })).toBeNull();
    expect(limitEmailDue(replyLimit(200, 200, now), { warn: true, reached: false })).toBe(
      "reached",
    );
  });
});
