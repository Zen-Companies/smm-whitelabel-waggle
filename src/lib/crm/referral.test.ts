import { describe, expect, it } from "vitest";
import {
  creditedMonthEnd,
  friendMonthApplied,
  readableDay,
  referralDedupeKey,
  referralLinkDedupeKey,
  referralLinkFields,
  referralRewardedFields,
  referralSendAfter,
  signupReferralFields,
} from "./referral";

describe("readableDay", () => {
  it("reads like an email: month and day, US Eastern", () => {
    expect(readableDay("2026-12-30T15:00:00Z")).toBe("December 30");
    // 2 Dec 04:59 UTC is still 1 December in New York.
    expect(readableDay(new Date("2026-12-02T04:59:59Z"))).toBe("December 1");
  });
  it("is empty for nothing or a bad date", () => {
    expect(readableDay(null)).toBe("");
    expect(readableDay("not a date")).toBe("");
  });
});

describe("dedupe", () => {
  it("one key per referral and side", () => {
    expect(referralDedupeKey("r1", "friend")).toBe("referral_rewarded:r1:friend");
    expect(referralDedupeKey("r1", "referrer")).not.toBe(referralDedupeKey("r1", "friend"));
  });
});

describe("friendMonthApplied", () => {
  const started = { referred: true, trialStarted: true };
  it("counts the friend's month, also during Black Friday", () => {
    expect(friendMonthApplied({ ...started, promo: "referral" })).toBe(true);
    expect(friendMonthApplied({ ...started, promo: "black_friday" })).toBe(true);
  });
  it("not for banked months only, a non-friend, or no trial start", () => {
    expect(friendMonthApplied({ ...started, promo: "banked" })).toBe(false);
    expect(friendMonthApplied({ ...started, promo: undefined })).toBe(false);
    expect(friendMonthApplied({ referred: false, trialStarted: true, promo: "referral" })).toBe(
      false,
    );
    expect(friendMonthApplied({ referred: true, trialStarted: false, promo: "referral" })).toBe(
      false,
    );
  });
});

describe("creditedMonthEnd", () => {
  it("is the next bill's month", () => {
    expect(creditedMonthEnd("2026-12-15T10:00:00Z")?.toISOString()).toBe(
      "2027-01-15T10:00:00.000Z",
    );
    expect(creditedMonthEnd("2026-12-15T10:00:00Z", 2)?.toISOString()).toBe(
      "2027-02-15T10:00:00.000Z",
    );
  });
  it("keeps to the month's last day", () => {
    expect(creditedMonthEnd("2027-01-31T10:00:00Z")?.toISOString()).toBe(
      "2027-02-28T10:00:00.000Z",
    );
  });
  it("null without a period end", () => {
    expect(creditedMonthEnd(null)).toBeNull();
  });
});

describe("referralSendAfter (≥ 30 s between referrer and friend)", () => {
  const now = new Date("2026-12-01T12:00:00Z");
  it("right away when the other side is long done or missing", () => {
    expect(referralSendAfter([], now)).toBeNull();
    expect(
      referralSendAfter(
        [
          {
            sentAt: "2026-11-01T00:00:00Z",
            nextAttemptAt: null,
            createdAt: "2026-11-01T00:00:00Z",
          },
        ],
        now,
      ),
    ).toBeNull();
  });
  it("30 s after the other side, sent or still waiting", () => {
    expect(
      referralSendAfter(
        [{ sentAt: null, nextAttemptAt: null, createdAt: "2026-12-01T11:59:50Z" }],
        now,
      )?.toISOString(),
    ).toBe("2026-12-01T12:00:20.000Z");
    expect(
      referralSendAfter(
        [
          {
            sentAt: null,
            nextAttemptAt: "2026-12-01T12:05:00Z",
            createdAt: "2026-12-01T11:00:00Z",
          },
        ],
        now,
      )?.toISOString(),
    ).toBe("2026-12-01T12:05:30.000Z");
  });
});

describe("referralRewardedFields", () => {
  it("role, the other business, the readable end", () => {
    expect(
      referralRewardedFields({
        role: "friend",
        with: "Harbour Bean Café",
        ends: "2026-12-30T15:00:00Z",
      }),
    ).toEqual({
      waggle_referral_role: "friend",
      waggle_referral_with: "Harbour Bean Café",
      waggle_referral_ends: "December 30",
    });
  });
  it("blank on other events", () => {
    expect(referralRewardedFields({})).toEqual({
      waggle_referral_role: "",
      waggle_referral_with: "",
      waggle_referral_ends: "",
    });
  });
});

describe("signupReferralFields", () => {
  it("the code and who sent them", () => {
    expect(signupReferralFields({ code: "abcd2345", referrerName: " Harbour Bean Café " })).toEqual(
      {
        ref_code: "abcd2345",
        referred_by: "Harbour Bean Café",
      },
    );
    expect(signupReferralFields({ code: "abcd2345", referrerName: null })).toEqual({
      ref_code: "abcd2345",
    });
    expect(signupReferralFields(null)).toEqual({});
  });
});

describe("the Owner's referral link (25 Nov)", () => {
  it("waggle_referral_link: the link for a paying Owner, empty for a Free Owner, nothing for teammates", () => {
    expect(
      referralLinkFields({ owner: true, link: "https://app.gowaggle.ai/signup?ref=abc123" }),
    ).toEqual({ waggle_referral_link: "https://app.gowaggle.ai/signup?ref=abc123" });
    expect(referralLinkFields({ owner: true, link: null })).toEqual({ waggle_referral_link: "" });
    expect(referralLinkFields({ owner: true, link: "" })).toEqual({ waggle_referral_link: "" });
    expect(referralLinkFields({ owner: false, link: "https://x/signup?ref=abc123" })).toEqual({});
  });

  it("synced once per code", () => {
    expect(referralLinkDedupeKey("abc123")).toBe("referral_link:abc123");
  });
});
