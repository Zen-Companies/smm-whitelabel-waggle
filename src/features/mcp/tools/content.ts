import { z } from "zod";
import {
  latestSync,
  loadAccounts,
  loadAudience,
  loadOverview,
  loadPostDetail,
  loadPostMetrics,
  loadWork,
  type AnalyticsPlatform,
} from "@/features/analytics";
import { searchKbEntries } from "@/features/knowledge-base";
import { canMove, cancelScheduledPost, type StoredMedia } from "@/features/publishing";
import { resolveBrand, ToolError, viaOf } from "../context";
import {
  brandId,
  clip,
  cursor,
  defineTool,
  nextCursor,
  offsetOf,
  pageOf,
  PAGE_SIZE,
  PUBLIC_ACTION,
  READ,
} from "./define";

// Business info, posts and analytics. Analytics read the copies the sync job keeps (no Zernio
// call); cancelling a post goes through publishing like the app. Posting is posting.ts.

const DAY_MS = 86_400_000;
const period = z.union([z.literal(7), z.literal(30), z.literal(90)]).default(30);
const platform = z
  .string()
  .trim()
  .toLowerCase()
  .default("all")
  .describe(
    '"all", or one platform the brand has connected (as in list_brands), e.g. instagram, facebook, tiktok, youtube, linkedin.',
  );

/** The analytics platform asked for, checked against what the brand has connected. */
function checkPlatform(asked: string, connected: string[]): AnalyticsPlatform {
  if (asked === "all") return "all";
  if (!connected.includes(asked)) {
    throw new ToolError(
      "invalid_input",
      `platform must be "all" or one of this brand's connected platforms: ${connected.join(", ") || "none connected"}.`,
    );
  }
  return asked as AnalyticsPlatform;
}

export const searchKnowledge = defineTool({
  name: "search_knowledge",
  title: "Search business info",
  description:
    "Searches the brand's saved business info (hours, prices, menu, policies) by keywords; with no query it lists everything, newest first. These are the only facts replies may use: if a fact isn't here, say so or ask the owner rather than guess.",
  access: "read",
  annotations: READ,
  wraps: "knowledge-base.searchKbEntries",
  input: z.object({
    brand_id: brandId,
    query: z.string().max(200).optional().describe("Keywords, e.g. 'parking weekend'."),
    cursor,
  }),
  output: z.object({
    entries: z.array(
      z.object({
        entry_id: z.uuid(),
        title: z.string(),
        content: z.string(),
        updated_at: z.string(),
      }),
    ),
    next_cursor: nextCursor,
  }),
  async run(ctx, input) {
    const tenantId = await resolveBrand(ctx, input.brand_id);
    const offset = offsetOf(input.cursor);
    const { entries, more } = await searchKbEntries(ctx.db, tenantId, {
      query: input.query,
      limit: PAGE_SIZE,
      offset,
    });
    return {
      entries: entries.map((e) => ({
        entry_id: e.id,
        title: e.title,
        content: clip(e.content, 2000),
        updated_at: e.updatedAt,
      })),
      next_cursor: more ? String(offset + PAGE_SIZE) : null,
    };
  },
});

const POST_GROUPS = {
  upcoming: ["queued", "scheduled", "publishing"],
  published: ["published"],
  needs_attention: ["failed", "partial"],
  cancelled: ["cancelled"],
} as const;

