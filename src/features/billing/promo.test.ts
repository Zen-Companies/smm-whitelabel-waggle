import { describe, expect, it } from "vitest";
import { bankedDaysOf, bankedRewardDays, blackFridayOn, firstCheckoutTrial } from "./promo";
import { TRIAL } from "./plans";
import { PROMOTIONS, runningReferral, type Promotion } from "./promotions";
import {
  codeFromBytes,
  earnsReferralReward,
  referralPlanQualifies,
  isNewOrg,
  parseRefCode,
  REF_PATTERN,
  referralLink,
} from "./referral-code";

const during = new Date("2026-11-27T15:00:00Z");
const lastMinute = new Date("2026-12-02T04:59:00Z");
const after = new Date("2026-12-02T05:00:00Z");
/** An end date set on Staff → Promotions: it only switches the offer off (never shown). */
const END = new Date("2026-12-02T04:59:59Z");
const DATED: Promotion[] = PROMOTIONS.map((p) => ({ ...p, endsAt: END }));
const BASE = TRIAL.days;

describe("Black Friday", () => {
  it("has no end date: it runs until our team switches it off (Pricing Bible, 24 Nov)", () => {
    expect(blackFridayOn(during)).toBe(true);
    expect(blackFridayOn(after)).toBe(true);
  });
  it("an end date set by staff switches it off", () => {
    expect(blackFridayOn(lastMinute, DATED)).toBe(true);
    expect(blackFridayOn(after, DATED)).toBe(false);
  });
});

describe("the running referral program", () => {
  const twoPrograms: Promotion[] = [
    ...PROMOTIONS.filter((p) => p.kind === "seasonal"),
    { ...PROMOTIONS[1], id: "old-referral", enabled: false, trialDays: 90 },
    { ...PROMOTIONS[1], id: "new-referral", endsAt: null, trialDays: 21 },
  ];
  it("is the one on and inside its dates, not the first of its kind", () => {
    expect(runningReferral(after, twoPrograms)?.id).toBe("new-referral");
  });
  it("closes after its end date, when staff set one", () => {
    expect(runningReferral(after)?.id).toBe("give-a-month");
    expect(runningReferral(lastMinute, DATED)?.id).toBe("give-a-month");
    expect(runningReferral(after, DATED)).toBeNull();
  });
});

describe("first checkout trial", () => {
  it("gives a free month during Black Friday", () => {
    expect(firstCheckoutTrial({ now: during, referred: false, bankedMonths: 0 })).toEqual({
      days: 30,
      reasons: ["black_friday"],
    });
  });
  it("gives one free month, not two, to a friend during Black Friday", () => {
    expect(firstCheckoutTrial({ now: during, referred: true, bankedMonths: 0 }).days).toBe(30);
  });
  it("gives a friend who joined while the referral program ran the month after it ended", () => {
    expect(
      firstCheckoutTrial({
        now: after,
        referred: true,
        referredAt: during,
        bankedMonths: 0,
        promotions: DATED,
      }),
    ).toEqual({ days: 30, reasons: ["referral"] });
  });
  it("a friend who joined after the program ended still gets the usual first month", () => {
    expect(
      firstCheckoutTrial({
        now: after,
        referred: true,
        referredAt: after,
        bankedMonths: 0,
        baseDays: BASE,
        promotions: DATED,
      }),
    ).toEqual({ days: 30, reasons: [] });
  });
  it("never shortens a longer usual trial", () => {
    expect(
      firstCheckoutTrial({ now: during, referred: false, bankedMonths: 0, baseDays: 45 }).days,
    ).toBe(45);
    expect(
      firstCheckoutTrial({
        now: after,
        referred: true,
        referredAt: during,
        bankedMonths: 0,
        baseDays: 40,
      }).days,
    ).toBe(40);
  });
  it("keeps the usual first month when nothing applies", () => {
    expect(
      firstCheckoutTrial({
        now: after,
        referred: false,
        bankedMonths: 0,
        baseDays: BASE,
        promotions: DATED,
      }),
    ).toEqual({ days: 30, reasons: [] });
  });
  it("replaces a shorter usual trial with the free month, never adds them", () => {
    expect(
      firstCheckoutTrial({ now: during, referred: false, bankedMonths: 0, baseDays: 7 }).days,
    ).toBe(30);
  });
  it("adds a month per banked reward", () => {
    expect(
      firstCheckoutTrial({
        now: after,
        referred: false,
        bankedMonths: 2,
        baseDays: BASE,
        promotions: DATED,
      }).days,
    ).toBe(90);
    expect(firstCheckoutTrial({ now: during, referred: false, bankedMonths: 2 }).days).toBe(90);
  });
  it("never goes past Stripe's 730-day limit", () => {
    expect(firstCheckoutTrial({ now: after, referred: false, bankedMonths: 99 }).days).toBe(730);
  });
});

