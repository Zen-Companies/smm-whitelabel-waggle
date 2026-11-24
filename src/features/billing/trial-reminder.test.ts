import { describe, expect, it } from "vitest";
import {
  chargeDay,
  dollars,
  firstChargeLine,
  reminderEmail,
  subscriptionChargeCents,
  trialReminderRow,
} from "./trial-reminder";

// The reminder before the first charge and the billing date in the app (Pricing Bible, 24 Nov).

const TRIAL_END = "2026-12-24T10:00:00.000Z";
const items = (...xs: [number | null, number | null][]) => ({
  items: { data: xs.map(([unit_amount, quantity]) => ({ quantity, price: { unit_amount } })) },
});
const row = (over: Record<string, unknown> = {}) => ({
  stripe_subscription_id: "sub_1",
  plan: "solo" as const,
  billing_interval: "month" as const,
  status: "trialing",
  trial_ends_at: TRIAL_END,
  cancel_at_period_end: false,
  ...over,
});

describe("the billing date in the app", () => {
  it("says the first charge: date and amount", () => {
    expect(firstChargeLine(TRIAL_END, 4900)).toBe("First charge: December 24 ($49)");
    expect(firstChargeLine(TRIAL_END, 11900)).toBe("First charge: December 24 ($119)");
  });
  it("dates in UTC, like the rest of Your plan; cents only when there are some", () => {
    expect(chargeDay("2027-01-01T02:00:00Z")).toBe("January 1");
    expect(dollars(4900)).toBe("$49");
    expect(dollars(99000)).toBe("$990");
    expect(dollars(4950)).toBe("$49.50");
    expect(dollars(-5)).toBe("$0");
  });
});

describe("what the first invoice charges", () => {
  it("every item's price times its quantity (plan plus extra accounts)", () => {
    expect(subscriptionChargeCents(items([4900, 1], [1000, 2]))).toBe(6900);
    expect(subscriptionChargeCents(items([9900, null]))).toBe(9900);
    expect(subscriptionChargeCents(items([null, 1]))).toBe(0);
  });
});

describe("the row Stripe's trial_will_end stores", () => {
  it("one per subscription: plan, interval, amount and the charge date", () => {
    expect(trialReminderRow("org-1", row(), items([4900, 1]))).toEqual({
      stripe_subscription_id: "sub_1",
      organization_id: "org-1",
      plan: "solo",
      billing_interval: "month",
      amount_cents: 4900,
      charge_at: TRIAL_END,
    });
  });
  it("nothing to remind when it isn't a running trial, or it's set to cancel", () => {
    const it1 = items([4900, 1]);
    expect(trialReminderRow("org-1", row({ status: "active" }), it1)).toBeNull();
    expect(trialReminderRow("org-1", row({ trial_ends_at: null }), it1)).toBeNull();
    expect(trialReminderRow("org-1", row({ cancel_at_period_end: true }), it1)).toBeNull();
    expect(trialReminderRow("org-1", row({ plan: null }), it1)).toBeNull();
  });
});

describe("the reminder email", () => {
  const email = reminderEmail({
    firstName: "Febron",
    orgName: "Harbour Bean Café",
    plan: "solo",
    interval: "month",
    amountCents: 4900,
    chargeAt: TRIAL_END,
    appUrl: "https://app.example.com/",
    trialDays: 30,
  });
  it("names the plan, the amount and the charge date", () => {
    expect(email.subject).toBe("Your free month ends soon: $49 on December 24");
    expect(email.text).toContain(
      "Hi Febron. Your free month of Waggle Solo ends soon. On December 24 your card is charged $49, then every month.",
    );
    expect(email.text).toContain("Plan: Solo (monthly)");
    expect(email.text).toContain("First charge: December 24");
    expect(email.text).toContain("Amount: $49");
  });
  it("says how to change or cancel, with a link to Your plan", () => {
    expect(email.text).toContain(
      "To change your plan or cancel, open Your plan before December 24. Cancel before then and you pay nothing.",
    );
    expect(email.text).toContain("Open Your plan: https://app.example.com/plan");
    expect(email.html).toContain('href="https://app.example.com/plan"');
    expect(email.text).toContain("You get this because you're the Owner of Harbour Bean Café.");
  });
  it("Team yearly, and no first name", () => {
    const e = reminderEmail({
      firstName: null,
      orgName: "X",
      plan: "business",
      interval: "year",
      amountCents: 99000,
      chargeAt: TRIAL_END,
      appUrl: "https://app.example.com",
      trialDays: 37,
    });
    expect(e.text).toContain("Hi. Your free month of Waggle Team ends soon.");
    expect(e.text).toContain("then every year");
    expect(e.text).toContain("Plan: Team (yearly)");
  });
  it("a shorter trial is the free trial, never the free month", () => {
    const e = reminderEmail({
      firstName: null,
      orgName: "X",
      plan: "solo",
      interval: "month",
      amountCents: 4900,
      chargeAt: TRIAL_END,
      appUrl: "https://app.example.com",
      trialDays: 7,
    });
    expect(e.subject).toBe("Your free trial ends soon: $49 on December 24");
    expect(e.text).toContain("Hi. Your free trial of Waggle Solo ends soon.");
    expect(e.text).not.toContain("free month");
  });
});