export const listPosts = defineTool({
  name: "list_posts",
  title: "List posts",
  description:
    "Lists posts made in Waggle, newest first: upcoming (scheduled or going out), published, needs_attention (failed on a platform) or cancelled, with their photo and video links and what can be done (can.edit: preview_post_edit and preview_post_move; can.fix_text: preview_text_fix). For how posts performed, use get_post_performance.",
  access: "read",
  annotations: READ,
  wraps: "posts table (publishing)",
  input: z.object({
    brand_id: brandId,
    show: z.enum(["all", "upcoming", "published", "needs_attention", "cancelled"]).default("all"),
    cursor,
  }),
  output: z.object({
    posts: z.array(
      z.object({
        post_id: z.uuid(),
        content: z.string(),
        status: z.string(),
        account_ids: z.array(z.string()),
        scheduled_for: z.string().nullable(),
        published_at: z.string().nullable(),
        problem: z.string().nullable(),
        media: z
          .array(z.object({ url: z.string(), type: z.string().nullable() }))
          .describe("The post's files in order (pass them to preview_post_edit to reorder)."),
        can: z.object({
          edit: z.boolean().describe("A planned post: edit or move it."),
          fix_text: z.boolean().describe("It went out: its text can be fixed where allowed."),
        }),
      }),
    ),
    next_cursor: nextCursor,
  }),
  async run(ctx, input) {
    const tenantId = await resolveBrand(ctx, input.brand_id);
    const offset = offsetOf(input.cursor);
    let q = ctx.db
      .from("posts")
      .select(
        "id, content, status, target_account_ids, scheduled_for, published_at, failure_reason, last_error, media, zernio_post_id",
      )
      .eq("tenant_id", tenantId)
      .neq("status", "draft");
    if (input.show !== "all") q = q.in("status", [...POST_GROUPS[input.show]]);
    const { data, error } = await q
      .order("created_at", { ascending: false })
      .range(offset, offset + PAGE_SIZE);
    if (error) throw new Error(`mcp list_posts failed: ${error.message}`);
    const rows = data ?? [];
    return {
      posts: rows.slice(0, PAGE_SIZE).map((p) => ({
        post_id: p.id,
        content: clip(p.content, 600),
        status: p.status,
        account_ids: p.target_account_ids,
        scheduled_for: p.scheduled_for,
        published_at: p.published_at,
        problem: p.failure_reason ?? null,
        media: ((p.media as StoredMedia[] | null) ?? []).flatMap((m) =>
          m.url ? [{ url: m.url, type: m.type ?? null }] : [],
        ),
        can: {
          edit: canMove(p) && !!p.scheduled_for,
          fix_text: !!p.zernio_post_id && ["published", "partial"].includes(p.status),
        },
      })),
      next_cursor: rows.length > PAGE_SIZE ? String(offset + PAGE_SIZE) : null,
    };
  },
});

export const cancelPostTool = defineTool({
  name: "cancel_post",
  title: "Cancel a scheduled post",
  description:
    "Cancels a post that is scheduled or queued (post_id from list_posts). Published posts can't be cancelled.",
  access: "act",
  ability: "posts.write",
  annotations: { ...PUBLIC_ACTION, destructiveHint: true, idempotentHint: true },
  wraps: "publishing.cancelScheduledPost",
  input: z.object({ brand_id: brandId, post_id: z.uuid() }),
  output: z.object({ cancelled: z.literal(true) }),
  async run(ctx, input) {
    const tenantId = await resolveBrand(ctx, input.brand_id);
    const r = await cancelScheduledPost(
      { db: ctx.db, social: ctx.social },
      { tenantId, userId: ctx.principal.userId, postId: input.post_id, via: viaOf(ctx.principal) },
    );
    if (!r.ok) {
      throw r.error === "not_cancellable"
        ? new ToolError("already_decided", "This post can't be cancelled any more.")
        : new ToolError("provider_failed", "Couldn't cancel it right now. Try again.");
    }
    return { cancelled: true as const };
  },
});

export const getAnalytics = defineTool({
  name: "get_analytics",
  title: "Get analytics",
  description:
    "A brand's numbers from every connected platform (Instagram, Facebook, TikTok, YouTube, LinkedIn and the rest Waggle syncs), copied hourly (followers daily). overview: reach, engagement, followers and daily series vs the previous period; audience: followers over time, best times, age/city breakdowns; waggle_work: messages Waggle answered, how fast, leads. Raw numbers only: summarise them yourself.",
  access: "read",
  annotations: READ,
  wraps: "analytics.loadOverview, analytics.loadAudience, analytics.loadWork",
  input: z.object({
    brand_id: brandId,
    section: z.enum(["overview", "audience", "waggle_work"]).default("overview"),
    period,
    platform,
  }),
  output: z.object({
    section: z.string(),
    period_days: z.number(),
    platform: z.string(),
    synced_at: z.string().nullable(),
    data: z.record(z.string(), z.unknown()),
  }),
  async run(ctx, input) {
    const tenantId = await resolveBrand(ctx, input.brand_id);
    const now = ctx.now?.() ?? new Date();
    const accounts = await loadAccounts(ctx.db, tenantId);
    const connected = [...new Set(accounts.map((a) => a.platform))];
    const chosen = checkPlatform(input.platform, connected);
    const data =
      input.section === "overview"
        ? await loadOverview(ctx.db, tenantId, {
            period: input.period,
            platform: chosen,
            platforms: connected,
            now,
          })
        : input.section === "audience"
          ? await loadAudience(ctx.db, tenantId, accounts)
          : await loadWork(ctx.db, tenantId, { period: input.period, accountIds: null, now });
    return {
      section: input.section,
      period_days: input.period,
      platform: input.platform,
      synced_at: await latestSync(ctx.db, tenantId),
      data: data as unknown as Record<string, unknown>,
    };
  },
});

