import { platformLabel } from "@/lib/social/platforms";

// Results per post (Posts Round 4, approved 26 Nov, board section 3): "How it did" in the post
// panel, the List view's Engagement column and "Best post this week", all from Waggle's own copy
// of the numbers (`post_metrics`, synced every hour by src/features/analytics/sync.ts). Nothing
// here calls the platforms. Pure; tested.
//
// What each app gives back per post (docs.zernio.com/products/analytics, /platforms/*/analytics,
// read 26 Nov; board 3c). A number an app doesn't report comes back as 0, so those show a dash.

/** The numbers of one `post_metrics` row this needs. */
export interface MetricRow {
  zernio_post_id: string | null;
  platform: string;
  sync_status: string;
  reach: number;
  impressions: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  views: number;
  synced_at: string;
}

type Field = "reach" | "impressions" | "views" | "likes" | "comments" | "shares" | "saves";

interface Reports {
  /** Where "People reached" comes from, first one with a number wins. */
  reached: Field[];
  likes: boolean;
  comments: boolean;
  shares: boolean;
  saves: boolean;
}

const REPORTS: Record<string, Reports> = {
  instagram: {
    reached: ["reach", "views"],
    likes: true,
    comments: true,
    shares: true,
    saves: true,
  },
  // Facebook gives no separate reach on feed posts: how many times it was seen stands in.
  facebook: {
    reached: ["impressions", "views"],
    likes: true,
    comments: true,
    shares: true,
    saves: false,
  },
  linkedin: {
    reached: ["reach", "impressions"],
    likes: true,
    comments: true,
    shares: true,
    saves: false,
  },
  // TikTok's reach and saves arrive a day or two late; views stand in until then.
  tiktok: { reached: ["reach", "views"], likes: true, comments: true, shares: true, saves: true },
  twitter: { reached: ["impressions"], likes: true, comments: true, shares: true, saves: true },
  threads: { reached: ["views"], likes: true, comments: true, shares: true, saves: false },
  bluesky: { reached: [], likes: true, comments: true, shares: true, saves: false },
  youtube: { reached: ["views"], likes: true, comments: true, shares: false, saves: false },
  pinterest: {
    reached: ["impressions"],
    likes: false,
    comments: false,
    shares: false,
    saves: true,
  },
};

/** Google removed numbers per post; profile views and calls stay in Insights. */
export const NO_POST_NUMBERS = new Set([
  "googlebusiness",
  "telegram",
  "whatsapp",
  "discord",
  "snapchat",
  "reddit",
]);

/** A number, or null when that app doesn't report it (shown as a dash, never 0). */
export type Num = number | null;

export interface PlatformResult {
  platform: string;
  /** No numbers per post from this app (Google): one muted line instead. */
  noNumbers: boolean;
  /** The app reports numbers but the first sync after posting hasn't brought them yet. */
  waiting: boolean;
  reached: Num;
  likes: Num;
  comments: Num;
  shares: Num;
  saves: Num;
}

export interface PostResults {
  /** Totals over the apps that gave numbers; null when none did yet. */
  reached: Num;
  likes: Num;
  comments: Num;
  shares: Num;
  saves: Num;
  /** Likes, comments, shares and saves. */
  engagement: Num;
  /** Engagement as a share of the people reached, in percent (one decimal), or null. */
  rate: number | null;
  /** One line per app the post went to, in the post's order. */
  platforms: PlatformResult[];
  /** When Waggle last copied the numbers (latest sync of its rows), ISO, or null. */
  updatedAt: string | null;
  /** True when at least one app gave real numbers. */
  hasNumbers: boolean;
  /** Every app it went to gives no numbers per post (a Google-only post). */
  noneShare: boolean;
}

const sumNum = (values: Num[]): Num => {
  const real = values.filter((v): v is number => v !== null);
  return real.length ? real.reduce((a, b) => a + b, 0) : null;
};

function lineFor(platform: string, rows: MetricRow[]): PlatformResult {
  const empty = { reached: null, likes: null, comments: null, shares: null, saves: null };
  const r = REPORTS[platform];
  if (NO_POST_NUMBERS.has(platform) || !r) {
    return { platform, noNumbers: true, waiting: false, ...empty };
  }
  const counted = rows.filter((m) => m.sync_status !== "pending");
  if (!counted.length) return { platform, noNumbers: false, waiting: true, ...empty };
  const total = (f: Field) => counted.reduce((s, m) => s + (m[f] ?? 0), 0);
  const reachedField = r.reached.find((f) => total(f) > 0) ?? r.reached[0];
  return {
    platform,
    noNumbers: false,
    waiting: false,
    reached: reachedField ? total(reachedField) : null,
    likes: r.likes ? total("likes") : null,
    comments: r.comments ? total("comments") : null,
    shares: r.shares ? total("shares") : null,
    saves: r.saves ? total("saves") : null,
  };
}

/**
 * One post's results from its `post_metrics` rows (two accounts on one app add up), with a line
 * for every app it went to (`platforms`, from its accounts), even before numbers arrive.
 */
