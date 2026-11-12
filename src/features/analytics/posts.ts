import type { PostTimelinePoint } from "@/lib/social/analytics-types";
import { formatName, shortDate } from "./format";
import { platformLabel } from "@/lib/social/platforms";

// Posts (T50): filtering, sorting, the CSV and a post's first 14 days. Pure.

export interface PostMetricRow {
  id: string;
  providerPostId: string;
  platform: string;
  zernioPostId: string | null;
  publishedAt: string | null;
  caption: string;
  permalink: string | null;
  thumbnailUrl: string | null;
  format: string;
  /** Published through Waggle (its Zernio post id is one of our posts). */
  madeInWaggle: boolean;
  syncStatus: string;
  reach: number;
  impressions: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  clicks: number;
  views: number;
  engagementRate: number;
}

export const MADE_FILTERS = [
  { key: "all", label: "All posts" },
  { key: "waggle", label: "Made in Waggle" },
  { key: "platform", label: "Posted on the platform" },
] as const;
export type MadeFilter = (typeof MADE_FILTERS)[number]["key"];

export const TYPE_FILTERS = [
  { key: "any", label: "Any type" },
  { key: "reel", label: "Reels" },
  { key: "photo", label: "Photos" },
  { key: "carousel", label: "Carousels" },
  { key: "story", label: "Stories" },
] as const;
export type TypeFilter = (typeof TYPE_FILTERS)[number]["key"];

export const SORTS = [
  { key: "reach", label: "Reached" },
  { key: "likes", label: "Likes" },
  { key: "comments", label: "Comments" },
  { key: "shares", label: "Shares" },
  { key: "saves", label: "Saves" },
  { key: "engaged", label: "Engaged" },
] as const;
export type SortKey = (typeof SORTS)[number]["key"];
export type SortDir = "asc" | "desc";

export const parseMade = (v: string | undefined): MadeFilter =>
  MADE_FILTERS.find((f) => f.key === v)?.key ?? "all";
export const parseType = (v: string | undefined): TypeFilter =>
  TYPE_FILTERS.find((f) => f.key === v)?.key ?? "any";
export const parseSort = (v: string | undefined): SortKey =>
  SORTS.find((s) => s.key === v)?.key ?? "reach";
export const parseDir = (v: string | undefined): SortDir => (v === "asc" ? "asc" : "desc");

/** Numbers not in yet: shown as "…", never 0. */
export const isPending = (p: Pick<PostMetricRow, "syncStatus">) => p.syncStatus === "pending";

/** Likes, comments, shares and saves: what "best" means on the Overview. */
export const interactions = (p: PostMetricRow) => p.likes + p.comments + p.shares + p.saves;

function sortValue(p: PostMetricRow, key: SortKey): number {
  if (key === "engaged") return p.engagementRate;
  return p[key];
}

export function filterPosts(posts: PostMetricRow[], made: MadeFilter, type: TypeFilter) {
  return posts.filter(
    (p) =>
      (made === "all" || (made === "waggle") === p.madeInWaggle) &&
      (type === "any" || p.format === type),
  );
}

/** Sorted by one column; posts still counting always go last. Newest first on ties. */
export function sortPosts(posts: PostMetricRow[], key: SortKey, dir: SortDir): PostMetricRow[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...posts].sort((a, b) => {
    if (isPending(a) !== isPending(b)) return isPending(a) ? 1 : -1;
    const diff = (sortValue(a, key) - sortValue(b, key)) * sign;
    if (diff) return diff;
    return (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "");
  });
}

/** Top posts of a period by likes, comments, shares and saves. */
export function bestPosts(posts: PostMetricRow[], count = 5): PostMetricRow[] {
  return posts
    .filter((p) => !isPending(p))
    .sort((a, b) => interactions(b) - interactions(a) || b.reach - a.reach)
    .slice(0, count);
}

/** "Reel · Instagram · Oct 26 · made in Waggle" */
export function postMeta(p: PostMetricRow): string {
  return [
    formatName(p.format),
    platformLabel(p.platform),
    p.publishedAt ? shortDate(p.publishedAt) : null,
    p.madeInWaggle ? "made in Waggle" : `posted on ${platformLabel(p.platform)}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** First line of a caption, or a stand-in. */
export function postTitle(caption: string): string {
  const first = caption.trim().split(/\r?\n/)[0] ?? "";
  return first || "Post without a caption";
}

/** One CSV field: quoted when needed; leading = + - @ neutralised so sheets don't run it. */
export function csvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return String(value);
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows.map((r) => r.map(csvField).join(",")).join("\r\n") + "\r\n";
}

export function postsCsv(posts: PostMetricRow[]): string {
  const header = [
    "Published",
    "Platform",
    "Type",
    "Made in",
    "Caption",
    "Link",
    "Reached",
    "Seen",
    "Likes",
    "Comments",
    "Shares",
    "Saves",
    "Clicks",
    "Plays",
    "Engagement rate %",
    "Numbers",
  ];
  return toCsv([
    header,
    ...posts.map((p) => {
      const n = (v: number) => (isPending(p) ? null : v);
      return [
        p.publishedAt,
        platformLabel(p.platform),
        formatName(p.format),
        p.madeInWaggle ? "Waggle" : platformLabel(p.platform),
        p.caption,
        p.permalink,
        n(p.reach),
        n(p.impressions),
        n(p.likes),
        n(p.comments),
        n(p.shares),
        n(p.saves),
        n(p.clicks),
        n(p.views),
        n(p.engagementRate),
        isPending(p) ? "Still counting" : "",
      ];
    }),
  ]);
}

/**
 * Reach by day 1..14 as running totals. Zernio's timeline may send per-day amounts or running
 * totals (VERIFY, TDD §7.7): a series that never goes down is read as running totals, anything
 * else is added up.
 */
export function cumulativeReach(points: PostTimelinePoint[]): number[] {
  const reach = [...points]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 14)
    .map((p) => p.reach);
  const running = reach.every((v, i) => i === 0 || v >= reach[i - 1]);
  if (running) return reach;
  let sum = 0;
  return reach.map((v) => (sum += v));
}

/** "82% of its reach came in the first 2 days." when the first days did most of the work. */
export function earlyShareLine(cumulative: number[]): string | null {
  if (cumulative.length < 4) return null;
  const total = cumulative[cumulative.length - 1];
  if (total <= 0) return null;
  const share = Math.round((cumulative[1] / total) * 100);
  return share >= 50 ? `${share}% of its reach came in the first 2 days.` : null;
}

/** Whether a stored timeline should be fetched again: missing, or stale while it still grows. */
export function timelineStale(
  post: { publishedAt: string | null; timelineSyncedAt: string | null },
  now: Date,
): boolean {
  if (!post.timelineSyncedAt) return true;
  const age = now.getTime() - Date.parse(post.timelineSyncedAt);
  if (age < 6 * 3_600_000) return false;
  // The first 14 days stop changing a little after day 14: no need to ask again.
  const published = post.publishedAt ? Date.parse(post.publishedAt) : NaN;
  const settledAt = published + 16 * 86_400_000;
  return Number.isNaN(published) || Date.parse(post.timelineSyncedAt) < settledAt;
}
