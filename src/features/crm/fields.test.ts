import { describe, expect, it } from "vitest";
import { CRM_CONNECT_FIELDS, CRM_FIELDS } from "@/lib/crm";
import { crmFields, crmPlan, type CrmSnapshot } from "./fields";

const base: CrmSnapshot = {
  event: "trial_started",
  eventAt: new Date("2026-11-18T10:00:00Z"),
  details: {},
  business: "Harbour Bean Café",
  planId: "business",
  status: "trialing",
  trialEndsAt: "2026-11-25T10:00:00Z",
  periodEnd: "2026-11-25T10:00:00Z",
  cancelAtPeriodEnd: false,
  accountsConnected: 2,
  repliesUsed: 12,
  replyLimit: 750,
  resetsOn: new Date("2026-12-01T00:00:00Z"),
  daysInactive: 0,
};

describe("crmPlan", () => {
  it("sends the plan's name, not Waggle's swapped id", () => {
    expect(crmPlan("solo")).toBe("solo");
    expect(crmPlan("business")).toBe("team"); // $99
    expect(crmPlan("team")).toBe("business"); // $199
    expect(crmPlan(null)).toBe("");
  });
});

describe("crmFields", () => {
  it("sends every field, every time, founding always false (retired 24 Nov)", () => {
    const f = crmFields(base);
    expect(Object.keys(f).sort()).toEqual([...CRM_FIELDS].sort());
    expect(f).toMatchObject({
      waggle_event: "trial_started",
      waggle_plan: "team",
      waggle_founding: "false",
      waggle_trial_ends: "November 25",
      waggle_trial_ends_at: "2026-11-25T10:00:00.000Z",
      waggle_ends_on: "",
      waggle_accounts_connected: "2",
      waggle_replies_used: "12",
      waggle_reply_limit: "750",
      waggle_resets_on: "2026-12-01",
      waggle_business: "Harbour Bean Café",
    });
  });

  it("event details: the plan before, the platform, days inactive", () => {
    const f = crmFields({
      ...base,
      event: "plan_changed",
      planId: "team",
      details: { from_plan: "solo", platform: "instagram", days_inactive: 3 },
    });
    expect(f).toMatchObject({
      waggle_plan: "business",
      waggle_from_plan: "solo",
      waggle_platform: "instagram",
      waggle_days_inactive: "3",
    });
  });

  it("referral_rewarded: role, the other business, a readable end and the plan", () => {
    const f = crmFields({
      ...base,
      event: "referral_rewarded",
      planId: "free",
      details: {
        referral_id: "r1",
        role: "referrer",
        with: "Harbour Bean Café",
        ends: "2026-12-30T15:00:00Z",
        plan: "solo",
      },
    });
    expect(f).toMatchObject({
      waggle_event: "referral_rewarded",
      waggle_plan: "solo",
      waggle_referral_role: "referrer",
      waggle_referral_with: "Harbour Bean Café",
      waggle_referral_ends: "December 30",
    });
    // Other events send the referral fields blank (HighLevel doesn't store blanks).
    expect(crmFields(base).waggle_referral_role).toBe("");
    expect(crmFields({ ...base, details: { plan: "team" } }).waggle_plan).toBe("team");
  });

  it("access ends at the trial's end when a trial is canceled", () => {
    expect(crmFields({ ...base, event: "canceled", cancelAtPeriodEnd: true }).waggle_ends_on).toBe(
      "2026-11-25",
    );
  });

  it("connect_failed adds the waggle_connect_* fields; other events don't", () => {
    const f = crmFields({
      ...base,
      event: "connect_failed",
      details: {
        platform: "facebook",
        connect_platform: "facebook",
        connect_error: "no_facebook_pages",
        connect_fixable: "yes",
        connect_in_app: "yes",
      },
    });
    expect(f).toMatchObject({
      waggle_event: "connect_failed",
      waggle_platform: "facebook",
      waggle_connect_platform: "facebook",
      waggle_connect_error: "no_facebook_pages",
      waggle_connect_fixable: "yes",
      waggle_connect_in_app: "yes",
    });
    for (const k of CRM_CONNECT_FIELDS) expect(crmFields(base)).not.toHaveProperty(k);
  });
});

describe("trial end (Walter's own reminder, 25 Nov)", () => {
  it("a readable day in US Eastern and the exact ISO time", () => {
    const f = crmFields({ ...base, trialEndsAt: "2026-12-25T03:00:00Z" });
    expect(f.waggle_trial_ends).toBe("December 24");
    expect(f.waggle_trial_ends_at).toBe("2026-12-25T03:00:00.000Z");
  });

  it("blank without a trial", () => {
    const f = crmFields({ ...base, trialEndsAt: null, status: "active" });
    expect(f.waggle_trial_ends).toBe("");
    expect(f.waggle_trial_ends_at).toBe("");
  });
});

describe("trial end in the Owner's time zone (QA, 25 Nov)", () => {
  it("uses the zone stored at checkout, US Eastern when unknown", () => {
    const end = "2026-12-24T18:35:00Z";
    expect(
      crmFields({ ...base, trialEndsAt: end, timeZone: "Asia/Manila" }).waggle_trial_ends,
    ).toBe("December 25");
    expect(crmFields({ ...base, trialEndsAt: end, timeZone: null }).waggle_trial_ends).toBe(
      "December 24",
    );
  });
});
