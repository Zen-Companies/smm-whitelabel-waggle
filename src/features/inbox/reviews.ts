import { getPlatformPause } from "@/lib/social/platform-pause";
import type { ProviderReview, SocialProvider } from "@/lib/social/types";
import type { ServiceClient } from "@/lib/supabase/service";
import { insertInboundItem } from "./items";

// T42 (docs/tdd.md §7.6): Facebook sends no review webhooks, so the job reads each connected
// Page's reviews every few minutes and stores new ones as `review` items, like a webhook would.
// Only verify, dedupe and store here: classifying and drafting happen in the normal steps.

/** How often one Page's reviews are read. Zernio caches a listing ~60 s anyway. */
export const REVIEWS_POLL_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Pure: the reviews to store. Ones that already have a reply (from the Page or an earlier run)
 * need nothing, and ones written before the Page was connected aren't brought in.
 */
export function newReviews(reviews: ProviderReview[], connectedAt: string): ProviderReview[] {
  const since = new Date(connectedAt).getTime();
  return reviews.filter((r) => !r.hasReply && new Date(r.createdAt).getTime() >= since);
}

/** Pure: whether a Page is due for a read. */
export function reviewsDue(polledAt: string | null, now: Date): boolean {
  return !polledAt || now.getTime() - new Date(polledAt).getTime() >= REVIEWS_POLL_INTERVAL_MS;
}

export async function pollFacebookReviews(deps: {
  db: ServiceClient;
  social: () => SocialProvider;
  shouldContinue: () => boolean;
  now?: () => Date;
}): Promise<{ pages: number; created: number; failed: number }> {
  const { db } = deps;
  const summary = { pages: 0, created: 0, failed: 0 };
  if (await getPlatformPause(db)) return summary;
  const now = deps.now?.() ?? new Date();

  const { data: accounts, error } = await db
    .from("social_accounts")
    .select("id, tenant_id, zernio_account_id, created_at, reviews_polled_at")
    .eq("platform", "facebook")
    .eq("status", "active")
    .order("reviews_polled_at", { ascending: true, nullsFirst: true })
    .limit(20);
  if (error) throw new Error(`reviews: accounts lookup failed: ${error.message}`);

  const social = deps.social();
  for (const account of accounts ?? []) {
    if (!deps.shouldContinue()) break;
    if (!reviewsDue(account.reviews_polled_at, now)) continue;
    summary.pages += 1;
    let reviews: ProviderReview[];
    try {
      reviews = await social.listReviews({ accountId: account.zernio_account_id });
    } catch {
      // Tried again next time; one Page failing doesn't stop the others. Ids only (rule 10).
      summary.failed += 1;
      continue;
    }
    for (const review of newReviews(reviews, account.created_at)) {
      const { created } = await insertInboundItem(db, {
        kind: "review",
        tenantId: account.tenant_id,
        socialAccountId: account.id,
        authorName: review.reviewerName,
        text: review.text,
        receivedAt: review.createdAt,
        zernioReviewId: review.id,
        recommends: review.recommends,
        permalink: review.reviewUrl,
      });
      if (created) summary.created += 1;
    }
    await db
      .from("social_accounts")
      .update({ reviews_polled_at: now.toISOString() })
      .eq("id", account.id);
  }
  return summary;
}
