// Analytics read shapes (T48). The adapter maps Zernio's responses into these; the app and the
// database only ever see these. Missing numbers become 0 only where Zernio means "none"; a post
// whose numbers aren't in yet keeps `syncStatus: "pending"` so the page can say so (never 0).

export interface MetricTotals {
  impressions: number;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  clicks: number;
  views: number;
  /** Percent: likes, comments, shares and saves over impressions (reach, then views, if none). */
  engagementRate: number;
}

export interface FollowerSummary {
  current: number;
  gained: number;
  byAccount: { accountId: string; platform: string; current: number; gained: number }[];
}

export interface DashboardDay {
  date: string;
  impressions: number;
  reach: number;
  engagement: number;
  views: number;
  followersGained: number;
}

export interface DashboardPost {
  postId: string;
  platform: string;
  publishedAt: string | null;
  metrics: MetricTotals;
}

/** `GET /v1/analytics/dashboard`: engagement that arrived in the window, plus its posts. */
export interface DashboardSummary {
  fromDate: string;
  toDate: string;
  totals: MetricTotals;
  previousTotals: MetricTotals | null;
  followers: FollowerSummary;
  previousFollowers: FollowerSummary | null;
  daily: DashboardDay[];
  topPosts: DashboardPost[];
  dataAsOf: string | null;
}

export type PostSyncStatus = "synced" | "pending" | "partial" | "unavailable";

/** One post on one platform, with its lifetime numbers (`GET /v1/analytics`). */
export interface ProviderPostMetrics {
  /** Zernio's analytics id for the post (the key for its timeline). */
  postId: string;
  /** The Zernio post id when Waggle (through Zernio) published it; null for external posts. */
  zernioPostId: string | null;
  platform: string;
  publishedAt: string | null;
  caption: string;
  permalink: string | null;
  thumbnailUrl: string | null;
  /** reel, carousel, photo, story, video, text */
  format: string;
  isExternal: boolean;
  syncStatus: PostSyncStatus;
  metrics: MetricTotals;
}

export interface FollowerSeries {
  accountId: string;
  points: { date: string; followers: number }[];
}

/** Best time to post: day 0 = Monday, hour in UTC. */
export interface BestTimeSlot {
  dayOfWeek: number;
  hourUtc: number;
  avgEngagement: number;
  postCount: number;
}

/** Share of followers per value, keyed by dimension (age, gender, city, country). */
export type Demographics = Record<string, { key: string; value: number }[]>;

/** Instagram followers online per hour (Meta doesn't document the hours' time zone). */
export interface OnlineFollowers {
  days: { endTime: string; hours: number[] }[];
}

export interface PostTimelinePoint {
  date: string;
  reach: number;
  impressions: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  views: number;
}
