import type { SupabaseClient } from "@supabase/supabase-js";
import { heldReasonFromDetails } from "@/features/approvals";
import type { BestTimeSlot, DashboardSummary } from "@/lib/social/analytics-types";
import type { Database } from "@/lib/supabase/database.types";
import { daysBetween, windowFor } from "./period";
import type { PostMetricRow } from "./posts";
import {
  audienceSchema,
  bestTimeSchema,
  dashboardSchema,
  followersSchema,
  parseOrNull,
  timelineSchema,
  type AudienceSnapshot,
  type FollowersSnapshot,
} from "./schemas";
import { audienceKey, BEST_TIME_KEY, dashboardKey, FOLLOWERS_KEY } from "./sync";
import type { AnalyticsPeriod, AnalyticsPlatform } from "./sync";
import { summarizeWork, type WorkSummary } from "./work";

// Read side of Analytics (T49-T52). Every loader takes a client and the open brand's id and
// filters on it: RLS lets a login read all its brands, so the filter is what keeps them apart.
// Pages pass the owner's (RLS) client; tests pass any client.

type Db = SupabaseClient<Database>;

export interface AnalyticsAccount {
  id: string;
  platform: string;
  username: string | null;
  status: string;
}

export async function loadAccounts(db: Db, tenantId: string): Promise<AnalyticsAccount[]> {
  const { data, error } = await db
    .from("social_accounts")
    .select("id, platform, username, status")
    .eq("tenant_id", tenantId)
    .order("created_at");
  if (error) throw new Error(`analytics accounts failed: ${error.message}`);
  return data ?? [];
}

interface Snapshot {
  data: unknown;
  syncedAt: string;
}

export async function loadSnapshots(
  db: Db,
  tenantId: string,
  keys: string[],
): Promise<Map<string, Snapshot>> {
  if (keys.length === 0) return new Map();
  const { data, error } = await db
    .from("analytics_snapshots")
    .select("key, data, synced_at")
    .eq("tenant_id", tenantId)
    .in("key", keys);
  if (error) throw new Error(`analytics snapshots failed: ${error.message}`);
  return new Map((data ?? []).map((r) => [r.key, { data: r.data, syncedAt: r.synced_at }]));
}

/** When the job last stored numbers for this brand; null before its first pass. */
export async function latestSync(db: Db, tenantId: string): Promise<string | null> {
  const { data, error } = await db
    .from("analytics_snapshots")
    .select("synced_at")
    .eq("tenant_id", tenantId)
    .order("synced_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`analytics sync time failed: ${error.message}`);
  return data?.synced_at ?? null;
}

const POST_COLUMNS =
  "id, provider_post_id, platform, zernio_post_id, published_at, caption, permalink, thumbnail_url, format, is_external, sync_status, reach, impressions, likes, comments, shares, saves, clicks, views, engagement_rate";

type PostMetricDb = Pick<
  Database["public"]["Tables"]["post_metrics"]["Row"],
  | "id"
  | "provider_post_id"
  | "platform"
  | "zernio_post_id"
  | "published_at"
  | "caption"
  | "permalink"
  | "thumbnail_url"
  | "format"
  | "is_external"
  | "sync_status"
  | "reach"
  | "impressions"
  | "likes"
  | "comments"
  | "shares"
  | "saves"
  | "clicks"
  | "views"
  | "engagement_rate"
>;

function toPostRow(r: PostMetricDb, ours: Set<string>): PostMetricRow {
  return {
    id: r.id,
    providerPostId: r.provider_post_id,
    platform: r.platform,
    zernioPostId: r.zernio_post_id,
    publishedAt: r.published_at,
    caption: r.caption,
    permalink: r.permalink,
    thumbnailUrl: r.thumbnail_url,
    format: r.format,
    madeInWaggle: !r.is_external && !!r.zernio_post_id && ours.has(r.zernio_post_id),
    syncStatus: r.sync_status,
    reach: r.reach,
    impressions: r.impressions,
    likes: r.likes,
    comments: r.comments,
    shares: r.shares,
    saves: r.saves,
    clicks: r.clicks,
    views: r.views,
    engagementRate: Number(r.engagement_rate),
  };
}

/** Which of these Zernio post ids are posts this brand made in Waggle. */
async function ourPostIds(db: Db, tenantId: string, ids: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  for (const part of chunks([...new Set(ids)], 200)) {
    const { data, error } = await db
      .from("posts")
      .select("zernio_post_id")
      .eq("tenant_id", tenantId)
      .in("zernio_post_id", part);
    if (error) throw new Error(`analytics posts lookup failed: ${error.message}`);
    for (const r of data ?? []) if (r.zernio_post_id) out.add(r.zernio_post_id);
  }
  return out;
}

function chunks<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/** Posts published in [from, to), one row per post and platform. */
export async function loadPostMetrics(
  db: Db,
  tenantId: string,
  range: { from: Date; to: Date; platform: AnalyticsPlatform },
): Promise<PostMetricRow[]> {
  let query = db
    .from("post_metrics")
    .select(POST_COLUMNS)
    .eq("tenant_id", tenantId)
    .gte("published_at", range.from.toISOString())
    .lt("published_at", range.to.toISOString());
  if (range.platform !== "all") query = query.eq("platform", range.platform);
  const { data, error } = await query.order("published_at", { ascending: false }).limit(1000);
  if (error) throw new Error(`analytics post metrics failed: ${error.message}`);
  const rows = data ?? [];
  const ours = await ourPostIds(
    db,
    tenantId,
    rows.flatMap((r) => r.zernio_post_id ?? []),
  );
  return rows.map((r) => toPostRow(r, ours));
}

export interface PostDetail extends PostMetricRow {
  timeline: ReturnType<typeof parseTimeline>;
  timelineSyncedAt: string | null;
}

const parseTimeline = (v: unknown) => parseOrNull(timelineSchema, v);

/** One post, only if it belongs to this brand. */
export async function loadPostDetail(
  db: Db,
  tenantId: string,
  id: string,
): Promise<PostDetail | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data, error } = await db
    .from("post_metrics")
    .select(`${POST_COLUMNS}, timeline, timeline_synced_at`)
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`analytics post failed: ${error.message}`);
  if (!data) return null;
  const ours = await ourPostIds(db, tenantId, data.zernio_post_id ? [data.zernio_post_id] : []);
  return {
    ...toPostRow(data, ours),
    timeline: parseTimeline(data.timeline),
    timelineSyncedAt: data.timeline_synced_at,
  };
}

