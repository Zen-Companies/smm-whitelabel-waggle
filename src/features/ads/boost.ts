// Boost a post (T79, design "Posts · Ads"): the owner picks what they want, who sees it, a daily
// budget and how many days; Waggle sends Meta one boost (`POST /v1/ads/boost`) that Meta reviews
// before it runs. Money is whole units of the ad account's currency, billed by Meta, never us.

export const BOOST_GOALS = {
  reach: "More people see it",
  visits: "Visits to my site",
  messages: "Messages",
  leads: "Leads (a form)",
} as const;
export type BoostGoal = keyof typeof BOOST_GOALS;

export const MAX_BOOST_DAYS = 30;

export type BoostInput = {
  /** The Zernio post id. */
  postId: string;
  postPlatform: "facebook" | "instagram";
  adAccountId: string;
  goal: BoostGoal;
  linkUrl: string | null;
  leadFormId: string | null;
  /** ISO 3166-1 alpha-2. */
  country: string;
  ageMin: number;
  ageMax: number;
  daily: number;
  days: number;
};

type Parsed = { ok: true; value: BoostInput } | { ok: false; field: string; error: string };

const int = (v: FormDataEntryValue | null) => {
  const n = Number(String(v ?? "").trim());
  return Number.isInteger(n) ? n : NaN;
};

export function parseBoostForm(f: FormData, opts: { minDailyBudget: number | null }): Parsed {
  const [postId, platform] = String(f.get("post") ?? "").split("|");
  if (!postId || (platform !== "facebook" && platform !== "instagram")) {
    return { ok: false, field: "post", error: "Pick a post to boost." };
  }
  const adAccountId = String(f.get("adAccountId") ?? "");
  if (!adAccountId) return { ok: false, field: "adAccountId", error: "Pick an ad account." };
  const goal = String(f.get("goal") ?? "") as BoostGoal;
  if (!(goal in BOOST_GOALS)) return { ok: false, field: "goal", error: "Pick what you want." };

  const linkUrl = String(f.get("linkUrl") ?? "").trim();
  if (goal === "visits" && !/^https:\/\/\S+\.\S+/.test(linkUrl)) {
    return {
      ok: false,
      field: "linkUrl",
      error: "Add the page to send people to (starts with https://).",
    };
  }
  const leadFormId = String(f.get("leadFormId") ?? "");
  if (goal === "leads" && !leadFormId) {
    return {
      ok: false,
      field: "leadFormId",
      error: "Pick a lead form, or make one in Contacts → Ad leads.",
    };
  }
  const country = String(f.get("country") ?? "").toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) return { ok: false, field: "country", error: "Pick a country." };

  const ageMin = int(f.get("ageMin"));
  const ageMax = int(f.get("ageMax"));
  if (!(ageMin >= 18 && ageMax <= 65 && ageMin <= ageMax)) {
    return { ok: false, field: "age", error: "Ages go from 18 to 65, youngest first." };
  }
  const daily = int(f.get("daily"));
  const min = opts.minDailyBudget ?? 1;
  if (!(daily >= min)) {
    return {
      ok: false,
      field: "daily",
      error: `The daily budget has to be at least ${min}, in whole amounts.`,
    };
  }
  const days = int(f.get("days"));
  if (!(days >= 1 && days <= MAX_BOOST_DAYS)) {
    return { ok: false, field: "days", error: `Run it for 1 to ${MAX_BOOST_DAYS} days.` };
  }
  return {
    ok: true,
    value: {
      postId,
      postPlatform: platform,
      adAccountId,
      goal,
      linkUrl: goal === "visits" ? linkUrl : null,
      leadFormId: goal === "leads" ? leadFormId : null,
      country,
      ageMin,
      ageMax,
      daily,
      days,
    },
  };
}

/** The boost request (Meta shape: nested budget, schedule and targeting). */
export function toBoostBody(
  v: BoostInput,
  ctx: { connectionId: string; name: string; now: Date },
): Record<string, unknown> {
  const end = new Date(ctx.now.getTime() + v.days * 24 * 60 * 60 * 1000);
  const goal = {
    reach: "awareness",
    visits: "traffic",
    messages: "engagement",
    leads: "lead_generation",
  }[v.goal];
  return {
    postId: v.postId,
    accountId: ctx.connectionId,
    adAccountId: v.adAccountId,
    name: ctx.name.slice(0, 100),
    goal,
    budget: { amount: v.daily, type: "daily" },
    schedule: { startDate: ctx.now.toISOString(), endDate: end.toISOString() },
    targeting: { ageMin: v.ageMin, ageMax: v.ageMax, countries: [v.country] },
    ...(v.goal === "visits" ? { linkUrl: v.linkUrl, callToAction: "LEARN_MORE" } : {}),
    ...(v.goal === "messages"
      ? { callToAction: v.postPlatform === "instagram" ? "INSTAGRAM_MESSAGE" : "MESSAGE_PAGE" }
      : {}),
    ...(v.goal === "leads" ? { leadGenFormId: v.leadFormId } : {}),
  };
}

export const money = (amount: number, currency: string) => {
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
};

/**
 * Safety rule (design "Safety rules"): pause a boost whose clicks cost more than the cap today,
 * once it has 5 clicks (so one pricey early click doesn't stop it). Checked hourly.
 */
export function cpcRuleBody(input: {
  connectionId: string;
  adAccountId: string;
  maxCpc: number;
  currency: string;
}): Record<string, unknown> {
  return {
    name: `Pause a boost if a click costs more than ${money(input.maxCpc, input.currency)}`,
    accountId: input.connectionId,
    adAccountId: input.adAccountId,
    level: "campaign",
    conditions: {
      all: [
        { metric: "cpc", window: "today", op: ">", value: input.maxCpc },
        { metric: "clicks", window: "today", op: ">=", value: 5 },
      ],
    },
    actions: [{ type: "pause" }],
    schedule: { everyMinutes: 60 },
    cooldownMinutes: 1440,
    enabled: true,
  };
}
