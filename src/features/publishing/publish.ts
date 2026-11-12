import * as Sentry from "@sentry/nextjs";
import { writeAudit } from "@/lib/audit";
import { platformLabel } from "@/lib/social/platforms";
import {
  getPlatformPause,
  PLATFORM_PAUSE_RETRY_SECONDS,
  recordPlatformPause,
} from "@/lib/social/platform-pause";
import {
  isSocialPlatform,
  SocialProviderError,
  type ProviderPostStatus,
  type SocialProvider,
} from "@/lib/social/types";
import { isPlatformPaused } from "@/lib/social/zernio";
import type { ServiceClient } from "@/lib/supabase/service";

// Hands a queued post to Zernio (PRD F3, docs/tdd.md §7.5). Called right after compose (so
// "publish now" is immediate) and by the job route for posts still queued. The post's
// idempotency key makes a retry after a lost response return the same Zernio post.

/** Attempts with an unclear outcome (5xx, timeout) before the post is marked failed. */
export const POST_MAX_ATTEMPTS = 3;

export type PublishResult =
  | { outcome: "submitted"; status: string }
  | { outcome: "retry_later"; reason: "zernio_paused" | "rate_limited" | "unclear" }
  | { outcome: "failed"; error: string }
  | { outcome: "skipped" };

const STATUS: Partial<Record<ProviderPostStatus, string>> = {
  scheduled: "scheduled",
  publishing: "publishing",
  published: "published",
  partial: "partial",
  failed: "failed",
  cancelled: "cancelled",
};

/** Owner-facing reasons for a refused post (design.md §7: plain words). */
export function postErrorMessage(error: SocialProviderError): string {
  const { status, code } = error.details;
  if (status === 409) {
    return "You posted the same text to this account in the last 24 hours. Change the text, then try again.";
  }
  if (status === 400 || status === 422) {
    return "Instagram/Facebook didn't accept this post. Check the text and image, then try again.";
  }
  if (status === 401 || status === 403) {
    return "The account isn't allowed to post right now. Reconnect it in Settings, then try again.";
  }
  if (status === 404)
    return "One of the accounts can no longer be found. Reconnect it, then try again.";
  return `The post couldn't be published${code ? ` (${code})` : ""}. Try again.`;
}