interface CommentRow {
  id: string;
  author_name: string | null;
  hidden_on_platform_at: string | null;
}

/**
 * Comments on these posts. A comment carries the platform's post id (and the post's link when
 * known); a post row carries Zernio's ids and its link, so all three are matched.
 */
async function commentsOn(
  db: Db,
  tenantId: string,
  posts: Pick<PostMetricRow, "providerPostId" | "zernioPostId" | "permalink">[],
): Promise<CommentRow[]> {
  const ids = [...new Set(posts.flatMap((p) => [p.providerPostId, p.zernioPostId ?? []].flat()))];
  const links = [...new Set(posts.flatMap((p) => p.permalink ?? []))];
  const found = new Map<string, CommentRow>();
  const run = async (column: "zernio_post_id" | "permalink", values: string[]) => {
    for (const part of chunks(values, 100)) {
      const { data, error } = await db
        .from("inbound_items")
        .select("id, author_name, hidden_on_platform_at")
        .eq("tenant_id", tenantId)
        .eq("kind", "comment")
        .in(column, part)
        .limit(2000);
      if (error) throw new Error(`analytics comments failed: ${error.message}`);
      for (const r of data ?? []) found.set(r.id, r);
    }
  };
  await run("zernio_post_id", ids);
  await run("permalink", links);
  return [...found.values()];
}

/** Each item's first sent reply: by Waggle on its own, or by the owner (inbox T27 rule). */
async function firstReplies(
  db: Db,
  tenantId: string,
  itemIds: string[],
): Promise<Map<string, "waggle" | "you">> {
  const first = new Map<string, { at: string; by: "waggle" | "you" }>();
  for (const part of chunks(itemIds, 200)) {
    const { data, error } = await db
      .from("drafts")
      .select("item_id, sent_at, decided_by")
      .eq("tenant_id", tenantId)
      .eq("status", "sent")
      .in("item_id", part);
    if (error) throw new Error(`analytics replies failed: ${error.message}`);
    for (const d of data ?? []) {
      const at = d.sent_at ?? "";
      const seen = first.get(d.item_id);
      if (!seen || at < seen.at) first.set(d.item_id, { at, by: d.decided_by ? "you" : "waggle" });
    }
  }
  return new Map([...first].map(([k, v]) => [k, v.by]));
}

export interface PostComments {
  total: number;
  byWaggle: number;
  byYou: number;
  spamHidden: number;
  leads: { id: string; label: string }[];
}

/** "Comments on this post": what came in under it and what Waggle did. */
export async function loadPostComments(
  db: Db,
  tenantId: string,
  post: Pick<PostMetricRow, "providerPostId" | "zernioPostId" | "permalink">,
): Promise<PostComments> {
  const comments = await commentsOn(db, tenantId, [post]);
  const ids = comments.map((c) => c.id);
  const replies = await firstReplies(db, tenantId, ids);
  const leads: PostComments["leads"] = [];
  for (const part of chunks(ids, 200)) {
    const { data } = await db
      .from("leads")
      .select("id, item_id, name, request")
      .eq("tenant_id", tenantId)
      .in("item_id", part);
    for (const l of data ?? []) {
      const who = l.name ?? comments.find((c) => c.id === l.item_id)?.author_name ?? "Someone";
      leads.push({ id: l.id, label: l.request ? `${who}: ${l.request}` : who });
    }
  }
  const values = [...replies.values()];
  return {
    total: comments.length,
    byWaggle: values.filter((v) => v === "waggle").length,
    byYou: values.filter((v) => v === "you").length,
    spamHidden: comments.filter((c) => c.hidden_on_platform_at).length,
    leads,
  };
}

