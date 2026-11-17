// The plans, from the Waggle Pricing Bible (docs/Waggle Pricing Bible 1.md, 16 Nov 2026; only
// Jason changes a price). Pure: no Stripe, no database. Billing (T86) reads these numbers so the
// app, the site and the ads never disagree.

export type PlanId = "solo" | "business" | "team";

export interface Plan {
  id: PlanId;
  name: string;
  /** US dollars a month. */
  monthlyUsd: number;
  /** US dollars a year (2 months free); null when there's no yearly price yet. */
  yearlyUsd: number | null;
  /** Connected social accounts included. */
  accounts: number;
  /** AI replies a month ("about"). */
  replies: number;
  /** The most AI may cost us a month on this plan (the margin table's worst case). */
  aiCostCapUsd: number;
  /** Selling now, or coming soon (Team goes on sale when team features are built). */
  forSale: boolean;
  features: {
    /** Waggle answers regular questions on its own, once the owner trusts it. */
    autoReply: boolean;
    /** Leads and complaints flagged to the owner. */
    leadsFlagged: boolean;
    /** Follow-ups drafted for leads that go quiet: not built yet on any plan. */
    followUps: "soon" | false;
    /**
     * Team members and roles (organizations, built 10 Nov). Business and Team (decided 17 Nov;
     * the Bible's first draft had Team only).
     */
    team: boolean;
  };
}

export const PLANS: Record<PlanId, Plan> = {
  solo: {
    id: "solo",
    name: "Solo",
    monthlyUsd: 49,
    yearlyUsd: 490,
    accounts: 3,
    replies: 200,
    aiCostCapUsd: 4,
    forSale: true,
    features: { autoReply: false, leadsFlagged: false, followUps: false, team: false },
  },
  business: {
    id: "business",
    name: "Business",
    monthlyUsd: 99,
    yearlyUsd: 990,
    accounts: 4,
    replies: 750,
    aiCostCapUsd: 15,
    forSale: true,
    features: { autoReply: true, leadsFlagged: true, followUps: "soon", team: true },
  },
  team: {
    id: "team",
    name: "Team",
    monthlyUsd: 199,
    yearlyUsd: null,
    accounts: 10,
    replies: 1500,
    aiCostCapUsd: 30,
    forSale: false,
    features: { autoReply: true, leadsFlagged: true, followUps: "soon", team: true },
  },
};

/** The plan to promote. */
export const PROMOTED_PLAN: PlanId = "business";

export function isPlanId(v: unknown): v is PlanId {
  return typeof v === "string" && Object.hasOwn(PLANS, v);
}

/** Every new customer: 7 days free, card up front, starting when a waitlist spot opens. */
export const TRIAL = { days: 7, cardRequired: true } as const;

/** Extras, all self-serve. */
export const EXTRAS = {
  /** Added to any plan, each. */
  accountUsd: 10,
  /** One time; unused top-up replies carry over one month. */
  topUp: { usd: 15, replies: 200, carryOverMonths: 1 },
  /** Opt-in only, off by default, an email receipt every time. */
  autoTopUp: { maxPerMonth: 2 },
} as const;

/** The first 50 businesses get Business at $79 a month for 6 months, then $99. */
export const FOUNDING = { plan: "business" as PlanId, monthlyUsd: 79, months: 6, spots: 50 };

/** Pure: when a trial that started at `start` ends. */
export function trialEndsAt(start: Date): Date {
  return new Date(start.getTime() + TRIAL.days * 24 * 60 * 60 * 1000);
}

/** Pure: what a plan costs a month, founding price first, yearly as its monthly share. */
export function monthlyPrice(
  plan: PlanId,
  opts: { yearly?: boolean; founding?: { since: Date; now: Date } } = {},
): number {
  const p = PLANS[plan];
  if (opts.founding && plan === FOUNDING.plan) {
    const end = new Date(opts.founding.since);
    end.setUTCMonth(end.getUTCMonth() + FOUNDING.months);
    if (opts.founding.now < end) return FOUNDING.monthlyUsd;
  }
  if (opts.yearly && p.yearlyUsd !== null) return Math.round((p.yearlyUsd / 12) * 100) / 100;
  return p.monthlyUsd;
}

/** Pure: accounts a plan can connect, with extras bought. */
export function accountAllowance(plan: PlanId, extraAccounts = 0): number {
  return PLANS[plan].accounts + Math.max(0, Math.floor(extraAccounts));
}

/** Pure: whether one more account fits. */
export function canConnectAnother(connected: number, allowance: number): boolean {
  return connected < allowance;
}

/** Pure: AI replies this month, with top-ups (this month's and last month's unused carry-over). */
export function replyAllowance(
  plan: PlanId,
  topUps: { thisMonth?: number; carriedReplies?: number } = {},
): number {
  return (
    PLANS[plan].replies +
    Math.max(0, topUps.thisMonth ?? 0) * EXTRAS.topUp.replies +
    Math.max(0, topUps.carriedReplies ?? 0)
  );
}

/**
 * Brands a plan includes: set by staff on Staff → Plans (decided 17 Nov), null for no limit.
 * The largest a limit may be.
 */
export const BRANDS_LIMIT_MAX = 100;

/** Pure: Staff → Plans' brand limit field. Blank is no limit; otherwise a whole number 1..100. */
export function parseBrandsLimit(raw: unknown): { limit: number | null } | { error: string } {
  const text = String(raw ?? "").trim();
  if (text === "") return { limit: null };
  const n = Number(text);
  if (!Number.isInteger(n) || n < 1 || n > BRANDS_LIMIT_MAX) {
    return {
      error: `Use a whole number from 1 to ${BRANDS_LIMIT_MAX}, or leave it blank for no limit.`,
    };
  }
  return { limit: n };
}

/** Pure: whether one more brand fits. */
export function canAddBrand(brands: number, limit: number | null): boolean {
  return limit === null || brands < limit;
}
