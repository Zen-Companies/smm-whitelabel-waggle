import { describe, expect, it } from "vitest";
import { CRM_FIELDS } from "@/lib/crm";
import { crmFields, crmPlan, type CrmSnapshot } from "./fields";

const base: CrmSnapshot = {
  event: "trial_started",
  eventAt: new Date("2026-11-18T10:00:00Z"),
  details: {},
  business: "Harbour Bean Café",
  planId: "business",
  founding: true,
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
  it("sends every field, every time, founding as true/false", () => {
    const f = crmFields(base);
    expect(Object.keys(f).sort()).toEqual([...CRM_FIELDS].sort());
    expect(f).toMatchObject({
      waggle_event: "trial_started",
      waggle_plan: "team",
      waggle_founding: "true",
      waggle_trial_ends: "2026-11-25",
      waggle_ends_on: "",
      waggle_accounts_connected: "2",
      waggle_replies_used: "12",
      waggle_reply_limit: "750",
      waggle_resets_on: "2026-12-01",
      waggle_business: "Harbour Bean Café",
    });
    expect(crmFields({ ...base, founding: false }).waggle_founding).toBe("false");
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
});
