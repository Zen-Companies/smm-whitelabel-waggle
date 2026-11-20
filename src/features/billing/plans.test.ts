import { describe, expect, it } from "vitest";
import {
  accountAllowance,
  applyPlanSettings,
  canAddBrand,
  canConnectAnother,
  checkoutTrialDays,
  dailyAmount,
  EXTRAS,
  FOUNDING,
  monthlyPrice,
  parsePlanSettings,
  planBullets,
  parseBrandsLimit,
  perDay,
  PLANS,
  PROMOTED_PLAN,
  replyAllowance,
  TRIAL,
  trialEndsAt,
} from "./plans";
import { limitEmailDue, NEVER_DARK, replyLimit, replyLimitNote } from "./reply-limit";

describe("the first paid plan starts with 7 days free (20 Nov)", () => {
  it("only for an organization that never had a subscription or a trial", () => {
    expect(checkoutTrialDays(null)).toBe(7);
    expect(checkoutTrialDays({ trial_ends_at: null, stripe_subscription_id: null })).toBe(7);
    expect(checkoutTrialDays({ trial_ends_at: null, stripe_subscription_id: "sub_1" })).toBeNull();
    expect(
      checkoutTrialDays({ trial_ends_at: "2026-11-01T00:00:00Z", stripe_subscription_id: null }),
    ).toBeNull();
  });
});

describe("price a day (Walter, 20 Nov)", () => {
  it("a month is a twelfth of a year: price × 12 ÷ 365", () => {
    expect(perDay(PLANS.solo.monthlyUsd)).toBe("about $1.61 a day");
    expect(perDay(PLANS.business.monthlyUsd)).toBe("about $3.25 a day");
    expect(perDay(FOUNDING.monthlyUsd)).toBe("about $2.60 a day");
  });

  it("a yearly price is ÷ 365", () => {
    expect(perDay(490, "year")).toBe("about $1.34 a day");
    expect(perDay(990, "year")).toBe("about $2.71 a day");
  });

  it("the figure alone, for the banner and pills", () => {
    expect(dailyAmount(49)).toBe("$1.61");
    expect(dailyAmount(99)).toBe("$3.25");
  });
});

