import type {
  BestTimeSlot,
  DashboardSummary,
  Demographics,
  FollowerSeries,
  MetricTotals,
  OnlineFollowers,
  PostTimelinePoint,
  ProviderPostMetrics,
} from "./analytics-types";

// Steady sample analytics for SOCIAL_PROVIDER_MODE=mock (rule 14): the same profile and dates
// always give the same numbers, so local demos and tests are repeatable. Nothing leaves the process.

function seeded(seed: string) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0;
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

const DAY = 86_400_000;
const days = (from: string, to: string) => {
  const out: string[] = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += DAY) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
};

function totals(rand: () => number, scale: number): MetricTotals {
  const reach = Math.round(scale * (0.8 + rand() * 0.4));
  const impressions = Math.round(reach * (2 + rand()));
  const likes = Math.round(reach * 0.05);
  const comments = Math.round(reach * 0.006);
  const shares = Math.round(reach * 0.004);
  const saves = Math.round(reach * 0.007);
  return {
    impressions,
    reach,
    likes,
    comments,
    shares,
    saves,
    clicks: Math.round(reach * 0.015),
    views: Math.round(reach * 1.4),
    engagementRate: Math.round(((likes + comments + shares + saves) / impressions) * 1000) / 10,
  };
}

export function mockDashboard(input: {
  profileId: string;
  fromDate: string;
  toDate: string;
  platform?: string;
}): DashboardSummary {
  const share = input.platform === "facebook" ? 0.3 : input.platform === "instagram" ? 0.7 : 1;
  const rand = seeded(`${input.profileId}:${input.fromDate}:${input.platform ?? "all"}`);
  const list = days(input.fromDate, input.toDate);
  const daily = list.map((date) => {
    const reach = Math.round((420 + rand() * 360) * share);
    return {
      date,
      impressions: Math.round(reach * 2.3),
      reach,
      engagement: Math.round(reach * 0.07),
      views: Math.round(reach * 1.4),
      followersGained: Math.round(rand() * 6 * share),
    };
  });
  const sum = (k: "reach" | "impressions" | "views") => daily.reduce((a, d) => a + d[k], 0);
  const t = totals(rand, sum("reach"));
  const now: MetricTotals = {
    ...t,
    reach: sum("reach"),
    impressions: sum("impressions"),
    views: sum("views"),
  };
  const gained = daily.reduce((a, d) => a + d.followersGained, 0);
  const accounts = [
    {
      accountId: "mock_ig",
      platform: "instagram",
      current: 2841,
      gained: Math.round(gained * 0.85),
    },
    {
      accountId: "mock_fb",
      platform: "facebook",
      current: 1207,
      gained: Math.round(gained * 0.15),
    },
  ].filter((a) => !input.platform || a.platform === input.platform);
  return {
    fromDate: input.fromDate,
    toDate: input.toDate,
    totals: now,
    previousTotals: totals(rand, now.reach * 0.9),
    followers: {
      current: accounts.reduce((a, x) => a + x.current, 0),
      gained: accounts.reduce((a, x) => a + x.gained, 0),
      byAccount: accounts,
    },
    previousFollowers: null,
    daily,
    topPosts: mockPosts(input.profileId, input.fromDate, input.toDate)
      .filter((p) => !input.platform || p.platform === input.platform)
      .sort((a, b) => b.metrics.reach - a.metrics.reach)
      .slice(0, 5)
      .map((p) => ({
        postId: p.postId,
        platform: p.platform,
        publishedAt: p.publishedAt,
        metrics: p.metrics,
      })),
    dataAsOf: new Date(Date.parse(`${input.toDate}T00:00:00Z`)).toISOString(),
  };
}

const CAPTIONS = [
  "Fresh ube pandesal, every Saturday 7 AM",
  "Halloween hours: open till midnight",
  "Meet Ate Rose, our head baker",
  "New: calamansi cheesecake",
  "Rainy day? We deliver until 9 PM",
  "Weekend brunch set is back",
];
const FORMATS = ["reel", "photo", "carousel", "photo", "story", "photo"];

