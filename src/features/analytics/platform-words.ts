import type { MetricTotals } from "@/lib/social/analytics-types";

// Insights "By platform" (T76, design "Analytics · every platform"): each platform's numbers in
// the words its own app uses, only for what it shares (docs.zernio.com/platforms/<id>/analytics).

export type PlatformMetric = { label: string; value: number; delta?: boolean };

type Field = keyof Omit<MetricTotals, "engagementRate">;

const WORDS: Record<string, { followers?: string; fields: [Field, string][] }> = {
  instagram: {
    followers: "Followers",
    fields: [["reach", "Reach"], ["views", "Views"], ["likes", "Likes"], ["comments", "Comments"], ["saves", "Saves"], ["shares", "Shares"]],
  },
  facebook: {
    followers: "Followers",
    fields: [["impressions", "Views"], ["likes", "Reactions"], ["comments", "Comments"], ["shares", "Shares"], ["clicks", "Clicks"]],
  },
  tiktok: {
    followers: "Followers",
    fields: [["views", "Views"], ["likes", "Likes"], ["comments", "Comments"], ["shares", "Shares"]],
  },
  youtube: {
    followers: "Subscribers",
    fields: [["views", "Views"], ["likes", "Likes"], ["comments", "Comments"]],
  },
  linkedin: {
    fields: [["impressions", "Impressions"], ["likes", "Reactions"], ["comments", "Comments"], ["shares", "Reposts"]],
  },
  threads: {
    fields: [["views", "Views"], ["likes", "Likes"], ["comments", "Replies"], ["shares", "Reposts"]],
  },
  pinterest: {
    followers: "Followers",
    fields: [["impressions", "Impressions"], ["saves", "Saves"], ["clicks", "Pin clicks"]],
  },
  bluesky: {
    fields: [["likes", "Likes"], ["comments", "Replies"], ["shares", "Reposts"]],
  },
  twitter: {
    fields: [["impressions", "Impressions"], ["likes", "Likes"], ["comments", "Replies"], ["shares", "Reposts"]],
  },
};

/** Platforms that share no numbers with apps at all. */
export const NO_NUMBERS = new Set(["telegram", "whatsapp", "discord", "snapchat", "reddit"]);

/** One platform's line: its own words; `followersGained` null when the platform has no count. */
export function platformLine(
  platform: string,
  totals: MetricTotals,
  followersGained: number | null,
): PlatformMetric[] {
  const w = WORDS[platform];
  if (!w || NO_NUMBERS.has(platform)) return [];
  const out: PlatformMetric[] = w.fields.map(([f, label]) => ({ label, value: totals[f] }));
  if (w.followers && followersGained !== null) {
    out.push({ label: w.followers, value: followersGained, delta: true });
  }
  return out;
}

/** Google Business Profile's performance report (`/v1/analytics/googlebusiness/performance`). */
export function googleBusinessLine(metrics: Record<string, number>): PlatformMetric[] {
  const m = (k: string) => metrics[k] ?? 0;
  const views =
    m("BUSINESS_IMPRESSIONS_DESKTOP_MAPS") +
    m("BUSINESS_IMPRESSIONS_MOBILE_MAPS") +
    m("BUSINESS_IMPRESSIONS_DESKTOP_SEARCH") +
    m("BUSINESS_IMPRESSIONS_MOBILE_SEARCH");
  const out: PlatformMetric[] = [
    { label: "Profile views", value: views },
    { label: "Calls", value: m("CALL_CLICKS") },
    { label: "Directions", value: m("BUSINESS_DIRECTION_REQUESTS") },
    { label: "Website clicks", value: m("WEBSITE_CLICKS") },
  ];
  if (m("BUSINESS_CONVERSATIONS")) out.push({ label: "Messages", value: m("BUSINESS_CONVERSATIONS") });
  if (m("BUSINESS_BOOKINGS")) out.push({ label: "Bookings", value: m("BUSINESS_BOOKINGS") });
  if (m("BUSINESS_FOOD_ORDERS")) out.push({ label: "Food orders", value: m("BUSINESS_FOOD_ORDERS") });
  return out;
}
