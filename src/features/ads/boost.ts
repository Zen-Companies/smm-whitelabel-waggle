// Boost a post (T79, design "Posts · Ads"): the owner picks what they want, who sees it, a daily
// budget and how many days; Waggle sends the network one boost (`POST /v1/ads/boost`) that it
// reviews before it runs. Money is whole units of the ad account's currency, billed by the
// network, never us. T79b adds LinkedIn (Company Page posts) and Pinterest (Pins).

import { AD_NETWORKS, networkOfPlatform, type AdNetwork } from "./networks";

export const BOOST_GOALS = {
  reach: "More people see it",
  visits: "Visits to my site",
  engage: "Likes and comments",
  video: "Video views",
  messages: "Messages",
  leads: "Leads (a form)",
} as const;
export type BoostGoal = keyof typeof BOOST_GOALS;

export const MAX_BOOST_DAYS = 30;

export type BoostPlatform = "facebook" | "instagram" | "linkedin" | "pinterest";

export type BoostInput = {
  /** The Zernio post id. */
  postId: string;
  postPlatform: BoostPlatform;
  network: AdNetwork;
  adAccountId: string;
  goal: BoostGoal;
  linkUrl: string | null;
  leadFormId: string | null;
  /** ISO 3166-1 alpha-2. */
  country: string;
  /** Null where the network doesn't target by age (LinkedIn). */
  ageMin: number | null;
  ageMax: number | null;
  daily: number;
  days: number;
};

type Parsed = { ok: true; value: BoostInput } | { ok: false; field: string; error: string };

const int = (v: FormDataEntryValue | null) => {
  const n = Number(String(v ?? "").trim());
  return Number.isInteger(n) ? n : NaN;
};

/** The post field is `<zernio post id>|<platform>`; null when it isn't one we boost. */
export function readBoostPost(
  v: FormDataEntryValue | null,
): { postId: string; platform: BoostPlatform; network: AdNetwork } | null {
  const [postId, platform] = String(v ?? "").split("|");
  const network = platform ? networkOfPlatform(platform) : null;
  if (!postId || !network) return null;
  return { postId, platform: platform as BoostPlatform, network };
}

export function parseBoostForm(f: FormData, opts: { minDailyBudget: number }): Parsed {
  const post = readBoostPost(f.get("post"));
  if (!post) return { ok: false, field: "post", error: "Pick a post to boost." };
  const net = AD_NETWORKS[post.network];
  const adAccountId = String(f.get("adAccountId") ?? "");
  if (!adAccountId) return { ok: false, field: "adAccountId", error: "Pick an ad account." };
  const goal = String(f.get("goal") ?? "") as BoostGoal;
  if (!(net.goals as readonly string[]).includes(goal)) {
    return { ok: false, field: "goal", error: "Pick what you want." };
  }

  // Only Meta takes a separate link; LinkedIn and Pinterest send people to the post's own link.
  const linkUrl = String(f.get("linkUrl") ?? "").trim();
  const needsLink = goal === "visits" && post.network === "meta";
  if (needsLink && !/^https:\/\/\S+\.\S+/.test(linkUrl)) {
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

  let ageMin: number | null = null;
  let ageMax: number | null = null;
  if (net.ages) {
    ageMin = int(f.get("ageMin"));
    ageMax = int(f.get("ageMax"));
    if (!(ageMin >= 18 && ageMax <= 65 && ageMin <= ageMax)) {
      return { ok: false, field: "age", error: "Ages go from 18 to 65, youngest first." };
    }
  }
  const daily = int(f.get("daily"));
  const min = opts.minDailyBudget;
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
      postId: post.postId,
      postPlatform: post.platform,
      network: post.network,
      adAccountId,
      goal,
      linkUrl: needsLink ? linkUrl : null,
      leadFormId: goal === "leads" ? leadFormId : null,
      country,
      ageMin,
      ageMax,
      daily,
      days,
    },
  };
}

/**
 * The boost request (nested budget, schedule and targeting). `accountId` is the Meta ads
 * connection on Meta (T79a), and the posting account (LinkedIn Page, Pinterest) elsewhere:
 * docs.zernio.com/platforms/linkedin-ads/boost.
 */
export function toBoostBody(
  v: BoostInput,
  ctx: { accountId: string; name: string; now: Date },
): Record<string, unknown> {
  const end = new Date(ctx.now.getTime() + v.days * 24 * 60 * 60 * 1000);
  const goal = {
    reach: "awareness",
    visits: "traffic",
    engage: "engagement",
    video: "video_views",
    messages: "engagement",
    leads: "lead_generation",
  }[v.goal];
  return {
    postId: v.postId,
    accountId: ctx.accountId,
    adAccountId: v.adAccountId,
    name: ctx.name.slice(0, 100),
    goal,
    budget: { amount: v.daily, type: "daily" },
    schedule: { startDate: ctx.now.toISOString(), endDate: end.toISOString() },
    targeting: {
      ...(v.ageMin !== null && v.ageMax !== null ? { ageMin: v.ageMin, ageMax: v.ageMax } : {}),
      countries: [v.country],
    },
    ...(v.linkUrl ? { linkUrl: v.linkUrl, callToAction: "LEARN_MORE" } : {}),
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
