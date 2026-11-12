import { z } from "zod";
import {
  latestSync,
  loadAccounts,
  loadAudience,
  loadOverview,
  loadPostDetail,
  loadPostMetrics,
  loadWork,
} from "@/features/analytics";
import { searchKbEntries } from "@/features/knowledge-base";
import { cancelScheduledPost, createPost, POST_TEXT_MAX } from "@/features/publishing";
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
import { platformLabel } from "@/lib/social/platforms";

// Business info, posts and analytics. Analytics read the copies the sync job keeps (no Zernio
// call); creating or cancelling a post goes through publishing like the compose card.

const DAY_MS = 86_400_000;
const period = z.union([z.literal(7), z.literal(30), z.literal(90)]).default(30);
const platform = z.enum(["all", "instagram", "facebook"]).default("all");

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
    "Lists posts made in Waggle, newest first: upcoming (scheduled or going out), published, needs_attention (failed on a platform) or cancelled. For how posts performed, use get_post_performance.",
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
        "id, content, status, target_account_ids, scheduled_for, published_at, failure_reason, last_error",
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
      })),
      next_cursor: rows.length > PAGE_SIZE ? String(offset + PAGE_SIZE) : null,
    };
  },
});

export const createPostTool = defineTool({
  name: "create_post",
  title: "Publish or schedule a post",
  description:
    "Publishes a text post now, or schedules it (at least 5 minutes ahead), on one or more of the brand's connected accounts (account_id from list_brands). Only post wording the user approved; never invent prices, offers or promises. Images aren't supported here yet: the owner can add them in Waggle.",
  access: "act",
  ability: "posts.write",
  annotations: PUBLIC_ACTION,
  wraps: "publishing.createPost",
  input: z.object({
    brand_id: brandId,
    content: z.string().trim().min(1).max(POST_TEXT_MAX),
    account_ids: z.array(z.uuid()).min(1).max(10),
    publish_at: z
      .union([z.literal("now"), z.iso.datetime({ offset: true })])
      .default("now")
      .describe('"now", or an ISO date-time with its timezone offset.'),
  }),
  output: z.object({
    post_id: z.uuid(),
    outcome: z.enum(["published", "scheduled", "waiting", "failed"]),
    problem: z.string().nullable(),
  }),
  async run(ctx, input) {
    const tenantId = await resolveBrand(ctx, input.brand_id);
    const r = await createPost(
      { db: ctx.db, social: ctx.social },
      {
        tenantId,
        userId: ctx.principal.userId,
        content: input.content,
        accountIds: input.account_ids,
        scheduledFor: input.publish_at === "now" ? null : new Date(input.publish_at),
        via: viaOf(ctx.principal),
        now: ctx.now?.(),
      },
    );
    if (!r.ok) {
      if (r.error === "not_accepted") {
        throw new ToolError(
          "invalid_input",
          r.problems.map((p) => `${platformLabel(p.platform)}: ${p.message}`).join(" "),
        );
      }
      const messages = {
        accounts_not_owned: "Use account_id values of this brand from list_brands.",
        account_disconnected:
          "One of these accounts is disconnected; the owner reconnects it in Waggle.",
        too_soon: "Schedule at least 5 minutes ahead, or use publish_at: now.",
        save_failed: "The post couldn't be saved. Try again.",
        consent_required:
          "TikTok needs the owner's confirmation on every post; the owner posts to TikTok in Waggle.",
      } as const;
      throw new ToolError(
        r.error === "save_failed" ? "unavailable" : "invalid_input",
        messages[r.error],
      );
    }
    return { post_id: r.postId, outcome: r.outcome, problem: r.error ?? null };
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
    "A brand's numbers from Instagram and Facebook, copied hourly (followers daily). overview: reach, engagement, followers and daily series vs the previous period; audience: followers over time, best times, age/city breakdowns; waggle_work: messages Waggle answered, how fast, leads. Raw numbers only: summarise them yourself.",
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
    const data =
      input.section === "overview"
        ? await loadOverview(ctx.db, tenantId, {
            period: input.period,
            platform: input.platform,
            platforms: [...new Set(accounts.map((a) => a.platform))],
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
    "How individual posts did (lifetime totals), including posts made directly on Instagram/Facebook. Without post_metric_id: posts published in the period, sorted. With post_metric_id: one post plus its reach over the first days.",
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
    const rows = await loadPostMetrics(ctx.db, tenantId, {
      from: new Date(to.getTime() - input.period * DAY_MS),
      to,
      platform: input.platform,
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
  createPostTool,
  cancelPostTool,
  getAnalytics,
  getPostPerformance,
];
