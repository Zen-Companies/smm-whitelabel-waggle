import { z } from "zod";
import type {
  BestTimeSlot,
  DashboardSummary,
  Demographics,
  OnlineFollowers,
  PostTimelinePoint,
} from "@/lib/social/analytics-types";

// The jsonb the sync job stores (T48), checked again on the way out: a snapshot that doesn't
// match is treated as missing, never trusted blindly.

const num = z.number().finite();

const totals = z.object({
  impressions: num,
  reach: num,
  likes: num,
  comments: num,
  shares: num,
  saves: num,
  clicks: num,
  views: num,
  engagementRate: num,
});

const followerSummary = z.object({
  current: num,
  gained: num,
  byAccount: z.array(
    z.object({ accountId: z.string(), platform: z.string(), current: num, gained: num }),
  ),
});

export const dashboardSchema: z.ZodType<DashboardSummary> = z.object({
  fromDate: z.string(),
  toDate: z.string(),
  totals,
  previousTotals: totals.nullable(),
  followers: followerSummary,
  previousFollowers: followerSummary.nullable(),
  daily: z.array(
    z.object({
      date: z.string(),
      impressions: num,
      reach: num,
      engagement: num,
      views: num,
      followersGained: num,
    }),
  ),
  topPosts: z.array(
    z.object({
      postId: z.string(),
      platform: z.string(),
      publishedAt: z.string().nullable(),
      metrics: totals,
    }),
  ),
  dataAsOf: z.string().nullable(),
});

export interface FollowersSnapshot {
  accounts: {
    socialAccountId: string | null;
    platform: string | null;
    username: string | null;
    points: { date: string; followers: number }[];
  }[];
}

export const followersSchema: z.ZodType<FollowersSnapshot> = z.object({
  accounts: z.array(
    z.object({
      socialAccountId: z.string().nullable(),
      platform: z.string().nullable(),
      username: z.string().nullable(),
      points: z.array(z.object({ date: z.string(), followers: num })),
    }),
  ),
});

export const bestTimeSchema: z.ZodType<{ slots: BestTimeSlot[] }> = z.object({
  slots: z.array(
    z.object({
      dayOfWeek: z.number().int().min(0).max(6),
      hourUtc: z.number().int().min(0).max(23),
      avgEngagement: num,
      postCount: num,
    }),
  ),
});

export interface AudienceSnapshot {
  platform: string;
  username: string | null;
  demographics: Demographics | null;
  online: OnlineFollowers | null;
}

export const audienceSchema: z.ZodType<AudienceSnapshot> = z.object({
  platform: z.string(),
  username: z.string().nullable(),
  demographics: z.record(z.string(), z.array(z.object({ key: z.string(), value: num }))).nullable(),
  online: z
    .object({ days: z.array(z.object({ endTime: z.string(), hours: z.array(num) })) })
    .nullable(),
});

export const timelineSchema: z.ZodType<PostTimelinePoint[]> = z.array(
  z.object({
    date: z.string(),
    reach: num,
    impressions: num,
    likes: num,
    comments: num,
    shares: num,
    saves: num,
    views: num,
  }),
);

/** Parsed data, or null when it doesn't match. */
export function parseOrNull<T>(schema: z.ZodType<T>, data: unknown): T | null {
  const parsed = schema.safeParse(data);
  return parsed.success ? parsed.data : null;
}
