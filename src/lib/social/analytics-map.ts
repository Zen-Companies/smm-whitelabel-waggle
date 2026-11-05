import { z } from "zod";
import type {
  BestTimeSlot,
  DashboardSummary,
  Demographics,
  FollowerSeries,
  FollowerSummary,
  MetricTotals,
  OnlineFollowers,
  PostTimelinePoint,
  ProviderPostMetrics,
} from "./analytics-types";

// Zernio analytics responses → our shapes (T48). Pure, so it is unit tested. Every field is
// optional in Zernio's types, so the schemas are lenient and fill gaps here, in one place.

const num = z
  .number()
  .finite()
  .nullish()
  .transform((v) => v ?? 0);
const str = z.string().nullish();

const totalsSchema = z
  .object({
    impressions: num,
    reach: num,
    likes: num,
    comments: num,
    shares: num,
    saves: num,
    clicks: num,
    views: num,
    engagementRate: num,
  })
  .partial()
  .nullish();

export function toTotals(raw: unknown): MetricTotals {
  const t = totalsSchema.parse(raw) ?? {};
  return {
    impressions: t.impressions ?? 0,
    reach: t.reach ?? 0,
    likes: t.likes ?? 0,
    comments: t.comments ?? 0,
    shares: t.shares ?? 0,
    saves: t.saves ?? 0,
    clicks: t.clicks ?? 0,
    views: t.views ?? 0,
    engagementRate: t.engagementRate ?? 0,
  };
}

const followersSchema = z
  .object({
    current: num,
    gained: num,
    byAccount: z
      .array(z.object({ accountId: str, platform: str, current: num, gained: num }))
      .nullish(),
  })
  .partial()
  .nullish();

function toFollowers(raw: unknown): FollowerSummary {
  const f = followersSchema.parse(raw) ?? {};
  return {
    current: f.current ?? 0,
    gained: f.gained ?? 0,
    byAccount: (f.byAccount ?? [])
      .filter((a) => a.accountId)
      .map((a) => ({
        accountId: a.accountId!,
        platform: a.platform ?? "",
        current: a.current,
        gained: a.gained,
      })),
  };
}

const dashboardSchema = z.object({
  dateRange: z.object({ fromDate: str, toDate: str }).partial().nullish(),
  totals: z.unknown(),
  previousTotals: z.unknown().optional(),
  followers: z.unknown(),
  previousFollowers: z.unknown().optional(),
  daily: z
    .array(
      z.object({
        date: z.string(),
        impressions: num,
        reach: num,
        engagement: num,
        views: num,
        followersGained: num,
      }),
    )
    .nullish(),
  topPosts: z
    .array(
      z.object({ postId: str, platform: str, publishedAt: str, metrics: z.unknown().optional() }),
    )
    .nullish(),
  dataAsOf: str,
});

export function toDashboard(
  raw: unknown,
  window: { fromDate: string; toDate: string },
): DashboardSummary {
  const d = dashboardSchema.parse(raw);
  return {
    fromDate: d.dateRange?.fromDate ?? window.fromDate,
    toDate: d.dateRange?.toDate ?? window.toDate,
    totals: toTotals(d.totals),
    previousTotals: d.previousTotals == null ? null : toTotals(d.previousTotals),
    followers: toFollowers(d.followers),
    previousFollowers: d.previousFollowers == null ? null : toFollowers(d.previousFollowers),
    daily: (d.daily ?? []).map((x) => ({ ...x })),
    topPosts: (d.topPosts ?? [])
      .filter((p) => p.postId)
      .map((p) => ({
        postId: p.postId!,
        platform: p.platform ?? "",
        publishedAt: p.publishedAt ?? null,
        metrics: toTotals(p.metrics),
      })),
    dataAsOf: d.dataAsOf ?? null,
  };
}

/** reel, story, carousel, video, photo or text, from Zernio's media fields. */
export function postFormat(mediaType?: string | null, productType?: string | null): string {
  const product = (productType ?? "").toUpperCase();
  if (product.includes("REEL")) return "reel";
  if (product.includes("STORY")) return "story";
  switch (mediaType) {
    case "carousel":
      return "carousel";
    case "video":
    case "gif":
      return "video";
    case "image":
      return "photo";
    case "text":
      return "text";
    default:
      return "post";
  }
}

const postListSchema = z.object({
  posts: z
    .array(
      z.object({
        _id: str,
        latePostId: str,
        content: str,
        publishedAt: str,
        analytics: z.unknown().optional(),
        platforms: z.array(z.object({ syncStatus: str }).partial()).nullish(),
        platform: str,
        platformPostUrl: str,
        isExternal: z.boolean().nullish(),
        thumbnailUrl: str,
        mediaType: str,
        mediaProductType: str,
      }),
    )
    .nullish(),
  pagination: z.object({ page: num, pages: num }).partial().nullish(),
});

