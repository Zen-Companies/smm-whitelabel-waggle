import { randomUUID } from "node:crypto";
import * as Sentry from "@sentry/nextjs";
import { writeAudit } from "@/lib/audit";
import { recordPlatformPause } from "@/lib/social/platform-pause";
import {
  SocialProviderError,
  type PostPlatformResult,
  type ProviderPostStatus,
} from "@/lib/social/types";
import { customerText } from "@/lib/social/whitelabel";
import { isPlatformPaused } from "@/lib/social/zernio";
import type { Json } from "@/lib/supabase/database.types";
import { platformList, postErrorMessage, publishPost } from "./publish";
import type { PostDeps } from "./posts";

// "Try again" on a post that didn't go out everywhere (Posts round 1, 25 Nov). A post Zernio
// already has is retried there (`POST /v1/posts/{id}/retry`): only the platforms that didn't
// publish are tried again, so an account that already has the post never gets it twice. A post
// Zernio never took (refused at create, cancelled, or moved to a new time) is sent again whole.

export type RetryPath = "zernio_retry" | "send_again" | "not_allowed";

/** Pure: how a post is tried again, or not at all. */
export function retryPath(
  post: { status: string; zernio_post_id: string | null; failure_reason: string | null },
  rescheduling: boolean,
): RetryPath {
  if (post.status === "partial") {
    // Zernio's retry is immediate, and sending it again at a new time would post it twice to
    // the accounts that already have it.
    return post.zernio_post_id && !rescheduling ? "zernio_retry" : "not_allowed";
  }
  if (post.status === "failed") {
    return post.zernio_post_id && !rescheduling ? "zernio_retry" : "send_again";
  }
  if (post.status === "cancelled" && post.failure_reason && post.failure_reason !== "taken_down") {
    return "send_again";
  }
  return "not_allowed";
}

/** Pure: the row's status after Zernio's retry answered. */
export function statusAfterRetry(status: ProviderPostStatus): string {
  if (status === "published" || status === "partial" || status === "failed") return status;
  if (status === "cancelled") return "cancelled";
  // "scheduled": Zernio retries transient errors itself in a moment.
  return "publishing";
}

/** Pure: the failed platforms' errors as one line for `posts.last_error`. */
export function failedSummary(results: PostPlatformResult[]): string | null {
  const failed = results.filter((r) => r.status === "failed");
  if (!failed.length) return null;
  return failed.map((r) => `${r.platform}: ${r.error ?? "not posted"}`).join("; ");
}

/** Pure: the owner's words when Zernio's retry call itself fails. */
export function retryErrorMessage(error: SocialProviderError, platforms: string[]): string {
  const { status, code, ambiguous } = error.details;
  if (ambiguous) {
    return "We couldn't tell whether it went through. It updates here on its own in a minute; if it's still marked then, try again.";
  }
  if (status === 409) {
    return "It's posting right now, or the same text already went to this account in the last 24 hours. Wait a minute, then check again.";
  }
  if (status === 400 && code === "invalid_resource_state") {
    return "There's nothing left to try again: it shows here once the platforms confirm.";
  }
  if (status === 429) return `${platformList(platforms)} is busy. Try again in a few minutes.`;
  return postErrorMessage(error, platforms);
}

export type RetryResult = { ok: true; outcome: string } | { ok: false; error: string };

/**
 * Tries a failed, partial or cancelled post again (owner action, audited). `scheduledFor`
 * moves a post that never went out to a new time.
 */
export async function retryPost(
  deps: PostDeps,
  input: { tenantId: string; userId: string; postId: string; scheduledFor: Date | null },
): Promise<RetryResult> {
  const { db } = deps;
  const { data: post } = await db
    .from("posts")
    .select("id, status, zernio_post_id, failure_reason, target_account_ids")
    .eq("id", input.postId)
    .eq("tenant_id", input.tenantId)
    .maybeSingle();
  if (!post) return { ok: false, error: "This post can't be retried." };
  const path = retryPath(post, !!input.scheduledFor);
  if (path === "not_allowed") {
    return {
      ok: false,
      error:
        post.status === "partial"
          ? "This post is already live on some accounts, so it can only be tried again now."
          : "This post can't be retried.",
    };
  }
  const { data: accounts } = await db
    .from("social_accounts")
    .select("platform")
    .eq("tenant_id", input.tenantId)
    .in("id", post.target_account_ids);
  const platforms = (accounts ?? []).map((a) => a.platform);

  if (path === "zernio_retry" && post.zernio_post_id) {
    await writeAudit(db, {
      tenantId: input.tenantId,
      action: "post_retried",
      actor: input.userId,
      details: { postId: post.id, how: "zernio_retry", from: post.status },
    });
    try {
      const r = await deps.social().retryPost({
        postId: post.zernio_post_id,
        idempotencyKey: randomUUID(),
        signal: AbortSignal.timeout(30_000),
      });
      const status = statusAfterRetry(r.status);
      const results = r.results.map((p) => ({ ...p, error: customerText(p.error) }));
      await db
        .from("posts")
        .update({
          status,
          failure_reason: null,
          last_error: failedSummary(results),
          platform_results: results as unknown as Json,
          next_attempt_at: null,
          ...(status === "published" ? { published_at: new Date().toISOString() } : {}),
        })
        .eq("id", post.id);
      await writeAudit(db, {
        tenantId: input.tenantId,
        action: "post_status_changed",
        actor: "system",
        details: { postId: post.id, zernioPostId: post.zernio_post_id, status, via: "retry" },
      });
      if (status === "failed" || status === "partial") {
        return {
          ok: false,
          error:
            status === "partial"
              ? "It went out to more accounts, but not all. The ones still missing are listed above."
              : "It still didn't go out. The reason for each account is listed above.",
        };
      }
      return { ok: true, outcome: status };
    } catch (error) {
      if (isPlatformPaused(error)) {
        await recordPlatformPause(db);
        return { ok: false, error: "Posting is paused on our side right now. Try again later." };
      }
      if (!(error instanceof SocialProviderError)) throw error;
      // Zernio no longer has a post that never went out anywhere: send it again whole.
      if (!(error.details.status === 404 && post.status === "failed")) {
        // A 5xx or timeout: the retry may have run. Nothing is retried again from here; the
        // post.* webhook settles the row, and the owner can press again once it has.
        if (error.details.ambiguous) {
          Sentry.captureException(error, { extra: { postId: post.id, step: "retryPost" } });
        }
        return { ok: false, error: retryErrorMessage(error, platforms) };
      }
    }
  }

  // Send it again whole, with a new key: the old one would replay the failure.
  const { data: updated } = await db
    .from("posts")
    .update({
      status: "queued",
      idempotency_key: randomUUID(),
      zernio_post_id: null,
      scheduled_for: input.scheduledFor?.toISOString() ?? null,
      failure_reason: null,
      last_error: null,
      attempts: 0,
      next_attempt_at: null,
      platform_results: [],
    })
    .eq("id", post.id)
    .eq("tenant_id", input.tenantId)
    .in("status", ["failed", "cancelled"])
    .select("id");
  if (!updated?.length) return { ok: false, error: "This post can't be retried." };
  await writeAudit(db, {
    tenantId: input.tenantId,
    action: "post_retried",
    actor: input.userId,
    details: { postId: post.id, how: "send_again", rescheduled: !!input.scheduledFor },
  });
  const result = await publishPost({ db, social: deps.social }, post.id);
  return result.outcome === "failed"
    ? { ok: false, error: result.error }
    : { ok: true, outcome: result.outcome };
}