export interface OverviewData {
  summary: DashboardSummary | null;
  syncedAt: string | null;
  /** The same days of the period just before, aligned with `summary.daily` (null if not stored). */
  previousDaily: DashboardSummary["daily"] | null;
  reachByPlatform: { platform: string; reach: number }[];
  posts: PostMetricRow[];
  bestTimes: BestTimeSlot[] | null;
  waggleComments: { comments: number; answered: number } | null;
}

export async function loadOverview(
  db: Db,
  tenantId: string,
  input: {
    period: AnalyticsPeriod;
    platform: AnalyticsPlatform;
    platforms: string[];
    now: Date;
  },
): Promise<OverviewData> {
  const { period, platform, platforms, now } = input;
  const key = dashboardKey(period, platform);
  const longKey = dashboardKey(90, platform);
  const perPlatform = platforms.map((p) => dashboardKey(period, p as AnalyticsPlatform));
  const snaps = await loadSnapshots(db, tenantId, [key, longKey, BEST_TIME_KEY, ...perPlatform]);
  const snap = snaps.get(key);
  const summary = snap ? parseOrNull(dashboardSchema, snap.data) : null;

  // The previous period day by day: only the 90-day snapshot reaches back that far.
  let previousDaily: OverviewData["previousDaily"] = null;
  const long = snaps.get(longKey);
  const longSummary = long ? parseOrNull(dashboardSchema, long.data) : null;
  if (summary && longSummary && period < 90) {
    const prevDays = daysBetween(
      new Date(Date.parse(`${summary.fromDate}T00:00:00Z`) - period * 86_400_000),
      period,
    );
    const byDate = new Map(longSummary.daily.map((d) => [d.date, d]));
    const found = prevDays.map((d) => byDate.get(d));
    if (found.every(Boolean)) previousDaily = found as DashboardSummary["daily"];
  }

  const reachByPlatform = platforms.flatMap((p) => {
    const s = snaps.get(dashboardKey(period, p as AnalyticsPlatform));
    const parsed = s ? parseOrNull(dashboardSchema, s.data) : null;
    return parsed ? [{ platform: p, reach: parsed.totals.reach }] : [];
  });

  const window = summary
    ? {
        from: new Date(`${summary.fromDate}T00:00:00Z`),
        to: new Date(Date.parse(`${summary.toDate}T00:00:00Z`) + 86_400_000),
      }
    : windowFor(period, now);
  const posts = await loadPostMetrics(db, tenantId, { ...window, platform });
  const best = snaps.get(BEST_TIME_KEY);
  const waggle = posts.filter((p) => p.madeInWaggle);
  let waggleComments: OverviewData["waggleComments"] = null;
  if (waggle.length) {
    const comments = await commentsOn(db, tenantId, waggle);
    const replies = await firstReplies(
      db,
      tenantId,
      comments.map((c) => c.id),
    );
    waggleComments = {
      comments: comments.length,
      answered: [...replies.values()].filter((v) => v === "waggle").length,
    };
  }

  return {
    summary,
    syncedAt: snap?.syncedAt ?? null,
    previousDaily,
    reachByPlatform,
    posts,
    bestTimes: best ? (parseOrNull(bestTimeSchema, best.data)?.slots ?? null) : null,
    waggleComments,
  };
}

export interface AudienceData {
  followers: FollowersSnapshot | null;
  bestTimes: BestTimeSlot[] | null;
  /** Per connected account, keyed by social account id. */
  audiences: Map<string, AudienceSnapshot>;
  syncedAt: string | null;
}

export async function loadAudience(
  db: Db,
  tenantId: string,
  accounts: Pick<AnalyticsAccount, "id">[],
): Promise<AudienceData> {
  const snaps = await loadSnapshots(db, tenantId, [
    FOLLOWERS_KEY,
    BEST_TIME_KEY,
    ...accounts.map((a) => audienceKey(a.id)),
  ]);
  const audiences = new Map<string, AudienceSnapshot>();
  for (const a of accounts) {
    const s = snaps.get(audienceKey(a.id));
    const parsed = s ? parseOrNull(audienceSchema, s.data) : null;
    if (parsed) audiences.set(a.id, parsed);
  }
  const f = snaps.get(FOLLOWERS_KEY);
  const b = snaps.get(BEST_TIME_KEY);
  return {
    followers: f ? parseOrNull(followersSchema, f.data) : null,
    bestTimes: b ? (parseOrNull(bestTimeSchema, b.data)?.slots ?? null) : null,
    audiences,
    syncedAt: f?.syncedAt ?? null,
  };
}

