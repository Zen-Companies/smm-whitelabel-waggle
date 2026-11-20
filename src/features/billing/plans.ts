// The plans, from the Waggle Pricing Bible (docs/Waggle Pricing Bible 1.md, updated 18 Nov 2026;
// only Jason changes a price or a plan). Pure: no Stripe, no database. These are the defaults:
// staff can change what each plan includes on Staff → Plans (plan_settings), and the app reads
// the merged result (applyPlanSettings). Prices live here and in Stripe.
//
// 19 Nov (Jason): a Free plan with no card (1 account, 100 replies, "Ask me first" only, no
// add-ons), Solo at 300 replies with auto-reply, Team at 6 accounts, and Business by call only.

export type PlanId = "free" | "solo" | "business" | "team";
/** The plans sold in Stripe (Free is no subscription at all). */
export type PaidPlanId = Exclude<PlanId, "free">;
export const PAID_PLAN_IDS: PaidPlanId[] = ["solo", "business", "team"];
export const PLAN_IDS: PlanId[] = ["free", ...PAID_PLAN_IDS];

export interface Plan {
  id: PlanId;
  name: string;
  /** US dollars a month. */
  monthlyUsd: number;
  /** US dollars a year (2 months free); null when there's no yearly price yet. */
  yearlyUsd: number | null;
  /** Connected social accounts included (more at EXTRAS.accountUsd each, no limit). */
  accounts: number;
  /** Businesses (brands) the organization may have; null is unlimited. */
  brands: number | null;
  /** AI replies a month ("about"). */
  replies: number;
  /** The most AI may cost us a month on this plan (the margin table's worst case). */
  aiCostCapUsd: number;
  /** Selling now (self-serve). Business is off sale: by call only (19 Nov). */
  forSale: boolean;
  features: {
    /** Waggle answers regular questions on its own, once the owner trusts it. */
    autoReply: boolean;
    /** Leads and complaints flagged to the owner. */
    leadsFlagged: boolean;
    /** Follow-ups for leads that go quiet (the owner's own message, on Zernio Sequences). */
    followUps: boolean;
    /** Team members and roles: on both paid plans above Solo. Solo is just the owner (18 Nov). */
    team: boolean;
  };
}

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    monthlyUsd: 0,
    yearlyUsd: null,
    accounts: 1,
    brands: 1,
    replies: 100,
    aiCostCapUsd: 2,
    forSale: true,
    features: { autoReply: false, leadsFlagged: false, followUps: false, team: false },
  },
  solo: {
    id: "solo",
    name: "Solo",
    monthlyUsd: 49,
    yearlyUsd: 490,
    accounts: 3,
    brands: 1,
    replies: 300,
    aiCostCapUsd: 6,
    forSale: true,
    // Auto-reply is the main reason to leave Free (Jason, 19 Nov).
    features: { autoReply: true, leadsFlagged: false, followUps: false, team: false },
  },
  business: {
    id: "business",
    // Shown as Team (Jason, 17 Nov); the id stays "business" so nothing stored changes.
    name: "Team",
    monthlyUsd: 99,
    yearlyUsd: 990,
    accounts: 6,
    brands: null,
    replies: 750,
    aiCostCapUsd: 15,
    forSale: true,
    features: { autoReply: true, leadsFlagged: true, followUps: true, team: true },
  },
  team: {
    id: "team",
    // Shown as Business (Jason, 17 Nov). 19 Nov: 10+ accounts, custom price, by call only (Book a
    // call); staff set the organization up by hand. Anyone already on the $199 price keeps it.
    name: "Business",
    monthlyUsd: 199,
    yearlyUsd: null,
    accounts: 10,
    brands: null,
    replies: 1500,
    aiCostCapUsd: 30,
    forSale: false,
    features: { autoReply: true, leadsFlagged: true, followUps: true, team: true },
  },
};

/** The plan to promote: the first step up from Free. */
export const PROMOTED_PLAN: PlanId = "solo";

export function isPlanId(v: unknown): v is PlanId {
  return typeof v === "string" && Object.hasOwn(PLANS, v);
}

/** A plan Stripe sells (lookup keys, org_billing, checkout). */
export function isPaidPlanId(v: unknown): v is PaidPlanId {
  return isPlanId(v) && v !== "free";
}

/** Business is sold after a call with Jason (19 Nov): the plan's button opens his booking page. */
export const BUSINESS_CALL_URL = "https://ro.am/jason-kulha/";

/**
 * 19 Nov: Free replaces the card-up-front trial, so no card is needed to start using Waggle.
 * Moving from Free to a paid plan pays at checkout, with no trial (Febron, 20 Nov). `days` stays
 * for subscriptions that started with the old 7-day trial.
 */
export const TRIAL = { days: 7, cardRequired: false } as const;

/** Extras, all self-serve. */
export const EXTRAS = {
  /** Added to any plan, each. */
  accountUsd: 10,
  /** One time; unused top-up replies carry over one month. */
  topUp: { usd: 15, replies: 200, carryOverMonths: 1 },
  /** Opt-in only, off by default, an email receipt every time. */
  autoTopUp: { maxPerMonth: 2 },
} as const;