describe("referral codes", () => {
  it("makes 8 readable characters", () => {
    const code = codeFromBytes(new Uint8Array([0, 1, 2, 3, 250, 251, 252, 253]));
    expect(code).toMatch(REF_PATTERN);
    expect(code).not.toMatch(/[01ilo]/);
  });
  it("accepts only the site's shape", () => {
    expect(parseRefCode(" AbCd2345 ")).toBe("abcd2345");
    expect(parseRefCode("short")).toBeNull();
    expect(parseRefCode("abcd-234")).toBeNull();
    expect(parseRefCode(undefined)).toBeNull();
  });
  it("links straight to sign-up", () => {
    expect(referralLink("https://app.gowaggle.ai/", "abcd2345")).toBe(
      "https://app.gowaggle.ai/signup?ref=abcd2345",
    );
  });
  it("credits only brand-new organizations", () => {
    const now = new Date("2026-11-25T12:00:00Z");
    expect(isNewOrg("2026-11-25T11:00:00Z", now)).toBe(true);
    expect(isNewOrg("2026-11-20T11:00:00Z", now)).toBe(false);
    expect(isNewOrg(null, now)).toBe(false);
  });
});

describe("the friend's plan (Pricing Bible, 24 Nov)", () => {
  it("is Solo or Team; Business (a call, no checkout) and Free never count", () => {
    expect(referralPlanQualifies("solo")).toBe(true);
    expect(referralPlanQualifies("business")).toBe(true); // shown as Team
    expect(referralPlanQualifies("team")).toBe(false); // shown as Business
    expect(referralPlanQualifies("free")).toBe(false);
    expect(referralPlanQualifies(null)).toBe(false);
  });
});

describe("when the referrer earns the month", () => {
  it("is the friend's first real payment", () => {
    expect(earnsReferralReward({ amount_paid: 4900, billing_reason: "subscription_cycle" })).toBe(
      true,
    );
    expect(earnsReferralReward({ amount_paid: 4900, billing_reason: "subscription_create" })).toBe(
      true,
    );
  });
  it("isn't the free month's $0 invoice", () => {
    expect(earnsReferralReward({ amount_paid: 0, billing_reason: "subscription_create" })).toBe(
      false,
    );
  });
  it("isn't a top-up", () => {
    expect(
      earnsReferralReward({
        amount_paid: 1500,
        billing_reason: "manual",
        metadata: { kind: "auto_top_up" },
      }),
    ).toBe(false);
  });
});

describe("first checkout trial from Staff → Promotions", () => {
  const edited: Promotion[] = PROMOTIONS.map((p) =>
    p.kind === "seasonal"
      ? { ...p, trialDays: 45, endsAt: END }
      : { ...p, trialDays: 14, rewardMonths: 2, endsAt: null },
  );
  it("uses the seasonal promotion's trial days", () => {
    expect(
      firstCheckoutTrial({ now: during, referred: false, bankedMonths: 0, promotions: edited }),
    ).toEqual({ days: 45, reasons: ["black_friday"] });
  });
  it("uses the referral program's days and reward months", () => {
    expect(
      firstCheckoutTrial({ now: after, referred: true, bankedMonths: 1, promotions: edited }).days,
    ).toBe(14 + 2 * 14);
  });
  it("values a banked month at the referral program's trial days", () => {
    const month31 = DATED.map((p) => (p.kind === "referral" ? { ...p, trialDays: 31 } : p));
    expect(bankedRewardDays(after, month31)).toBe(31);
    expect(
      firstCheckoutTrial({
        now: after,
        referred: false,
        bankedMonths: 2,
        baseDays: 7,
        promotions: month31,
      }).days,
    ).toBe(7 + 62);
  });
  it("gives nothing when staff switch the promotions off", () => {
    const off = PROMOTIONS.map((p) => ({ ...p, enabled: false }));
    expect(
      firstCheckoutTrial({
        now: during,
        referred: true,
        bankedMonths: 0,
        baseDays: 7,
        promotions: off,
      }),
    ).toEqual({ days: 7, reasons: [] });
    expect(blackFridayOn(during, off)).toBe(false);
  });
});

describe("a referral's stored terms (review of release #78)", () => {
  /** The referral program switched off on Staff → Promotions (Black Friday off too). */
  const OFF: Promotion[] = PROMOTIONS.map((p) => ({ ...p, enabled: false }));
  it("the friend keeps the month stored at sign-up after the program is switched off", () => {
    expect(
      firstCheckoutTrial({
        now: after,
        referred: true,
        referredAt: during,
        referralTrialDays: 45,
        bankedMonths: 0,
        baseDays: BASE,
        promotions: OFF,
      }),
    ).toEqual({ days: 45, reasons: ["referral"] });
  });
  it("0 stored (no program ran at sign-up) gives no referral month", () => {
    expect(
      firstCheckoutTrial({
        now: after,
        referred: true,
        referralTrialDays: 0,
        bankedMonths: 0,
        baseDays: BASE,
        promotions: PROMOTIONS.map((p) => (p.kind === "seasonal" ? { ...p, enabled: false } : p)),
      }),
    ).toEqual({ days: BASE, reasons: [] });
  });
  it("banked months count on their own terms, whatever the program says now", () => {
    const rows = [
      { reward_months: 1, trial_days: 30 },
      { reward_months: 2, trial_days: 30 },
      { reward_months: 0, trial_days: 0 },
    ];
    expect(bankedDaysOf(rows, after, OFF)).toBe(90);
    expect(
      firstCheckoutTrial({
        now: after,
        referred: false,
        bankedMonths: 3,
        bankedDays: bankedDaysOf(rows, after, OFF),
        baseDays: BASE,
        promotions: OFF,
      }).days,
    ).toBe(BASE + 90);
    // A row from before the terms were stored: the program's month.
    expect(bankedDaysOf([{ reward_months: null, trial_days: null }], during)).toBe(30);
  });
});