export function postResults(platforms: string[], rows: MetricRow[]): PostResults {
  const order = [...new Set([...platforms, ...rows.map((m) => m.platform)])];
  const lines = order.map((p) =>
    lineFor(
      p,
      rows.filter((m) => m.platform === p),
    ),
  );
  const real = lines.filter((l) => !l.noNumbers && !l.waiting);
  const pick = (k: "reached" | "likes" | "comments" | "shares" | "saves") =>
    sumNum(real.map((l) => l[k]));
  const reached = pick("reached");
  const likes = pick("likes");
  const comments = pick("comments");
  const shares = pick("shares");
  const saves = pick("saves");
  const engagement = real.length ? (sumNum([likes, comments, shares, saves]) ?? 0) : null;
  const rate =
    engagement !== null && reached ? Math.round((engagement / reached) * 1000) / 10 : null;
  const updatedAt = rows.reduce<string | null>(
    (latest, m) => (!latest || m.synced_at > latest ? m.synced_at : latest),
    null,
  );
  return {
    reached,
    likes,
    comments,
    shares,
    saves,
    engagement,
    rate,
    platforms: lines,
    updatedAt,
    hasNumbers: real.length > 0,
    noneShare: lines.length > 0 && lines.every((l) => l.noNumbers),
  };
}

/** Rows grouped by the Zernio post they belong to. */
export function rowsByPost(rows: MetricRow[]): Map<string, MetricRow[]> {
  const out = new Map<string, MetricRow[]>();
  for (const m of rows) {
    if (!m.zernio_post_id) continue;
    out.set(m.zernio_post_id, [...(out.get(m.zernio_post_id) ?? []), m]);
  }
  return out;
}

/** "Updated just now", "Updated 40 min ago", "Updated 3 h ago", "Updated 2 days ago". */
export function updatedLine(iso: string | null, now: Date): string | null {
  if (!iso) return null;
  const min = Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000));
  if (min < 1) return "Updated just now";
  if (min < 60) return `Updated ${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `Updated ${h} h ago`;
  const d = Math.floor(h / 24);
  return `Updated ${d} day${d === 1 ? "" : "s"} ago`;
}

/** A number for the screen, or a dash when the app doesn't report it. */
export const showNum = (n: Num): string => (n === null ? "–" : n.toLocaleString("en-US"));

/** "125 · 9.7%", "125" without reach. */
export function engagementCell(r: PostResults): string {
  if (r.engagement === null) return "–";
  return r.rate !== null
    ? `${r.engagement.toLocaleString("en-US")} · ${r.rate}%`
    : r.engagement.toLocaleString("en-US");
}

/** The muted line for an app with no numbers per post. */
export function noNumbersLine(platform: string): string {
  return platform === "googlebusiness"
    ? "Google doesn't give numbers per post. Profile views and calls are in Insights."
    : `${platformLabel(platform)} doesn't share numbers per post.`;
}

/** "71 likes · 11 comments · 9 saves" for a phone line (dashes left out). */
export function platformSummary(l: PlatformResult): string {
  const parts: string[] = [];
  if (l.reached !== null) parts.push(`${l.reached.toLocaleString("en-US")} reached`);
  if (l.likes !== null) parts.push(`${l.likes.toLocaleString("en-US")} likes`);
  if (l.comments !== null) parts.push(`${l.comments.toLocaleString("en-US")} comments`);
  if (l.shares !== null) parts.push(`${l.shares.toLocaleString("en-US")} shares`);
  if (l.saves !== null) parts.push(`${l.saves.toLocaleString("en-US")} saves`);
  return parts.join(" · ");
}

export interface BestCandidate {
  postId: string;
  publishedAt: string;
  results: PostResults;
}

export interface BestPost {
  postId: string;
  results: PostResults;
  /** "about twice your usual post", or null when there isn't enough to compare with. */
  comparison: string | null;
}

/** Posts needed besides the best one before "your usual post" means something. */
const MIN_FOR_USUAL = 3;

/** How a post compares with the usual one, in words; null when it isn't clearly above. */
export function comparisonLine(engagement: number, usual: number): string | null {
  if (usual <= 0) return null;
  const ratio = engagement / usual;
  if (ratio < 1.2) return null;
  if (ratio < 1.5) return "above your usual post";
  const times = Math.round(ratio);
  if (times <= 2) return "about twice your usual post";
  return `about ${times} times your usual post`;
}

/**
 * "Best post this week" (board 3b): the post published since `weekStartIso` with the most likes,
 * comments, shares and saves (people reached breaks a tie), among posts with numbers; null when
 * none has any. "Usual" is the average of the other posts of the last 30 days.
 */
export function bestPostThisWeek(
  candidates: BestCandidate[],
  weekStartIso: string,
  now: Date,
): BestPost | null {
  const withNumbers = candidates.filter((c) => c.results.hasNumbers);
  const week = withNumbers.filter((c) => c.publishedAt >= weekStartIso);
  if (!week.length) return null;
  const eng = (c: BestCandidate) => c.results.engagement ?? 0;
  const best = [...week].sort(
    (a, b) => eng(b) - eng(a) || (b.results.reached ?? 0) - (a.results.reached ?? 0),
  )[0];
  if (eng(best) === 0 && !best.results.reached) return null;
  const monthAgo = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const others = withNumbers.filter((c) => c.postId !== best.postId && c.publishedAt >= monthAgo);
  const usual =
    others.length >= MIN_FOR_USUAL ? others.reduce((s, c) => s + eng(c), 0) / others.length : 0;
  return {
    postId: best.postId,
    results: best.results,
    comparison: comparisonLine(eng(best), usual),
  };
}
