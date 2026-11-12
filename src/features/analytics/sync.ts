import * as Sentry from "@sentry/nextjs";
import type { Json } from "@/lib/supabase/database.types";
import { getPlatformPause } from "@/lib/social/platform-pause";
import type { ProviderPostMetrics } from "@/lib/social/analytics-types";
import { isAnalyticsLive } from "@/lib/social/platforms";
import { SocialProviderError, type SocialPlatform, type SocialProvider } from "@/lib/social/types";
import type { ServiceClient } from "@/lib/supabase/service";

// T48 (docs/tdd.md §7.7): Zernio's numbers copied into our tables, per Zernio's multi-tenant guide.
// Pages read the copies; only this job calls the analytics endpoints. Cadence per tenant:
// dashboards and the last 30 days of posts hourly, every post of the last 12 months once a week
// (likes keep arriving on old posts), audience daily (Zernio refreshes followers once a day).

export const ANALYTICS_HOURLY_MS = 60 * 60 * 1000;
export const ANALYTICS_FULL_MS = 7 * 24 * 60 * 60 * 1000;
export const ANALYTICS_AUDIENCE_MS = 24 * 60 * 60 * 1000;
export const ANALYTICS_PERIODS = [7, 30, 90] as const;
export type AnalyticsPeriod = (typeof ANALYTICS_PERIODS)[number];
export type AnalyticsPlatform = "all" | SocialPlatform;
const DAY_MS = 86_400_000;
/** Tenants per job run: each costs ~10-20 calls, and analytics share one budget. */
const TENANTS_PER_RUN = 3;

/** Pure: a period ending today (UTC days, both inclusive, as Zernio counts them). */
export function periodWindow(days: number, now: Date): { fromDate: string; toDate: string } {
  const toDate = now.toISOString().slice(0, 10);
  const fromDate = new Date(now.getTime() - (days - 1) * DAY_MS).toISOString().slice(0, 10);
  return { fromDate, toDate };
}

export const dashboardKey = (period: AnalyticsPeriod, platform: AnalyticsPlatform) =>
  `dashboard:${period}:${platform}`;
export const audienceKey = (socialAccountId: string) => `audience:${socialAccountId}`;
export const FOLLOWERS_KEY = "followers";
export const BEST_TIME_KEY = "best_time";

/** Pure: whether a part is due, from when it last ran. */
export function due(lastAt: string | null, everyMs: number, now: Date): boolean {
  return !lastAt || now.getTime() - new Date(lastAt).getTime() >= everyMs;
}

/** Pure: one post as a `post_metrics` row. */
export function postRow(tenantId: string, p: ProviderPostMetrics, syncedAt: string) {
  return {
    tenant_id: tenantId,
    provider_post_id: p.postId,
    platform: p.platform,
    zernio_post_id: p.zernioPostId,
    published_at: p.publishedAt,
    caption: p.caption.slice(0, 2000),
    permalink: p.permalink,
    thumbnail_url: p.thumbnailUrl,
    format: p.format,
    is_external: p.isExternal,
    sync_status: p.syncStatus,
    reach: Math.round(p.metrics.reach),
    impressions: Math.round(p.metrics.impressions),
    likes: Math.round(p.metrics.likes),
    comments: Math.round(p.metrics.comments),
    shares: Math.round(p.metrics.shares),
    saves: Math.round(p.metrics.saves),
    clicks: Math.round(p.metrics.clicks),
    views: Math.round(p.metrics.views),
    engagement_rate: Math.round(p.metrics.engagementRate * 100) / 100,
    synced_at: syncedAt,
  };
}

class RateLimited extends Error {}

const isRateLimit = (e: unknown) => e instanceof SocialProviderError && e.details.status === 429;
/** Plan or permission refusals (402/403): no point retrying within the hour. */
const isRefused = (e: unknown) =>
  e instanceof SocialProviderError && (e.details.status === 402 || e.details.status === 403);

interface Deps {
  db: ServiceClient;
  social: () => SocialProvider;
  shouldContinue: () => boolean;
  now?: () => Date;
}

export interface AnalyticsSyncSummary {
  tenants: number;
  posts: number;
  failed: number;
  rateLimited: boolean;
}

export async function syncAnalytics(deps: Deps): Promise<AnalyticsSyncSummary> {
  const { db } = deps;
  const summary: AnalyticsSyncSummary = { tenants: 0, posts: 0, failed: 0, rateLimited: false };
  if (await getPlatformPause(db)) return summary;
  const now = deps.now?.() ?? new Date();
  const hourAgo = new Date(now.getTime() - ANALYTICS_HOURLY_MS).toISOString();

  const { data: tenants, error } = await db
    .from("tenants")
    .select(
      "id, zernio_profile_id, analytics_synced_at, analytics_full_at, analytics_audience_at, social_accounts!inner(id)",
    )
    .not("zernio_profile_id", "is", null)
    .eq("social_accounts.status", "active")
    .or(`analytics_synced_at.is.null,analytics_synced_at.lt.${hourAgo}`)
    .order("analytics_synced_at", { ascending: true, nullsFirst: true })
    .limit(TENANTS_PER_RUN);
  if (error) throw new Error(`analytics: tenants lookup failed: ${error.message}`);

  const social = deps.social();
  for (const tenant of tenants ?? []) {
    if (!deps.shouldContinue()) break;
    summary.tenants += 1;
    try {
      summary.posts += await syncTenant(db, social, tenant, now, deps.shouldContinue);
    } catch (e) {
      if (e instanceof RateLimited || isRateLimit(e)) {
        // Zernio's analytics budget is shared: stop the whole pass, try again next run.
        summary.rateLimited = true;
        break;
      }
      summary.failed += 1;
      if (!isRefused(e)) Sentry.captureException(e, { extra: { tenantId: tenant.id } });
      // Marked as synced so one failing brand isn't retried every minute; next try in an hour.
      await db
        .from("tenants")
        .update({ analytics_synced_at: now.toISOString() })
        .eq("id", tenant.id);
    }
  }
  return summary;
}