/** The first 50 businesses get the $99 plan (shown as Team) at $79 a month for 6 months, then $99. */
export const FOUNDING = { plan: "business" as PaidPlanId, monthlyUsd: 79, months: 6, spots: 50 };

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
export function accountAllowance(plan: Plan, extraAccounts = 0): number {
  return plan.accounts + Math.max(0, Math.floor(extraAccounts));
}

/** Pure: whether one more account fits. */
export function canConnectAnother(connected: number, allowance: number): boolean {
  return connected < allowance;
}

/** Pure: AI replies this month, with top-ups (this month's and last month's unused carry-over). */
export function replyAllowance(
  plan: Plan,
  topUps: { thisMonth?: number; carriedReplies?: number } = {},
): number {
  return (
    plan.replies +
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

/** One plan_settings row: what staff changed on Staff → Plans (null = the default above). */
export interface PlanSettingsRow {
  plan: string;
  brands_limit: number | null;
  accounts: number | null;
  replies: number | null;
  team: boolean | null;
  auto_reply: boolean | null;
  leads_flagged: boolean | null;
  follow_ups: boolean | null;
  for_sale: boolean | null;
}

/**
 * Pure: the plans as the app uses them: the defaults with what staff set on Staff → Plans.
 * Brands keep plan_settings' meaning when a row exists (null is unlimited).
 */
export function applyPlanSettings(rows: PlanSettingsRow[]): Record<PlanId, Plan> {
  const out = structuredClone(PLANS) as Record<PlanId, Plan>;
  for (const r of rows) {
    if (!isPlanId(r.plan)) continue;
    const p = out[r.plan];
    p.brands = r.brands_limit;
    if (r.accounts !== null) p.accounts = r.accounts;
    if (r.replies !== null) p.replies = r.replies;
    if (r.for_sale !== null) p.forSale = r.for_sale;
    if (r.team !== null) p.features.team = r.team;
    if (r.auto_reply !== null) p.features.autoReply = r.auto_reply;
    if (r.leads_flagged !== null) p.features.leadsFlagged = r.leads_flagged;
    if (r.follow_ups !== null) p.features.followUps = r.follow_ups;
  }
  return out;
}

export interface PlanSettingsInput {
  accounts: number;
  replies: number;
  brands: number | null;
  team: boolean;
  autoReply: boolean;
  leadsFlagged: boolean;
  followUps: boolean;
  forSale: boolean;
}

/**
 * Pure: one plan's column of the Staff → Plans form (`<plan>.<field>`), checked. Errors say which
 * field and what's allowed.
 */
export function parsePlanSettings(
  plan: PlanId,
  get: (field: string) => FormDataEntryValue | null,
): { value: PlanSettingsInput } | { error: string } {
  const name = PLANS[plan].name;
  const whole = (field: string, label: string, min: number, max: number) => {
    const n = Number(String(get(field) ?? "").trim());
    return Number.isInteger(n) && n >= min && n <= max
      ? n
      : `${name}: ${label} must be a whole number from ${min} to ${max}.`;
  };
  // At least 1 of each: 0 replies would pause drafting (and start automatic top-ups) for every
  // organization on the plan at once.
  const accounts = whole("accounts", "accounts included", 1, 100);
  if (typeof accounts === "string") return { error: accounts };
  const replies = whole("replies", "AI replies a month", 1, 100000);
  if (typeof replies === "string") return { error: replies };
  const brands = parseBrandsLimit(get("brands"));
  if ("error" in brands) return { error: `${name}: ${brands.error}` };
  const on = (field: string) => get(field) === "on";
  return {
    value: {
      accounts,
      replies,
      brands: brands.limit,
      team: on("team"),
      autoReply: on("autoReply"),
      leadsFlagged: on("leadsFlagged"),
      followUps: on("followUps"),
      forSale: on("forSale"),
    },
  };
}

/** Pure: what a plan's card says it includes, from the plan as staff set it. */
export function planBullets(plan: Plan): string[] {
  const n = (v: number) => v.toLocaleString("en-US");
  const who =
    plan.brands === 1
      ? plan.features.team
        ? "1 business, with team members"
        : "1 business, just you"
      : plan.brands === null
        ? plan.features.team
          ? "Unlimited businesses and team members"
          : "Unlimited businesses, just you"
        : `${plan.brands} businesses${plan.features.team ? " and team members" : ", just you"}`;
  // Free has no add-ons (19 Nov); Business is 10 or more accounts, sized on a call.
  const accounts =
    plan.id === "free"
      ? `${n(plan.accounts)} account${plan.accounts === 1 ? "" : "s"}, no add-ons`
      : plan.id === "team" && !plan.forSale
        ? `${n(plan.accounts)}+ accounts`
        : `${n(plan.accounts)} accounts, then $${EXTRAS.accountUsd} each`;
  return [
    who,
    accounts,
    `About ${n(plan.replies)} AI replies a month`,
    plan.features.autoReply ? "Replies on its own, once you trust it" : "You approve every reply",
    ...(plan.features.leadsFlagged ? ["Leads and complaints flagged"] : []),
    ...(plan.features.followUps ? ["Follow-ups for leads that go quiet"] : []),
  ];
}
