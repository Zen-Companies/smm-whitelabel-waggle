/**
 * Local Analytics data without Zernio: fills one tenant's `analytics_snapshots` and `post_metrics`
 * from the mock generators (src/lib/social/mock-analytics.ts), in the shapes the sync job stores.
 *
 *   pnpm analytics:seed                      # the demo tenant (Harbour Bean Café)
 *   pnpm analytics:seed --tenant <uuid>
 *
 * Writes straight to the tables (never runs the job, never calls Zernio), replacing earlier mock
 * post rows. Also:
 * - adds a published `posts` row for each recent post "made in Waggle", so the page can tell them
 *   from posts made on the platform (rerunning replaces those rows);
 * - points the tenant's comments at those posts, for "Comments on this post";
 * - stores each post's first 14 days with a far-future `timeline_synced_at`, so opening a post
 *   never asks Zernio for a mock post's timeline.
 * Refuses anything but a local Supabase.
 */
import { createClient } from "@supabase/supabase-js";
import {
  ANALYTICS_PERIODS,
  audienceKey,
  BEST_TIME_KEY,
  dashboardKey,
  FOLLOWERS_KEY,
  periodWindow,
  postRow,
} from "@/features/analytics/sync";
import {
  MOCK_BEST_TIMES,
  mockDashboard,
  mockDemographics,
  mockFollowerSeries,
  mockOnlineFollowers,
  mockPosts,
  mockTimeline,
} from "@/lib/social/mock-analytics";
import type { Json } from "@/lib/supabase/database.types";
import type { ServiceClient } from "@/lib/supabase/service";

try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local: use the environment as is.
}

const DEMO_TENANT = "10000000-0000-4000-8000-000000000001";
const NEVER = "2999-01-01T00:00:00.000Z";
const DAY = 86_400_000;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url)) {
    throw new Error(`refusing to seed ${url || "an unset URL"}: local Supabase only`);
  }
  const tenantId = arg("tenant") ?? DEMO_TENANT;
  const db = createClient(url, key, {
    auth: { persistSession: false },
  }) as unknown as ServiceClient;

  const { data: tenant } = await db
    .from("tenants")
    .select("id, name, zernio_profile_id")
    .eq("id", tenantId)
    .maybeSingle();
  if (!tenant) throw new Error(`No tenant ${tenantId}.`);
  const { data: accounts } = await db
    .from("social_accounts")
    .select("id, platform, username")
    .eq("tenant_id", tenantId)
    .order("created_at");
  if (!accounts?.length) {
    throw new Error(`${tenant.name} has no social accounts: run pnpm demo:seed or connect one.`);
  }
  const profileId = tenant.zernio_profile_id ?? `local_${tenantId.slice(0, 8)}`;
  const platforms = [...new Set(accounts.map((a) => a.platform))];
  const byPlatform = new Map(accounts.map((a) => [a.platform, a]));
  const now = new Date();
  const syncedAt = now.toISOString();

  const save = async (k: string, data: unknown) => {
    const { error } = await db
      .from("analytics_snapshots")
      .upsert(
        { tenant_id: tenantId, key: k, data: data as Json, synced_at: syncedAt },
        { onConflict: "tenant_id,key" },
      );
    if (error) throw new Error(`saving ${k} failed: ${error.message}`);
  };

  // 1. Dashboards, as the hourly pass stores them.
  for (const period of ANALYTICS_PERIODS) {
    for (const platform of ["all", ...platforms]) {
      await save(
        dashboardKey(period, platform as "all"),
        mockDashboard({
          profileId,
          ...periodWindow(period, now),
          ...(platform === "all" ? {} : { platform }),
        }),
      );
    }
  }

  // 2. Posts of the last 12 months, only on the platforms this brand has.
  const posts = mockPosts(
    profileId,
    periodWindow(366, now).fromDate,
    periodWindow(366, now).toDate,
  ).filter((p) => byPlatform.has(p.platform));
  const rows = posts.map((p) => ({
    ...postRow(tenantId, p, syncedAt),
    timeline: mockTimeline(p.postId) as unknown as Json,
    timeline_synced_at: NEVER,
  }));
  // Mock rows from earlier runs (or an earlier mock) go first, so only this run's posts remain.
  await db
    .from("post_metrics")
    .delete()
    .eq("tenant_id", tenantId)
    .like("provider_post_id", "mock_post_%");
  const { error: postsError } = await db
    .from("post_metrics")
    .upsert(rows, { onConflict: "tenant_id,provider_post_id,platform" });
  if (postsError) throw new Error(`saving posts failed: ${postsError.message}`);

  // Posts made in Waggle in the last 90 days get their `posts` row (the page joins on it).
  await db.from("posts").delete().eq("tenant_id", tenantId).like("zernio_post_id", "mock_zpost_%");
  const recent = posts.filter(
    (p) =>
      p.zernioPostId &&
      !p.isExternal &&
      p.publishedAt &&
      now.getTime() - Date.parse(p.publishedAt) < 90 * DAY,
  );
  for (const p of recent) {
    const { error } = await db.from("posts").insert({
      tenant_id: tenantId,
      content: p.caption,
      target_account_ids: [byPlatform.get(p.platform)!.id],
      status: "published",
      published_at: p.publishedAt,
      scheduled_for: p.publishedAt,
      zernio_post_id: p.zernioPostId,
      created_at: p.publishedAt!,
    });
    if (error) throw new Error(`saving a post failed: ${error.message}`);
  }

  // Comments on the newest Waggle posts, round-robin, so post details show what Waggle did.
  const targets = [...recent]
    .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""))
    .slice(0, 4);
  const { data: comments } = await db
    .from("inbound_items")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("kind", "comment")
    .order("received_at");
  if (targets.length) {
    for (const [i, c] of (comments ?? []).entries()) {
      await db
        .from("inbound_items")
        .update({ zernio_post_id: targets[i % targets.length].postId })
        .eq("id", c.id);
    }
  }

  // 3. Audience, as the daily pass stores it.
  const mockAccount: Record<string, string> = { mock_ig: "instagram", mock_fb: "facebook" };
  const series = mockFollowerSeries(periodWindow(90, now).fromDate, periodWindow(90, now).toDate);
  await save(FOLLOWERS_KEY, {
    accounts: series.flatMap((s) => {
      const account = byPlatform.get(mockAccount[s.accountId]);
      return account
        ? [
            {
              socialAccountId: account.id,
              platform: account.platform,
              username: account.username,
              points: s.points,
            },
          ]
        : [];
    }),
  });
  await save(BEST_TIME_KEY, { slots: MOCK_BEST_TIMES });
  for (const a of accounts) {
    await save(audienceKey(a.id), {
      platform: a.platform,
      username: a.username,
      demographics: mockDemographics(a.platform),
      online: a.platform === "instagram" ? mockOnlineFollowers() : null,
    });
  }

  // Marked as just synced, so the job doesn't pick this brand up within the hour.
  await db
    .from("tenants")
    .update({
      analytics_synced_at: syncedAt,
      analytics_full_at: syncedAt,
      analytics_audience_at: syncedAt,
    })
    .eq("id", tenantId);

  console.log(
    `Analytics for ${tenant.name}: ${rows.length} posts (${recent.length} made in Waggle), ` +
      `${(comments ?? []).length} comments linked, dashboards for ${platforms.join(" and ")}.`,
  );
  console.log("Open http://localhost:3000/analytics");
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