/** Waggle's work in the period, from Waggle's own tables. */
export async function loadWork(
  db: Db,
  tenantId: string,
  input: { period: AnalyticsPeriod; accountIds: string[] | null; now: Date },
): Promise<WorkSummary> {
  const w = windowFor(input.period, input.now);
  const from = w.from.toISOString();
  const to = w.to.toISOString();
  const accounts = input.accountIds;
  const noAccounts = accounts !== null && accounts.length === 0;
  const empty = { data: [], count: 0, error: null };

  let items = db
    .from("inbound_items")
    .select("id, received_at, category")
    .eq("tenant_id", tenantId)
    .gte("received_at", from)
    .lt("received_at", to);
  let previous = db
    .from("inbound_items")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .gte("received_at", w.prevFrom.toISOString())
    .lt("received_at", w.prevTo.toISOString());
  let replies = db
    .from("drafts")
    .select(
      "item_id, sent_at, decided_by, kb_entry_ids, inbound_items!inner(received_at, social_account_id)",
    )
    .eq("tenant_id", tenantId)
    .eq("status", "sent")
    .gte("sent_at", from)
    .lt("sent_at", to);
  let leads = db
    .from("leads")
    .select("id, inbound_items!inner(social_account_id)", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .gte("created_at", from)
    .lt("created_at", to);
  if (accounts) {
    items = items.in("social_account_id", accounts);
    previous = previous.in("social_account_id", accounts);
    replies = replies.in("inbound_items.social_account_id", accounts);
    leads = leads.in("inbound_items.social_account_id", accounts);
  }
  const handed = db
    .from("audit_log")
    .select("item_id, details")
    .eq("tenant_id", tenantId)
    .eq("action", "status_changed")
    .in("details->>to", ["escalated", "failed"])
    .gte("created_at", from)
    .lt("created_at", to)
    .limit(5000);

  const [itemsRes, prevRes, repliesRes, leadsRes, handedRes] = await Promise.all([
    noAccounts ? empty : items.limit(5000),
    noAccounts ? empty : previous,
    noAccounts ? empty : replies.limit(5000),
    noAccounts ? empty : leads,
    noAccounts ? empty : handed,
  ]);
  for (const r of [itemsRes, prevRes, repliesRes, leadsRes, handedRes]) {
    if (r.error) throw new Error(`analytics work failed: ${r.error.message}`);
  }

  const replyRows = (repliesRes.data ?? []) as unknown as {
    item_id: string;
    sent_at: string | null;
    decided_by: string | null;
    kb_entry_ids: string[];
    inbound_items: { received_at: string; social_account_id: string };
  }[];

  // Handed-over items on other platforms drop out when a platform is picked.
  let handedRows = (handedRes.data ?? []) as { item_id: string | null; details: unknown }[];
  if (accounts && handedRows.length) {
    const keep = new Set<string>();
    const ids = [...new Set(handedRows.flatMap((h) => h.item_id ?? []))];
    for (const part of chunks(ids, 200)) {
      const { data } = await db
        .from("inbound_items")
        .select("id")
        .eq("tenant_id", tenantId)
        .in("id", part)
        .in("social_account_id", accounts);
      for (const r of data ?? []) keep.add(r.id);
    }
    handedRows = handedRows.filter((h) => h.item_id && keep.has(h.item_id));
  }

  const kbIds = [...new Set(replyRows.flatMap((r) => r.kb_entry_ids))];
  const kbTitles = new Map<string, string>();
  for (const part of chunks(kbIds, 200)) {
    const { data } = await db
      .from("kb_entries")
      .select("id, title")
      .eq("tenant_id", tenantId)
      .in("id", part);
    for (const e of data ?? []) kbTitles.set(e.id, e.title);
  }

  return summarizeWork({
    days: w.days,
    items: (
      (itemsRes.data ?? []) as { id: string; received_at: string; category: string | null }[]
    ).map((i) => ({ id: i.id, receivedAt: i.received_at, category: i.category })),
    previousItemCount: prevRes.count ?? 0,
    replies: replyRows
      .filter((r) => r.sent_at)
      .map((r) => ({
        itemId: r.item_id,
        itemReceivedAt: r.inbound_items.received_at,
        sentAt: r.sent_at!,
        byWaggle: r.decided_by === null,
        kbEntryIds: r.kb_entry_ids,
      })),
    leads: leadsRes.count ?? 0,
    handedOver: handedRows.map((h) => heldReasonFromDetails(h.details)),
    kbTitles,
  });
}
