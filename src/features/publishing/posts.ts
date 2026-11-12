import * as Sentry from "@sentry/nextjs";
import { writeAudit } from "@/lib/audit";
import { isSocialPlatform, isVideoUrl } from "@/lib/social/types";
import { recordPlatformPause } from "@/lib/social/platform-pause";
import { SocialProviderError, type SocialProvider } from "@/lib/social/types";
import { isPlatformPaused } from "@/lib/social/zernio";
import type { ServiceClient } from "@/lib/supabase/service";
import { checkPlatform, type RuleCheck } from "./post-rules";
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
      error:
        | "accounts_not_owned"
        | "account_disconnected"
        | "too_soon"
        | "save_failed"
        | "consent_required";
    }
  | {
      ok: false;
      error: "not_accepted";
      /** Per platform, why the post can't go there as it is (our rules, then Zernio's check). */
      problems: { platform: string; message: string }[];
    };

/** How long Zernio's check may take before the post is saved without it. */
const VALIDATE_TIMEOUT_MS = 15_000;

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
    /** Photos and videos already uploaded to Zernio (`seconds`: a video's length, when known). */
    media?: { url: string; seconds?: number | null }[];
    /** The owner confirmed TikTok's consent for this post. */
    tiktokConsent?: boolean;
    /** YouTube's title; without it Zernio uses the caption's first line. */
    youtubeTitle?: string;
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
    .select("id, status, platform, zernio_account_id, pinterest_board_id")
    .eq("tenant_id", input.tenantId)
    .in("id", accountIds);
  if (!accountIds.length || owned?.length !== accountIds.length) {
    return { ok: false, error: "accounts_not_owned" };
  }
  if (owned.some((a) => a.status !== "active")) return { ok: false, error: "account_disconnected" };

  const media = (input.media ?? []).map((m) => ({ url: m.url, seconds: m.seconds ?? null }));
  const videos = media.filter((m) => isVideoUrl(m.url));
  const blocked = owned
    .map((a) =>
      checkPlatform(a.platform, {
        textLength: input.content.length,
        images: media.length - videos.length,
        videos: videos.length,
        videoSeconds: videos[0]?.seconds ?? null,
      }),
    )
    .filter((c): c is Extract<RuleCheck, { level: "blocked" }> => c.level === "blocked");
  if (blocked.length) {
    return {
      ok: false,
      error: "not_accepted",
      problems: blocked.map((c) => ({ platform: c.platform, message: c.message })),
    };
  }
  if (owned.some((a) => a.platform === "tiktok") && !input.tiktokConsent) {
    return { ok: false, error: "consent_required" };
  }
  const pinterestBoardId =
    owned.find((a) => a.platform === "pinterest" && a.pinterest_board_id)?.pinterest_board_id ??
    undefined;
  // Zernio's dry run: the platforms' real rules, which may have changed since our table. If the
  // check itself fails (timeout, pause), the post is saved anyway and publishing reports it.
  try {
    const check = await deps.social().validatePost({
      content: input.content,
      mediaUrls: media.map((m) => m.url),
      youtubeTitle: input.youtubeTitle,
      pinterestBoardId,
      targets: owned.flatMap((a) =>
        isSocialPlatform(a.platform)
          ? [{ platform: a.platform, accountId: a.zernio_account_id }]
          : [],
      ),
      signal: AbortSignal.timeout(VALIDATE_TIMEOUT_MS),
    });
    if (!check.valid && check.errors.length) {
      return { ok: false, error: "not_accepted", problems: check.errors };
    }
  } catch (error) {
    if (!isPlatformPaused(error)) {
      Sentry.captureException(error, { extra: { tenantId: input.tenantId, step: "validatePost" } });
    }
  }
  const { data: post, error } = await db
    .from("posts")
    .insert({
      tenant_id: input.tenantId,
      content: input.content,
      media,
      target_account_ids: accountIds,
      scheduled_for: input.scheduledFor?.toISOString() ?? null,
      status: "queued",
      tiktok_consent_at: input.tiktokConsent ? now.toISOString() : null,
      platform_options: {
        ...(input.youtubeTitle ? { youtube: { title: input.youtubeTitle } } : {}),
        // The board chosen when the post was made, so a later change doesn't move a scheduled pin.
        ...(pinterestBoardId ? { pinterest: { boardId: pinterestBoardId } } : {}),
      },
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
      image: media.length > videos.length,
      video: videos.length > 0,
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