const SYNC = new Set(["synced", "pending", "partial", "unavailable"]);

export function toPostList(raw: unknown): { posts: ProviderPostMetrics[]; pages: number } {
  const d = postListSchema.parse(raw);
  const posts = (d.posts ?? [])
    .filter((p) => p._id && p.platform)
    .map((p): ProviderPostMetrics => {
      const status = p.platforms?.find((x) => x.syncStatus)?.syncStatus ?? "synced";
      return {
        postId: p._id!,
        zernioPostId: p.latePostId ?? null,
        platform: p.platform!,
        publishedAt: p.publishedAt ?? null,
        caption: p.content ?? "",
        permalink: p.platformPostUrl?.startsWith("https://") ? p.platformPostUrl : null,
        thumbnailUrl: p.thumbnailUrl?.startsWith("https://") ? p.thumbnailUrl : null,
        format: postFormat(p.mediaType, p.mediaProductType),
        isExternal: p.isExternal ?? p.latePostId == null,
        syncStatus: (SYNC.has(status) ? status : "synced") as ProviderPostMetrics["syncStatus"],
        metrics: toTotals(p.analytics),
      };
    });
  return { posts, pages: d.pagination?.pages ?? 1 };
}

const followerStatsSchema = z.object({
  stats: z.record(z.string(), z.array(z.object({ date: str, followers: num }))).nullish(),
});

export function toFollowerSeries(raw: unknown): FollowerSeries[] {
  const d = followerStatsSchema.parse(raw);
  return Object.entries(d.stats ?? {}).map(([accountId, points]) => ({
    accountId,
    points: points
      .filter((p) => p.date)
      .map((p) => ({ date: p.date!.slice(0, 10), followers: p.followers }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  }));
}

const bestTimeSchema = z.object({
  slots: z
    .array(z.object({ day_of_week: num, hour: num, avg_engagement: num, post_count: num }))
    .nullish(),
});

export function toBestTimes(raw: unknown): BestTimeSlot[] {
  return (bestTimeSchema.parse(raw).slots ?? [])
    .filter((s) => s.day_of_week >= 0 && s.day_of_week <= 6 && s.hour >= 0 && s.hour <= 23)
    .map((s) => ({
      dayOfWeek: s.day_of_week,
      hourUtc: s.hour,
      avgEngagement: s.avg_engagement,
      postCount: s.post_count,
    }))
    .sort((a, b) => b.avgEngagement - a.avgEngagement);
}

const demographicsSchema = z.object({
  demographics: z
    .record(z.string(), z.array(z.object({ dimension: str, value: num })).nullish())
    .nullish(),
});

export function toDemographics(raw: unknown): Demographics | null {
  const d = demographicsSchema.parse(raw).demographics;
  if (!d) return null;
  const out: Demographics = {};
  for (const [dimension, rows] of Object.entries(d)) {
    const clean = (rows ?? [])
      .filter((r) => r.dimension)
      .map((r) => ({ key: r.dimension!, value: r.value }))
      .sort((a, b) => b.value - a.value);
    if (clean.length) out[dimension] = clean;
  }
  return Object.keys(out).length ? out : null;
}

const onlineSchema = z.object({
  days: z.array(z.object({ endTime: str, hours: z.record(z.string(), num).nullish() })).nullish(),
});

export function toOnlineFollowers(raw: unknown): OnlineFollowers | null {
  const days = (onlineSchema.parse(raw).days ?? [])
    .filter((d) => d.endTime && d.hours)
    .map((d) => ({
      endTime: d.endTime!,
      hours: Array.from({ length: 24 }, (_, h) => d.hours?.[String(h)] ?? 0),
    }));
  return days.length ? { days } : null;
}

const timelineSchema = z.object({
  timeline: z
    .array(
      z.object({
        date: str,
        reach: num,
        impressions: num,
        likes: num,
        comments: num,
        shares: num,
        saves: num,
        views: num,
      }),
    )
    .nullish(),
});

/** Sums the platforms per day (a post sent to two platforms has two rows a day). */
export function toTimeline(raw: unknown): PostTimelinePoint[] {
  const byDate = new Map<string, PostTimelinePoint>();
  for (const p of timelineSchema.parse(raw).timeline ?? []) {
    if (!p.date) continue;
    const date = p.date.slice(0, 10);
    const cur = byDate.get(date) ?? {
      date,
      reach: 0,
      impressions: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      saves: 0,
      views: 0,
    };
    for (const k of [
      "reach",
      "impressions",
      "likes",
      "comments",
      "shares",
      "saves",
      "views",
    ] as const) {
      cur[k] += p[k];
    }
    byDate.set(date, cur);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}
