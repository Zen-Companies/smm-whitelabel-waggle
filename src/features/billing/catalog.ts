// What Waggle sells in Stripe, from the plans (Pricing Bible). Pure. Prices are found in Stripe
// by these lookup keys, so no price id lives in the environment: `pnpm stripe:catalog` creates
// them once per Stripe account (sandbox or live) and prints the ids.

import { EXTRAS, PAID_PLAN_IDS, PLANS, type PaidPlanId, type Plan, type PlanId } from "./plans";

export type Interval = "month" | "year";

export const PRICE_KEYS = {
  plan: (plan: PaidPlanId, interval: Interval) =>
    `waggle_${plan}_${interval === "year" ? "yearly" : "monthly"}`,
  extraAccount: (interval: Interval) =>
    `waggle_extra_account_${interval === "year" ? "yearly" : "monthly"}`,
  topUp: "waggle_top_up_200",
} as const;

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

/**
 * Pure: a plan's product description, the line Stripe Checkout shows under the plan. From the
 * plans as staff set them (Staff → Plans), so it says what the app says.
 */
export function planProductDescription(p: Pick<Plan, "accounts" | "replies">): string {
  return `${p.accounts} connected accounts, about ${p.replies.toLocaleString("en-US")} AI replies a month.`;
}

/** Every product and price Waggle needs in Stripe (the plans: Staff → Plans, else the code's). */
export function catalog(list: Record<PlanId, Plan> = PLANS): CatalogProduct[] {
  // Free is no subscription, so it has no product.
  const plans = PAID_PLAN_IDS.map((id) => {
    const p = list[id];
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
      description: planProductDescription(p),
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