/** Six posts a month, spread over the window. */
export function mockPosts(
  profileId: string,
  fromDate: string,
  toDate: string,
): ProviderPostMetrics[] {
  const list = days(fromDate, toDate);
  const out: ProviderPostMetrics[] = [];
  // Every 5th calendar day, so overlapping windows return the same posts.
  for (const date of list) {
    const day = Math.floor(Date.parse(`${date}T00:00:00Z`) / DAY);
    if (day % 5 !== 0) continue;
    const n = day / 5;
    const rand = seeded(`${profileId}:${date}`);
    const platform = n % 3 === 1 ? "facebook" : "instagram";
    const postId = `mock_post_${date}`;
    out.push({
      postId,
      zernioPostId: n % 4 === 2 ? null : `mock_zpost_${date}`,
      platform,
      publishedAt: `${date}T08:00:00.000Z`,
      caption: CAPTIONS[n % CAPTIONS.length],
      permalink: `https://www.${platform}.com/p/${postId}`,
      thumbnailUrl: null,
      format: FORMATS[n % FORMATS.length],
      isExternal: n % 4 === 2,
      syncStatus: "synced",
      metrics: totals(rand, 900 + rand() * 4000),
    });
  }
  return out;
}

export function mockFollowerSeries(fromDate: string, toDate: string): FollowerSeries[] {
  const list = days(fromDate, toDate);
  return [
    {
      accountId: "mock_ig",
      points: list.map((date, i) => ({
        date,
        followers: 2745 + Math.round((i * 96) / list.length),
      })),
    },
    {
      accountId: "mock_fb",
      points: list.map((date, i) => ({
        date,
        followers: 1189 + Math.round((i * 18) / list.length),
      })),
    },
  ];
}

export const MOCK_BEST_TIMES: BestTimeSlot[] = [
  { dayOfWeek: 5, hourUtc: 0, avgEngagement: 412, postCount: 6 },
  { dayOfWeek: 2, hourUtc: 11, avgEngagement: 280, postCount: 4 },
  { dayOfWeek: 3, hourUtc: 12, avgEngagement: 251, postCount: 5 },
];

export function mockDemographics(platform: string): Demographics {
  const cities = [
    { key: "Quezon City, Metro Manila", value: 310 },
    { key: "Manila, Metro Manila", value: 180 },
    { key: "Pasig, Metro Manila", value: 110 },
  ];
  const countries = [
    { key: "PH", value: 910 },
    { key: "US", value: 30 },
    { key: "AE", value: 20 },
  ];
  if (platform === "facebook") return { city: cities, country: countries };
  return {
    age: [
      { key: "25-34", value: 380 },
      { key: "18-24", value: 240 },
      { key: "35-44", value: 210 },
      { key: "45-54", value: 100 },
      { key: "55-64", value: 50 },
      { key: "13-17", value: 20 },
    ],
    gender: [
      { key: "F", value: 640 },
      { key: "M", value: 340 },
      { key: "U", value: 20 },
    ],
    city: cities,
    country: countries,
  };
}

export function mockOnlineFollowers(): OnlineFollowers {
  const hours = Array.from({ length: 24 }, (_, h) =>
    Math.round(
      400 * Math.exp(-(((h - 9) / 3.2) ** 2)) + 380 * Math.exp(-(((h - 19.5) / 2.5) ** 2)) + 40,
    ),
  );
  return {
    days: Array.from({ length: 28 }, (_, i) => ({
      endTime: new Date(Date.UTC(2026, 9, 1 + i)).toISOString(),
      hours: hours.map((v) => Math.round(v * (i % 7 >= 5 ? 1.2 : 1))),
    })),
  };
}

export function mockTimeline(postId: string): PostTimelinePoint[] {
  const rand = seeded(postId);
  let reach = 0;
  return Array.from({ length: 14 }, (_, i) => {
    reach += Math.round((i < 2 ? 2000 : 300 / (i + 1)) * (0.8 + rand() * 0.4));
    return {
      date: new Date(Date.UTC(2026, 9, 1 + i)).toISOString().slice(0, 10),
      reach,
      impressions: reach * 2,
      likes: Math.round(reach * 0.06),
      comments: Math.round(reach * 0.004),
      shares: Math.round(reach * 0.003),
      saves: Math.round(reach * 0.006),
      views: Math.round(reach * 1.5),
    };
  });
}
