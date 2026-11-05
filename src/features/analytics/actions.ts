"use server";

import * as Sentry from "@sentry/nextjs";
import { getCurrentTenant } from "@/features/tenants";
import { getSocialProvider } from "@/lib/social";
import type { PostTimelinePoint } from "@/lib/social/analytics-types";
import type { Json } from "@/lib/supabase/database.types";
import { createServerSupabase } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import { loadPostDetail } from "./data";
import { timelineStale } from "./posts";

export type TimelineResult = { points: PostTimelinePoint[] } | { error: string };

const DAY_MS = 86_400_000;

/**
 * A post's first 14 days (T50). The only Zernio call a page makes while it's open: once per post,
 * then cached on its `post_metrics` row for 6 hours (and for good once the 14 days have settled).
 */
export async function fetchPostTimeline(postMetricId: string): Promise<TimelineResult> {
  const tenant = await getCurrentTenant();
  // Through RLS and the open brand: someone else's post id finds nothing.
  const post = await loadPostDetail(await createServerSupabase(), tenant.id, postMetricId);
  if (!post) return { error: "This post isn't in your numbers." };
  const now = new Date();
  if (post.timeline && !timelineStale(post, now)) return { points: post.timeline };

  const published = post.publishedAt ? new Date(post.publishedAt) : null;
  let points: PostTimelinePoint[];
  try {
    points = await getSocialProvider().getPostTimeline({
      postId: post.providerPostId,
      ...(published
        ? {
            fromDate: published.toISOString().slice(0, 10),
            toDate: new Date(Math.min(published.getTime() + 13 * DAY_MS, now.getTime()))
              .toISOString()
              .slice(0, 10),
          }
        : {}),
    });
  } catch (e) {
    // Ids only (rule 10).
    Sentry.captureException(e, { extra: { tenantId: tenant.id, postMetricId } });
    return post.timeline
      ? { points: post.timeline }
      : { error: "Couldn't load the first 14 days. Try again later." };
  }

  // Service role: post_metrics is read-only for owners; the post was checked above.
  await getServiceClient()
    .from("post_metrics")
    .update({ timeline: points as unknown as Json, timeline_synced_at: now.toISOString() })
    .eq("id", post.id)
    .eq("tenant_id", tenant.id);
  return { points };
}