async function syncTenant(
  db: ServiceClient,
  social: SocialProvider,
  tenant: {
    id: string;
    zernio_profile_id: string | null;
    analytics_full_at: string | null;
    analytics_audience_at: string | null;
  },
  now: Date,
  shouldContinue: () => boolean,
): Promise<number> {
  const profileId = tenant.zernio_profile_id!;
  const syncedAt = now.toISOString();
  const { data: accounts } = await db
    .from("social_accounts")
    .select("id, platform, zernio_account_id, username")
    .eq("tenant_id", tenant.id)
    .eq("status", "active");
  // Per-platform views only where the analytics pages cover the platform (the "all" view and
  // post numbers include every platform).
  const platforms = [
    ...new Set(
      (accounts ?? []).map((a) => a.platform).filter((p) => isAnalyticsLive(p)) as SocialPlatform[],
    ),
  ];

  const save = async (key: string, data: unknown) => {
    const { error } = await db
      .from("analytics_snapshots")
      .upsert(
        { tenant_id: tenant.id, key, data: data as Json, synced_at: syncedAt },
        { onConflict: "tenant_id,key" },
      );
    if (error) throw new Error(`analytics: saving ${key} failed: ${error.message}`);
  };

  // 1. Dashboards: each period, for all platforms and for each connected one.
  for (const period of ANALYTICS_PERIODS) {
    for (const platform of ["all", ...platforms] as AnalyticsPlatform[]) {
      if (!shouldContinue()) throw new RateLimited("out of time");
      const summary = await social.getAnalyticsDashboard({
        profileId,
        ...periodWindow(period, now),
        ...(platform === "all" ? {} : { platform }),
      });
      await save(dashboardKey(period, platform), summary);
    }
  }

  // 2. Posts: the last 30 days hourly, the last 12 months when the weekly pass is due.
  const full = due(tenant.analytics_full_at, ANALYTICS_FULL_MS, now);
  const window = periodWindow(full ? 366 : 30, now);
  let stored = 0;
  for (let page = 1; ; page++) {
    const { posts, pages } = await social.listPostAnalytics({ profileId, ...window, page });
    if (posts.length) {
      const { error } = await db.from("post_metrics").upsert(
        posts.map((p) => postRow(tenant.id, p, syncedAt)),
        { onConflict: "tenant_id,provider_post_id,platform" },
      );
      if (error) throw new Error(`analytics: saving posts failed: ${error.message}`);
      stored += posts.length;
    }
    if (page >= pages || !posts.length) break;
  }

  // 3. Audience, daily: followers, best times, and each account's breakdowns.
  const audienceDue = due(tenant.analytics_audience_at, ANALYTICS_AUDIENCE_MS, now);
  if (audienceDue) {
    const series = await social.getFollowerStats({ profileId, ...periodWindow(90, now) });
    const byZernioId = new Map((accounts ?? []).map((a) => [a.zernio_account_id, a]));
    await save(FOLLOWERS_KEY, {
      accounts: series.map((s) => ({
        socialAccountId: byZernioId.get(s.accountId)?.id ?? null,
        platform: byZernioId.get(s.accountId)?.platform ?? null,
        username: byZernioId.get(s.accountId)?.username ?? null,
        points: s.points,
      })),
    });
    await save(BEST_TIME_KEY, { slots: await social.getBestTimeToPost({ profileId }) });
    for (const account of accounts ?? []) {
      if (!isAnalyticsLive(account.platform)) continue;
      const platform = account.platform as SocialPlatform;
      // Meta refuses breakdowns under 100 followers: that's a normal state, kept as a reason.
      const demographics = await social
        .getDemographics({ accountId: account.zernio_account_id, platform })
        .catch((e) => {
          if (isRateLimit(e)) throw e;
          return null;
        });
      const online =
        platform === "instagram"
          ? await social.getOnlineFollowers({ accountId: account.zernio_account_id }).catch((e) => {
              if (isRateLimit(e)) throw e;
              return null;
            })
          : null;
      await save(audienceKey(account.id), {
        platform,
        username: account.username,
        demographics,
        online,
      });
    }
  }

  const { error } = await db
    .from("tenants")
    .update({
      analytics_synced_at: syncedAt,
      ...(full ? { analytics_full_at: syncedAt } : {}),
      ...(audienceDue ? { analytics_audience_at: syncedAt } : {}),
    })
    .eq("id", tenant.id);
  if (error) throw new Error(`analytics: marking synced failed: ${error.message}`);
  return stored;
}
