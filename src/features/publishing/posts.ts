import { writeAudit } from "@/lib/audit";
import { recordPlatformPause } from "@/lib/social/platform-pause";
import { SocialProviderError, type SocialProvider } from "@/lib/social/types";
import { isPlatformPaused } from "@/lib/social/zernio";
import type { ServiceClient } from "@/lib/supabase/service";
import { publishPost } from "./publish";

// Post creation and cancelling without a form: the Server Actions (compose card) and the MCP
// tools both call these with a tenant they have already checked.

/** Scheduled posts must be at least this far ahead (the compose card says the same). */
export const MIN_SCHEDULE_AHEAD_MS = 5 * 60_000;

export interface PostDeps {
  db: ServiceClient;
  social: () => SocialProvider;
}

export type CreatePostResult =
  | {
      ok: true;
      postId: string;
      outcome: "published" | "scheduled" | "waiting" | "failed";
      error?: string;
    }
  | {
      ok: false;
      error: "accounts_not_owned" | "account_disconnected" | "too_soon" | "save_failed";
    };

/**
 * Saves a post and hands it to the publisher. Only the tenant's own active accounts (Zernio
 * would accept any account of the team). `actor` is the user, with `via` when an AI assistant
 * made the call.
 */
export async function createPost(
  deps: PostDeps,
  input: {
    tenantId: string;
    userId: string;
    content: string;
    accountIds: string[];
    scheduledFor: Date | null;
    media?: { url: string }[];
    via?: Record<string, string>;
    now?: Date;
  },
): Promise<CreatePostResult> {
  const { db } = deps;
  const now = input.now ?? new Date();
  if (input.scheduledFor && input.scheduledFor.getTime() < now.getTime() + MIN_SCHEDULE_AHEAD_MS) {
    return { ok: false, error: "too_soon" };
  }
  const accountIds = [...new Set(input.accountIds)];
  const { data: owned } = await db
    .from("social_accounts")
    .select("id, status")
    .eq("tenant_id", input.tenantId)
    .in("id", accountIds);
  if (!accountIds.length || owned?.length !== accountIds.length) {
    return { ok: false, error: "accounts_not_owned" };
  }
  if (owned.some((a) => a.status !== "active")) return { ok: false, error: "account_disconnected" };

  const media = input.media ?? [];
  const { data: post, error } = await db
    .from("posts")
    .insert({
      tenant_id: input.tenantId,
      content: input.content,
      media,
      target_account_ids: accountIds,
      scheduled_for: input.scheduledFor?.toISOString() ?? null,
      status: "queued",
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: "save_failed" };
  await writeAudit(db, {
    tenantId: input.tenantId,
    action: "post_created",
    actor: input.userId,
    details: {
      postId: post.id,
      scheduled: !!input.scheduledFor,
      accounts: accountIds.length,
      image: media.length > 0,
      ...(input.via ? { via: input.via } : {}),
    },
  });

  const result = await publishPost({ db, social: deps.social }, post.id);
  if (result.outcome === "failed") {
    return { ok: true, postId: post.id, outcome: "failed", error: result.error };
  }
  if (result.outcome === "retry_later") return { ok: true, postId: post.id, outcome: "waiting" };
  return { ok: true, postId: post.id, outcome: input.scheduledFor ? "scheduled" : "published" };
}

export type CancelPostResult =
  { ok: true } | { ok: false; error: "not_cancellable" | "provider_failed" };

/** Cancels a scheduled or queued post: Zernio first, then here. */
export async function cancelScheduledPost(
  deps: PostDeps,
  input: { tenantId: string; userId: string; postId: string; via?: Record<string, string> },
): Promise<CancelPostResult> {
  const { db } = deps;
  const { data: post } = await db
    .from("posts")
    .select("id, status, zernio_post_id")
    .eq("id", input.postId)
    .eq("tenant_id", input.tenantId)
    .maybeSingle();
  if (!post || !["scheduled", "queued"].includes(post.status)) {
    return { ok: false, error: "not_cancellable" };
  }
  if (post.zernio_post_id) {
    try {
      await deps.social().deletePost({
        postId: post.zernio_post_id,
        signal: AbortSignal.timeout(20_000),
      });
    } catch (error) {
      if (isPlatformPaused(error)) await recordPlatformPause(db);
      if (!(error instanceof SocialProviderError) || error.details.status !== 404) {
        return { ok: false, error: "provider_failed" };
      }
    }
  }
  await db.from("posts").update({ status: "cancelled", failure_reason: null }).eq("id", post.id);
  await writeAudit(db, {
    tenantId: input.tenantId,
    action: "post_cancelled",
    actor: input.userId,
    details: { postId: post.id, ...(input.via ? { via: input.via } : {}) },
  });
  return { ok: true };
}
