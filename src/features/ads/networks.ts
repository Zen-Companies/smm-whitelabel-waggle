// The ad networks Posts → Ads can boost on (T79b). Only networks whose ads connection shows no
// partner-branded screen are built: Meta (T79a), and LinkedIn and Pinterest, whose ads
// connection reuses the brand's posting sign-in with no second screen
// (docs.zernio.com/platforms/linkedin-ads, /platforms/pinterest-ads). The rest sign in through
// the partner's own app and stay Coming soon (whitelabel rule, 13 Nov).

import type { BoostGoal } from "./boost";

export const AD_NETWORKS = {
  meta: {
    label: "Meta",
    connection: "metaads",
    posting: ["facebook", "instagram"],
    goals: ["reach", "visits", "messages", "leads"],
    ages: true,
    /** Network floor (USD) when the ad account doesn't state its own minimum. */
    minDailyUsd: 1,
  },
  linkedin: {
    label: "LinkedIn",
    connection: "linkedinads",
    posting: ["linkedin"],
    goals: ["reach", "visits", "engage", "video"],
    // LinkedIn targets by country and B2B facets; boost ignores ages.
    ages: false,
    minDailyUsd: 10,
  },
  pinterest: {
    label: "Pinterest",
    connection: "pinterestads",
    posting: ["pinterest"],
    goals: ["reach", "visits", "engage", "video"],
    ages: true,
    minDailyUsd: 5,
  },
} as const satisfies Record<
  string,
  {
    label: string;
    connection: string;
    posting: readonly string[];
    goals: readonly BoostGoal[];
    ages: boolean;
    minDailyUsd: number;
  }
>;

export type AdNetwork = keyof typeof AD_NETWORKS;
export const AD_NETWORK_IDS = Object.keys(AD_NETWORKS) as AdNetwork[];

/**
 * Connected in Settings → Accounts (18 Nov: the partner's own sign-in, after Waggle's "Before you
 * connect" note). Boosting posts on them from Waggle isn't built yet.
 */
export const ADS_ELSEWHERE = [
  { label: "Google Ads", connection: "googleads" },
  { label: "TikTok Ads", connection: "tiktokads" },
  { label: "Reddit Ads", connection: "redditads" },
  { label: "Microsoft Ads", connection: "microsoftads" },
  { label: "X Ads", connection: "xads" },
] as const;

export const isAdNetwork = (v: unknown): v is AdNetwork =>
  typeof v === "string" && Object.hasOwn(AD_NETWORKS, v);

/** The network a posting platform's posts are boosted on. */
export function networkOfPlatform(platform: string): AdNetwork | null {
  return (
    AD_NETWORK_IDS.find((n) => (AD_NETWORKS[n].posting as readonly string[]).includes(platform)) ??
    null
  );
}

/** The network an ads connection (`metaads`, `linkedinads`, ...) belongs to. */
export function networkOfConnection(platform: string): AdNetwork | null {
  return AD_NETWORK_IDS.find((n) => AD_NETWORKS[n].connection === platform) ?? null;
}

/** The network a campaign's `platform` (facebook, instagram, linkedin, pinterest) belongs to. */
export const networkOfCampaign = networkOfPlatform;

/**
 * The smallest daily budget to accept: the ad account's own minimum when it states one,
 * otherwise the network's published floor in USD, or 1 in any other currency (the network
 * refuses anything lower and we show its answer).
 */
export function minDailyFor(
  network: AdNetwork,
  account: { minDailyBudget: number | null; currency: string },
): number {
  if (account.minDailyBudget !== null) return account.minDailyBudget;
  return account.currency === "USD" ? AD_NETWORKS[network].minDailyUsd : 1;
}