const metricRow = z.object({
  post_metric_id: z.uuid(),
  platform: z.string(),
  published_at: z.string().nullable(),
  caption: z.string(),
  format: z.string(),
  made_in_waggle: z.boolean(),
  permalink: z.string().nullable(),
  reach: z.number(),
  impressions: z.number(),
  likes: z.number(),
  comments: z.number(),
  shares: z.number(),
  saves: z.number(),
  views: z.number(),
  engagement_rate: z.number(),
});

export const getPostPerformance = defineTool({
  name: "get_post_performance",
  title: "Get post performance",
  description:
    "How individual posts did (lifetime totals), including posts made directly on the platforms. Without post_metric_id: posts published in the period, sorted. With post_metric_id: one post plus its reach over the first days.",
  access: "read",
  annotations: READ,
  wraps: "analytics.loadPostMetrics, analytics.loadPostDetail",
  input: z.object({
    brand_id: brandId,
    post_metric_id: z.uuid().optional(),
    period,
    platform,
    sort: z.enum(["reach", "engagement_rate", "comments", "published_at"]).default("reach"),
    cursor,
  }),
  output: z.object({
    posts: z.array(metricRow),
    timeline: z.array(z.record(z.string(), z.unknown())).nullable(),
    next_cursor: nextCursor,
  }),
  async run(ctx, input) {
    const tenantId = await resolveBrand(ctx, input.brand_id);
    const toRow = (p: Awaited<ReturnType<typeof loadPostMetrics>>[number]) => ({
      post_metric_id: p.id,
      platform: p.platform,
      published_at: p.publishedAt,
      caption: clip(p.caption, 300),
      format: p.format,
      made_in_waggle: p.madeInWaggle,
      permalink: p.permalink,
      reach: p.reach,
      impressions: p.impressions,
      likes: p.likes,
      comments: p.comments,
      shares: p.shares,
      saves: p.saves,
      views: p.views,
      engagement_rate: p.engagementRate,
    });
    if (input.post_metric_id) {
      const d = await loadPostDetail(ctx.db, tenantId, input.post_metric_id);
      if (!d) throw new ToolError("not_found", "No such post for this brand.");
      return {
        posts: [toRow(d)],
        timeline: (d.timeline as unknown as Record<string, unknown>[] | null) ?? null,
        next_cursor: null,
      };
    }
    const to = ctx.now?.() ?? new Date();
    const connected = [...new Set((await loadAccounts(ctx.db, tenantId)).map((a) => a.platform))];
    const rows = await loadPostMetrics(ctx.db, tenantId, {
      from: new Date(to.getTime() - input.period * DAY_MS),
      to,
      platform: checkPlatform(input.platform, connected),
    });
    const sorted = [...rows].sort((a, b) =>
      input.sort === "published_at"
        ? (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "")
        : input.sort === "engagement_rate"
          ? b.engagementRate - a.engagementRate
          : b[input.sort] - a[input.sort],
    );
    const { page, next_cursor } = pageOf(sorted, input.cursor);
    return { posts: page.map(toRow), timeline: null, next_cursor };
  },
});

export const CONTENT_TOOLS = [
  searchKnowledge,
  listPosts,
  cancelPostTool,
  getAnalytics,
  getPostPerformance,
];