export async function publishPost(
  deps: { db: ServiceClient; social: () => SocialProvider; now?: Date; signal?: AbortSignal },
  postId: string,
): Promise<PublishResult> {
  const { db } = deps;
  const now = deps.now ?? new Date();
  const { data: post, error } = await db
    .from("posts")
    .select(
      "id, tenant_id, content, media, target_account_ids, scheduled_for, status, idempotency_key, attempts, tiktok_consent_at, platform_options",
    )
    .eq("id", postId)
    .single();
  if (error) throw new Error(`post lookup failed: ${error.message}`);
  if (post.status !== "queued") return { outcome: "skipped" };

  const later = (seconds: number) =>
    db
      .from("posts")
      .update({ next_attempt_at: new Date(now.getTime() + seconds * 1000).toISOString() })
      .eq("id", post.id);
  const fail = async (message: string, details: Record<string, string | number | null>) => {
    await db
      .from("posts")
      .update({ status: "failed", last_error: message, next_attempt_at: null })
      .eq("id", post.id);
    await writeAudit(db, {
      tenantId: post.tenant_id,
      action: "post_failed",
      actor: "system",
      details: { postId: post.id, ...details },
    });
    return { outcome: "failed" as const, error: message };
  };

  // T19: Zernio paused for billing. The post waits here; nothing is sent.
  if (await getPlatformPause(db)) {
    await later(PLATFORM_PAUSE_RETRY_SECONDS);
    return { outcome: "retry_later", reason: "zernio_paused" };
  }

  // Only this tenant's own, connected accounts (Zernio accepts any account of the team).
  const { data: accounts } = await db
    .from("social_accounts")
    .select("id, zernio_account_id, platform, username, status")
    .eq("tenant_id", post.tenant_id)
    .in("id", post.target_account_ids);
  const down = (accounts ?? []).filter((a) => a.status !== "active");
  if (!accounts?.length || accounts.length !== post.target_account_ids.length) {
    return fail("Pick at least one connected account.", { reason: "no_accounts" });
  }
  if (down.length) {
    const names = down
      .map((a) => `${platformLabel(a.platform)} @${a.username ?? "account"}`)
      .join(", ");
    return fail(`${names} is disconnected. Reconnect it in Settings, then try again.`, {
      reason: "account_inactive",
    });
  }

  const scheduledFor = post.scheduled_for ? new Date(post.scheduled_for) : null;
  const media = (post.media as { url?: string }[] | null) ?? [];
  try {
    const result = await deps.social().createPost({
      content: post.content,
      mediaUrls: media.flatMap((m) => (m.url ? [m.url] : [])),
      targets: accounts.flatMap((a) =>
        isSocialPlatform(a.platform)
          ? [{ platform: a.platform, accountId: a.zernio_account_id }]
          : [],
      ),
      // A time already in the past (e.g. retried after a pause) publishes now.
      publishAt: scheduledFor && scheduledFor > now ? scheduledFor : null,
      idempotencyKey: post.idempotency_key,
      tiktokConsent: post.tiktok_consent_at !== null,
      youtubeTitle: platformOptions(post.platform_options).youtube?.title,
    });
    const status = STATUS[result.status] ?? "publishing";
    await db
      .from("posts")
      .update({
        zernio_post_id: result.providerPostId,
        status,
        attempts: 0,
        next_attempt_at: null,
        last_error: null,
      })
      .eq("id", post.id);
    await writeAudit(db, {
      tenantId: post.tenant_id,
      action: "post_submitted",
      actor: "system",
      details: { postId: post.id, zernioPostId: result.providerPostId, status },
    });
    return { outcome: "submitted", status };
  } catch (err) {
    if (isPlatformPaused(err)) {
      await recordPlatformPause(db, now);
      await later(PLATFORM_PAUSE_RETRY_SECONDS);
      return { outcome: "retry_later", reason: "zernio_paused" };
    }
    if (!(err instanceof SocialProviderError)) throw err;
    const { status, code, ambiguous, retryAfterSeconds } = err.details;
    if (status === 429 || (status === 409 && code === "idempotency_conflict")) {
      await later(retryAfterSeconds ?? 60);
      return { outcome: "retry_later", reason: "rate_limited" };
    }
    if (ambiguous) {
      const attempts = post.attempts + 1;
      if (attempts >= POST_MAX_ATTEMPTS) {
        Sentry.captureException(err, { extra: { postId: post.id } });
        return fail("The post couldn't be published. Try again.", { reason: "retries_exhausted" });
      }
      await db
        .from("posts")
        .update({
          attempts,
          next_attempt_at: new Date(now.getTime() + 2 ** attempts * 60_000).toISOString(),
        })
        .eq("id", post.id);
      return { outcome: "retry_later", reason: "unclear" };
    }
    return fail(postErrorMessage(err), { status: status ?? null, code: code ?? null });
  }
}

/** Job route: posts still queued and due (after a pause, a rate limit or an unclear error). */
export async function publishQueuedPosts(
  deps: { db: ServiceClient; social: () => SocialProvider; shouldContinue?: () => boolean },
  opts: { tenantId?: string; limit?: number } = {},
): Promise<{ submitted: number; failed: number; waiting: number }> {
  const now = new Date();
  let query = deps.db
    .from("posts")
    .select("id")
    .eq("status", "queued")
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${now.toISOString()}`)
    .order("created_at")
    .limit(opts.limit ?? 10);
  if (opts.tenantId) query = query.eq("tenant_id", opts.tenantId);
  const { data, error } = await query;
  if (error) throw new Error(`queued posts lookup failed: ${error.message}`);
  const summary = { submitted: 0, failed: 0, waiting: 0 };
  for (const { id } of data ?? []) {
    if (deps.shouldContinue && !deps.shouldContinue()) break;
    const r = await publishPost(deps, id);
    if (r.outcome === "submitted") summary.submitted += 1;
    else if (r.outcome === "failed") summary.failed += 1;
    else if (r.outcome === "retry_later") summary.waiting += 1;
    // One pause stops the rest: they would all wait the same way.
    if (r.outcome === "retry_later" && r.reason === "zernio_paused") break;
  }
  return summary;
}

/** The post's per-platform choices (T63), read defensively: it's free-form JSON in the row. */
function platformOptions(value: unknown): { youtube?: { title?: string } } {
  if (!value || typeof value !== "object") return {};
  const youtube = (value as { youtube?: unknown }).youtube;
  const title =
    youtube && typeof youtube === "object" ? (youtube as { title?: unknown }).title : undefined;
  return typeof title === "string" && title ? { youtube: { title } } : {};
}
