// What Waggle sells in Stripe, from the plans (Pricing Bible). Pure. Prices are found in Stripe
// by these lookup keys, so no price id lives in the environment: `pnpm stripe:catalog` creates
// them once per Stripe account (sandbox or live) and prints the ids.

import { EXTRAS, FOUNDING, PLANS, type PlanId } from "./plans";

export type Interval = "month" | "year";

export const PRICE_KEYS = {
  plan: (plan: PlanId, interval: Interval) =>
    `waggle_${plan}_${interval === "year" ? "yearly" : "monthly"}`,
  extraAccount: (interval: Interval) =>
    `waggle_extra_account_${interval === "year" ? "yearly" : "monthly"}`,
  topUp: "waggle_top_up_200",
} as const;

/** The founding Business discount: $79 instead of $99 for 6 months, first 50 businesses. */
export const FOUNDING_COUPON = "waggle_founding_business";

export interface CatalogPrice {
  lookupKey: string;
  /** Cents. */
  amount: number;
  interval: Interval | null;
}

export interface CatalogProduct {
  key: string;
  name: string;
  description: string;
  prices: CatalogPrice[];
}

const cents = (usd: number) => Math.round(usd * 100);

/** Every product and price Waggle needs in Stripe. */
export function catalog(): CatalogProduct[] {
  const plans = (Object.keys(PLANS) as PlanId[]).map((id) => {
    const p = PLANS[id];
    const prices: CatalogPrice[] = [
      { lookupKey: PRICE_KEYS.plan(id, "month"), amount: cents(p.monthlyUsd), interval: "month" },
    ];
    if (p.yearlyUsd !== null) {
      prices.push({
        lookupKey: PRICE_KEYS.plan(id, "year"),
        amount: cents(p.yearlyUsd),
        interval: "year",
      });
    }
    return {
      key: `waggle_${id}`,
      name: `Waggle ${p.name}`,
      description: `${p.accounts} connected accounts, about ${p.replies.toLocaleString("en-US")} AI replies a month.`,
      prices,
    };
  });
  return [
    ...plans,
    {
      key: "waggle_extra_account",
      name: "Extra connected account",
      description: "One more connected social account, on any plan.",
      // A subscription's items share one interval, so yearly plans get the yearly price (12 months).
      prices: [
        {
          lookupKey: PRICE_KEYS.extraAccount("month"),
          amount: cents(EXTRAS.accountUsd),
          interval: "month",
        },
        {
          lookupKey: PRICE_KEYS.extraAccount("year"),
          amount: cents(EXTRAS.accountUsd * 12),
          interval: "year",
        },
      ],
    },
    {
      key: "waggle_top_up",
      name: `${EXTRAS.topUp.replies} more AI replies`,
      description: `One time. Unused replies carry over ${EXTRAS.topUp.carryOverMonths} month.`,
      prices: [{ lookupKey: PRICE_KEYS.topUp, amount: cents(EXTRAS.topUp.usd), interval: null }],
    },
  ];
}

/** Cents off a month for founding members (the Business monthly price minus the founding one). */
export function foundingCentsOff(): number {
  return cents(PLANS[FOUNDING.plan].monthlyUsd - FOUNDING.monthlyUsd);
}
