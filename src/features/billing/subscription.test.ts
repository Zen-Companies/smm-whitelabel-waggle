import { describe, expect, it } from "vitest";
import { catalog, foundingCentsOff, PRICE_KEYS } from "./catalog";
import {
  autoTopUpAllowed,
  billingFromSubscription,
  carriedReplies,
  isExtraAccountKey,
  parsePlanKey,
  planIsLive,
  type SubscriptionLike,
} from "./subscription";

const sub = (over: Partial<SubscriptionLike> = {}): SubscriptionLike => ({
  id: "sub_1",
  status: "trialing",
  customer: "cus_1",
  cancel_at_period_end: false,
  trial_end: 1_795_000_000,
  metadata: { organization_id: "org-1" },
  items: {
    data: [
      {
        quantity: 1,
        current_period_end: 1_797_000_000,
        price: { lookup_key: "waggle_business_monthly" },
      },
    ],
  },
  ...over,
});

describe("catalog", () => {
  it("has every plan price, the extras and the top-up, priced from the Bible", () => {
    const prices = Object.fromEntries(
      catalog()
        .flatMap((p) => p.prices)
        .map((p) => [p.lookupKey, p]),
    );
    expect(prices.waggle_solo_monthly.amount).toBe(4900);
    expect(prices.waggle_solo_yearly.amount).toBe(49000);
    expect(prices.waggle_business_monthly.amount).toBe(9900);
    expect(prices.waggle_business_yearly.amount).toBe(99000);
    expect(prices.waggle_team_monthly.amount).toBe(19900);
    expect(prices.waggle_team_yearly).toBeUndefined();
    expect(prices.waggle_extra_account_monthly.amount).toBe(1000);
    expect(prices.waggle_extra_account_yearly.amount).toBe(12000);
    expect(prices.waggle_top_up_200).toMatchObject({ amount: 1500, interval: null });
  });
  it("founding takes $20 off Business", () => expect(foundingCentsOff()).toBe(2000));
  it("keys round-trip", () => {
    expect(parsePlanKey(PRICE_KEYS.plan("solo", "year"))).toEqual({
      plan: "solo",
      interval: "year",
    });
    expect(parsePlanKey(PRICE_KEYS.topUp)).toBeNull();
    expect(parsePlanKey("waggle_gold_monthly")).toBeNull();
    expect(isExtraAccountKey(PRICE_KEYS.extraAccount("month"))).toBe(true);
    expect(isExtraAccountKey("waggle_solo_monthly")).toBe(false);
  });
});

describe("billingFromSubscription", () => {
  it("reads the plan, interval, trial and period", () => {
    expect(billingFromSubscription(sub())).toEqual({
      stripe_customer_id: "cus_1",
      stripe_subscription_id: "sub_1",
      plan: "business",
      billing_interval: "month",
      status: "trialing",
      trial_ends_at: new Date(1_795_000_000_000).toISOString(),
      current_period_end: new Date(1_797_000_000_000).toISOString(),
      cancel_at_period_end: false,
      extra_accounts: 0,
      founding: false,
    });
  });
  it("counts extra accounts and spots the founding coupon", () => {
    const row = billingFromSubscription(
      sub({
        customer: { id: "cus_2" },
        discounts: [{ source: { coupon: "waggle_founding_business" } }],
        items: {
          data: [
            {
              quantity: 1,
              current_period_end: 1,
              price: { lookup_key: "waggle_business_monthly" },
            },
            {
              quantity: 2,
              current_period_end: 1,
              price: { lookup_key: "waggle_extra_account_monthly" },
            },
          ],
        },
      }),
    );
    expect(row).toMatchObject({ stripe_customer_id: "cus_2", extra_accounts: 2, founding: true });
  });
  it("founding marked in the subscription's metadata (events list discounts by id only)", () => {
    const row = billingFromSubscription(
      sub({ metadata: { organization_id: "org-1", founding: "1" }, discounts: ["di_123"] }),
    );
    expect(row.founding).toBe(true);
  });
  it("a cancel by date counts as ending (the portal's cancel)", () => {
    expect(billingFromSubscription(sub({ cancel_at: 1_795_516_695 })).cancel_at_period_end).toBe(
      true,
    );
    expect(billingFromSubscription(sub({ cancel_at: null })).cancel_at_period_end).toBe(false);
  });
  it("older discount shape (coupon on the discount) works too", () => {
    expect(
      billingFromSubscription(sub({ discounts: [{ coupon: { id: "waggle_founding_business" } }] }))
        .founding,
    ).toBe(true);
  });
});

describe("rules", () => {
  it("live statuses", () => {
    expect(planIsLive("trialing")).toBe(true);
    expect(planIsLive("past_due")).toBe(true);
    expect(planIsLive("canceled")).toBe(false);
    expect(planIsLive(null)).toBe(false);
  });
  it("carries over unused top-up replies, plan replies used first", () => {
    expect(carriedReplies({ planReplies: 200, topUpReplies: 200, used: 150 })).toBe(200);
    expect(carriedReplies({ planReplies: 200, topUpReplies: 200, used: 350 })).toBe(50);
    expect(carriedReplies({ planReplies: 200, topUpReplies: 200, used: 500 })).toBe(0);
  });
  it("automatic top-up: opt-in, at most twice a month", () => {
    expect(autoTopUpAllowed(false, 0)).toBe(false);
    expect(autoTopUpAllowed(true, 1)).toBe(true);
    expect(autoTopUpAllowed(true, 2)).toBe(false);
  });
});