describe("plans match the Pricing Bible (Free plan, 19 Nov 2026)", () => {
  it("prices, accounts and replies", () => {
    expect(PLANS.free).toMatchObject({
      monthlyUsd: 0,
      yearlyUsd: null,
      accounts: 1,
      brands: 1,
      replies: 100,
      forSale: true,
    });
    expect(PLANS.solo).toMatchObject({ monthlyUsd: 49, yearlyUsd: 490, accounts: 3, replies: 300 });
    expect(PLANS.business).toMatchObject({
      monthlyUsd: 99,
      yearlyUsd: 990,
      accounts: 6,
      replies: 750,
    });
    // Business is by call only (19 Nov): off sale, anyone already on $199 keeps it.
    expect(PLANS.team).toMatchObject({
      monthlyUsd: 199,
      yearlyUsd: null,
      accounts: 10,
      replies: 1500,
      forSale: false,
    });
    // Shown names (Jason, 17 Nov): $99 is Team, $199 is Business; the ids stay.
    expect([PLANS.solo.name, PLANS.business.name, PLANS.team.name]).toEqual([
      "Solo",
      "Team",
      "Business",
    ]);
    expect(PROMOTED_PLAN).toBe("solo");
  });

  it("what each plan includes", () => {
    // Free: "Ask me first" only; auto-reply is the main reason to move up to Solo.
    expect(PLANS.free.features).toEqual({
      autoReply: false,
      leadsFlagged: false,
      followUps: false,
      team: false,
    });
    expect(PLANS.solo.features).toMatchObject({ autoReply: true, leadsFlagged: false });
    expect(PLANS.business.features).toMatchObject({
      autoReply: true,
      leadsFlagged: true,
      followUps: true,
      team: true,
    });
    expect(PLANS.solo.features.team).toBe(false);
    expect(PLANS.team.features.team).toBe(true);
  });

  it("trial, extras and the founding offer", () => {
    // The trial is back, with a card (Febron, 20 Nov).
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
    expect(accountAllowance(PLANS.solo)).toBe(3);
    expect(accountAllowance(PLANS.business, 2)).toBe(8);
    expect(canConnectAnother(3, accountAllowance(PLANS.solo))).toBe(false);
    expect(canConnectAnother(2, 3)).toBe(true);
    expect(replyAllowance(PLANS.solo)).toBe(300);
    expect(replyAllowance(PLANS.solo, { thisMonth: 1, carriedReplies: 50 })).toBe(550);
    expect(accountAllowance(PLANS.free)).toBe(1);
    expect(canConnectAnother(1, accountAllowance(PLANS.free))).toBe(false);
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
    expect(NEVER_DARK).toContain("never go dark");
    expect(solo.body).toBe(
      "Waggle has stopped writing replies until December 1. New messages still arrive in your Inbox, and you can answer them yourself. Posting keeps working too.",
    );
    expect(solo.offers).toEqual(["+200 replies for $15", "Upgrade to Team"]);
    expect(replyLimitNote(replyLimit(750, 750, now), "business")!.offers).toEqual([
      "+200 replies for $15",
    ]);
  });

  it("on Free, only ever offers Solo (no add-ons)", () => {
    const warn = replyLimitNote(replyLimit(80, 100, now), "free")!;
    expect(warn.body).toContain("To get more replies this month, upgrade to Solo or above.");
    const reached = replyLimitNote(replyLimit(100, 100, now), "free")!;
    expect(reached.offers).toEqual(["Upgrade to Solo"]);
    expect(reached.body).toContain("upgrade to Solo or above");
    expect(reached.body).not.toContain("$15");
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

describe("brands per plan (Staff → Plans)", () => {
  it("reads the field", () => {
    expect(parseBrandsLimit("")).toEqual({ limit: null });
    expect(parseBrandsLimit(" 3 ")).toEqual({ limit: 3 });
    expect(parseBrandsLimit("0")).toHaveProperty("error");
    expect(parseBrandsLimit("2.5")).toHaveProperty("error");
    expect(parseBrandsLimit("101")).toHaveProperty("error");
  });

  it("checks room for one more", () => {
    expect(canAddBrand(5, null)).toBe(true);
    expect(canAddBrand(0, 1)).toBe(true);
    expect(canAddBrand(1, 1)).toBe(false);
  });
});

describe("plan settings (Staff → Plans, 18 Nov)", () => {
  it("Solo is one business and just you; Business and Team unlimited", () => {
    expect(PLANS.solo).toMatchObject({ brands: 1, features: { team: false, followUps: false } });
    expect(PLANS.business).toMatchObject({
      brands: null,
      features: { team: true, followUps: true },
    });
    expect(PLANS.team.brands).toBeNull();
  });

  it("staff settings override the defaults; null keeps them", () => {
    const plans = applyPlanSettings([
      {
        plan: "solo",
        brands_limit: 2,
        accounts: 4,
        replies: null,
        team: null,
        auto_reply: true,
        leads_flagged: null,
        follow_ups: null,
        for_sale: null,
      },
      {
        plan: "business",
        brands_limit: null,
        accounts: null,
        replies: 900,
        team: null,
        auto_reply: null,
        leads_flagged: null,
        follow_ups: false,
        for_sale: null,
      },
      {
        plan: "gold",
        brands_limit: 1,
        accounts: 1,
        replies: 1,
        team: true,
        auto_reply: true,
        leads_flagged: true,
        follow_ups: true,
        for_sale: true,
      },
    ]);
    expect(plans.solo).toMatchObject({
      brands: 2,
      accounts: 4,
      replies: 300,
      features: { autoReply: true, team: false },
    });
    expect(plans.business).toMatchObject({
      brands: null,
      replies: 900,
      features: { followUps: false },
    });
    expect(plans.team).toEqual(PLANS.team);
    // The defaults themselves never change.
    expect(PLANS.solo.accounts).toBe(3);
  });

  it("parses one plan's column of the form", () => {
    const form = new Map<string, string>([
      ["accounts", "3"],
      ["replies", "250"],
      ["brands", ""],
      ["team", "on"],
      ["followUps", "on"],
    ]);
    expect(parsePlanSettings("business", (f) => form.get(f) ?? null)).toEqual({
      value: {
        accounts: 3,
        replies: 250,
        brands: null,
        team: true,
        autoReply: false,
        leadsFlagged: false,
        followUps: true,
        forSale: false,
      },
    });
    form.set("accounts", "0");
    expect(parsePlanSettings("business", (f) => form.get(f) ?? null)).toEqual({
      error: "Team: accounts included must be a whole number from 1 to 100.",
    });
    form.set("accounts", "2.5");
    expect(parsePlanSettings("business", (f) => form.get(f) ?? null)).toEqual({
      error: "Team: accounts included must be a whole number from 1 to 100.",
    });
  });
});

describe("plan card lines (Pricing Bible, 18 Nov)", () => {
  it("from the plan as staff set it", () => {
    expect(planBullets(PLANS.free)).toEqual([
      "1 business, just you",
      "1 account, no add-ons",
      "About 100 AI replies a month",
      "You approve every reply",
    ]);
    expect(planBullets(PLANS.solo)).toEqual([
      "1 business, just you",
      "3 accounts, then $10 each",
      "About 300 AI replies a month",
      "Replies on its own, once you trust it",
    ]);
    expect(planBullets(PLANS.team)[1]).toBe("10+ accounts");
    expect(planBullets(PLANS.business)).toEqual([
      "Unlimited businesses and team members",
      "6 accounts, then $10 each",
      "About 750 AI replies a month",
      "Replies on its own, once you trust it",
      "Leads and complaints flagged",
      "Follow-ups for leads that go quiet",
    ]);
    expect(planBullets({ ...PLANS.solo, brands: 3, accounts: 4 }).slice(0, 2)).toEqual([
      "3 businesses, just you",
      "4 accounts, then $10 each",
    ]);
  });
});
