import { describe, expect, it } from "vitest";
import { blackFridayOn, firstCheckoutTrial, referralsOn } from "./promo";
import { PROMOTIONS, type Promotion } from "./promotions";
import {
  codeFromBytes,
  earnsReferralReward,
  isNewOrg,
  parseRefCode,
  REF_PATTERN,
  referralLink,
} from "./referral-code";

const during = new Date("2026-11-27T15:00:00Z");
const lastMinute = new Date("2026-12-01T04:59:00Z");
const after = new Date("2026-12-01T05:00:00Z");

describe("Black Friday", () => {
  it("runs until Monday 30 November, 11:59 pm Eastern", () => {
    expect(blackFridayOn(during)).toBe(true);
    expect(blackFridayOn(lastMinute)).toBe(true);
    expect(blackFridayOn(after)).toBe(false);
  });
});

describe("referrals window", () => {
  it("is open when there is no end date", () => {
    expect(referralsOn(after, null)).toBe(true);
  });
  it("closes after its end date", () => {
    expect(referralsOn(after, new Date("2026-12-31T00:00:00Z"))).toBe(true);
    expect(referralsOn(new Date("2027-01-01T00:00:00Z"), new Date("2026-12-31T00:00:00Z"))).toBe(
      false,
    );
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
  it("gives a friend the free month after Black Friday", () => {
    expect(
      firstCheckoutTrial({ now: after, referred: true, bankedMonths: 0, referralEndsAt: null }),
    ).toEqual({ days: 30, reasons: ["referral"] });
  });
  it("keeps the usual 7-day trial when nothing applies", () => {
    expect(
      firstCheckoutTrial({ now: after, referred: false, bankedMonths: 0, baseDays: 7 }),
    ).toEqual({ days: 7, reasons: [] });
  });
  it("replaces the 7-day trial with the free month, never adds them", () => {
    expect(
      firstCheckoutTrial({ now: during, referred: false, bankedMonths: 0, baseDays: 7 }).days,
    ).toBe(30);
  });
  it("adds a month per banked reward", () => {
    expect(
      firstCheckoutTrial({ now: after, referred: false, bankedMonths: 2, baseDays: 7 }).days,
    ).toBe(67);
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
    p.kind === "seasonal" ? { ...p, trialDays: 45 } : { ...p, trialDays: 14, rewardMonths: 2 },
  );
  it("uses the seasonal promotion's trial days", () => {
    expect(
      firstCheckoutTrial({ now: during, referred: false, bankedMonths: 0, promotions: edited }),
    ).toEqual({ days: 45, reasons: ["black_friday"] });
  });
  it("uses the referral program's days and reward months", () => {
    expect(
      firstCheckoutTrial({ now: after, referred: true, bankedMonths: 1, promotions: edited }).days,
    ).toBe(14 + 60);
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
