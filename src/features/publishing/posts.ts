import * as Sentry from "@sentry/nextjs";
import { writeAudit } from "@/lib/audit";
import { isSocialPlatform, mediaKindOf, type MediaKind } from "@/lib/social/types";
import { recordPlatformPause } from "@/lib/social/platform-pause";
import { SocialProviderError, type SocialProvider } from "@/lib/social/types";
import { isPlatformPaused } from "@/lib/social/zernio";
import type { ServiceClient } from "@/lib/supabase/service";
import { checkPlatform } from "./post-rules";
import { fitFor, refusedMessage, type MediaShape } from "./media-fit";
import { fileKind, platformFiles, platformSet, type PlatformFile, type PostFile } from "./carousel";
import { publishPost } from "./publish";
import {
  postOptionsRow,
  targetExtras,
  textFor,
  type PlatformPostOptions,
  type PostOptions,
} from "./post-options";
import { statusAfterTakeDown, takeDownSplit } from "./take-down";

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
      /** Zernio's notes on the post (it still went ahead), per platform. */
      warnings: { platform: string; message: string }[];
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
      warnings: { platform: string; message: string }[];
    };

/** One file as a rule check sees it. */
export interface CheckedMedia {
  type?: string | null;
  seconds?: number | null;
  width?: number | null;
  height?: number | null;
}

/**
 * Why the post can't go to some of its platforms as it is, per platform: what it takes of the
 * post's files (Posts Round 4: a carousel is trimmed per platform; blocked only when nothing fits),
 * our rules (text length, photo or video needed, video length), then "How it fits" (Posts Round 2)
 * for every file that goes there: a shape or length a platform refuses holds that platform until
 * the owner crops for it, posts it as a Story or leaves it out. Shapes aren't checked when the
 * size isn't known (an assistant's post); Zernio's check still runs. Each platform is checked on
 * its own files when it has them (`options[p].media`: its trimmed set with its crops). Shared by
 * new posts and edits (Posts Round 3).
 */
export function ruleProblems(
  platforms: readonly string[],
  content: string,
  media: readonly CheckedMedia[],
  options: PostOptions,
): { platform: string; message: string }[] {
  const out: { platform: string; message: string }[] = [];
  for (const platform of new Set(platforms)) {
    const as = options[platform]?.as;
    const own = options[platform]?.media;
    const files: CheckedMedia[] = own?.length ? own : [...media];
    const set = platformSet(platform, files.map(fileKind), as);
    if (set.blocked) {
      out.push({ platform, message: set.blocked });
      continue;
    }
    const sent = set.indices.map((i) => files[i]);
    const videos = sent.filter((m) => m.type === "video");
    const check = checkPlatform(platform, {
      // Each platform's own text when the owner wrote one, else the caption.
      textLength: textFor(platform, options, content).length,
      images: sent.length - videos.length,
      videos: videos.length,
      videoSeconds: videos[0]?.seconds ?? null,
    });
    if (check.level === "blocked") {
      out.push({ platform, message: check.message });
      continue;
    }
    for (const m of sent) {
      if (!m.width || !m.height) continue;
      const shape: MediaShape = {
        kind: m.type === "video" ? "video" : "image",
        width: m.width,
        height: m.height,
        seconds: m.seconds,
      };
      const fit = fitFor(platform, shape, as);
      if (fit?.level === "refused") {
        out.push({ platform, message: refusedMessage(fit) });
        break;
      }
    }
  }
  return out;
}

/**
 * Each platform's own files (Posts Round 4): its part of a carousel, trimmed to what it takes,
 * kept in `options[p].media` and sent as its `customMedia`. A platform that already has its own
 * files (crops made in the composer, already trimmed) keeps them; one that takes the post as it is
 * gets none.
 */
export function withPlatformMedia(
  platforms: readonly string[],
  media: readonly PostFile[],
  options: PostOptions,
): PostOptions {
  const out: PostOptions = { ...options };
  for (const platform of new Set(platforms)) {
    if (out[platform]?.media?.length) continue;
    const { files } = platformFiles(platform, media, undefined, out[platform]?.as);
    if (files) out[platform] = { ...out[platform], media: optionMedia(files) };
  }
  return out;
}

/** A platform's files as `platform_options` keeps them (no empty fields). */
export function optionMedia(
  files: readonly PlatformFile[],
): NonNullable<PlatformPostOptions["media"]> {
  return files.map((f) => ({
    url: f.url,
    ...(f.type === "image" || f.type === "video" || f.type === "gif" || f.type === "document"
      ? { type: f.type }
      : {}),
    ...(f.width && f.height ? { width: f.width, height: f.height } : {}),
    ...(f.seconds ? { seconds: f.seconds } : {}),
    from: f.from,
  }));
}

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
    /**
     * Photos and videos already uploaded to Zernio (`seconds`: a video's length, when known;
     * `type`: what the file is, sent to Zernio so it never guesses; `altText`: for photos).
     */
    media?: {
      url: string;
      seconds?: number | null;
      type?: MediaKind | null;
      altText?: string | null;
      /** Posts Round 2: the file's size in pixels, read by the browser (for "How it fits"). */
      width?: number | null;
      height?: number | null;
    }[];
    /** The owner confirmed TikTok's consent for this post. */
    tiktokConsent?: boolean;
    /** YouTube's title; without it Zernio uses the caption's first line. */
    youtubeTitle?: string;
    /** Per-platform choices from the composer (T75): text, post type, first comment, options. */
    options?: PostOptions;
    /** T75: the brand's next free posting time (Zernio's queue); `scheduledFor` is ignored. */
    queued?: boolean;
    via?: Record<string, string>;
    now?: Date;
  },
): Promise<CreatePostResult> {
  const { db } = deps;
  const now = input.now ?? new Date();
  if (
    !input.queued &&
    input.scheduledFor &&
    input.scheduledFor.getTime() < now.getTime() + MIN_SCHEDULE_AHEAD_MS
  ) {
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

  const media = (input.media ?? []).map((m) => {
    const type = mediaKindOf({ url: m.url, type: m.type ?? null });
    return {
      url: m.url,
      seconds: m.seconds ?? null,
      ...(type ? { type } : {}),
      ...(m.altText?.trim() ? { altText: m.altText.trim() } : {}),
      ...(m.width && m.height ? { width: m.width, height: m.height } : {}),
    };
  });
  const videos = media.filter((m) => m.type === "video");
  // Round 4: each platform's part of a carousel, trimmed to what it takes.
  const options = withPlatformMedia(
    owned.map((a) => a.platform),
    media,
    input.options ?? {},
  );
  const problems = ruleProblems(
    owned.map((a) => a.platform),
    input.content,
    media,
    options,
  );
  if (problems.length) {
    return { ok: false, error: "not_accepted", problems, warnings: [] };
  }
  if (owned.some((a) => a.platform === "tiktok") && !input.tiktokConsent) {
    return { ok: false, error: "consent_required" };
  }
  const pinterestBoardId =
    owned.find((a) => a.platform === "pinterest" && a.pinterest_board_id)?.pinterest_board_id ??
    undefined;
  // What goes in the row, and exactly what publishing will send per platform.
  const optionsRow = postOptionsRow(
    // Only the platforms this post goes to.
    Object.fromEntries(owned.map((a) => [a.platform, options[a.platform]]).filter(([, o]) => o)),
    input.youtubeTitle,
    pinterestBoardId,
  );
  // Zernio's dry run: the platforms' real rules, which may have changed since our table, with
  // each platform's own text and choices (Story, Reel, title, board). If the check itself fails
  // (timeout, pause), the post is saved anyway and publishing reports it.
  let warnings: { platform: string; message: string }[] = [];
  try {
    const check = await deps.social().validatePost({
      content: input.content,
      media,
      youtubeTitle: input.youtubeTitle,
      pinterestBoardId,
      targets: owned.flatMap((a) =>
        isSocialPlatform(a.platform)
          ? [{ platform: a.platform, accountId: a.zernio_account_id }]
          : [],
      ),
      extras: Object.fromEntries(
        owned.map((a) => [
          a.platform,
          targetExtras(a.platform, optionsRow[a.platform], input.content),
        ]),
      ),
      signal: AbortSignal.timeout(VALIDATE_TIMEOUT_MS),
    });
    warnings = check.warnings.filter((w) => w.message);
    if (!check.valid && check.errors.length) {
      return { ok: false, error: "not_accepted", problems: check.errors, warnings };
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
      scheduled_for: input.queued ? null : (input.scheduledFor?.toISOString() ?? null),
      queued: !!input.queued,
      status: "queued",
      tiktok_consent_at: input.tiktokConsent ? now.toISOString() : null,
      platform_options: optionsRow,
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
      scheduled: !!input.scheduledFor || !!input.queued,
      queued: !!input.queued,
      accounts: accountIds.length,
      image: media.length > videos.length,
      video: videos.length > 0,
      files: media.length,
      ...(input.via ? { via: input.via } : {}),
    },
  });

  const result = await publishPost({ db, social: deps.social }, post.id);
  if (result.outcome === "failed") {
    return { ok: true, postId: post.id, outcome: "failed", error: result.error, warnings };
  }
  if (result.outcome === "retry_later") {
    return { ok: true, postId: post.id, outcome: "waiting", warnings };
  }
  return {
    ok: true,
    postId: post.id,
    outcome: input.scheduledFor || input.queued ? "scheduled" : "published",
    warnings,
  };
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

export type TakeDownResult =
  | { ok: true; removed: string[]; byHand: string[]; failed: string[] }
  | { ok: false; error: "not_published" };

/**
 * Takes a published post down from every platform that allows it (T75c). Instagram, TikTok and
 * Snapchat are left for the owner to remove in the app. Each platform is its own call; one
 * failing doesn't stop the others.
 */
export async function takeDownPost(
  deps: PostDeps,
  input: { tenantId: string; userId: string; postId: string },
): Promise<TakeDownResult> {
  const { db } = deps;
  const { data: post } = await db
    .from("posts")
    .select("id, status, zernio_post_id, target_account_ids, platform_results")
    .eq("id", input.postId)
    .eq("tenant_id", input.tenantId)
    .maybeSingle();
  if (!post?.zernio_post_id || !["published", "partial"].includes(post.status)) {
    return { ok: false, error: "not_published" };
  }
  const { data: accounts } = await db
    .from("social_accounts")
    .select("platform, zernio_account_id")
    .eq("tenant_id", input.tenantId)
    .in("id", post.target_account_ids);
  const { removable, byHand } = takeDownSplit((accounts ?? []).map((a) => a.platform));
  const removed: string[] = [];
  const failed: string[] = [];
  for (const a of accounts ?? []) {
    if (!removable.includes(a.platform)) continue;
    try {
      await deps.social().unpublishPost({
        postId: post.zernio_post_id,
        platform: a.platform,
        accountId: a.zernio_account_id,
        signal: AbortSignal.timeout(20_000),
      });
      removed.push(a.platform);
    } catch (error) {
      if (isPlatformPaused(error)) await recordPlatformPause(db);
      Sentry.captureException(error, { extra: { postId: post.id, platform: a.platform } });
      failed.push(a.platform);
    }
  }
  if (removed.length) {
    const results = (post.platform_results as { platform: string; status?: string }[] | null) ?? [];
    const status = statusAfterTakeDown(removed.length, (accounts ?? []).length);
    await db
      .from("posts")
      .update({
        taken_down_at: new Date().toISOString(),
        status,
        failure_reason: status === "cancelled" ? "taken_down" : null,
        platform_results: results.map((r) =>
          removed.includes(r.platform) ? { ...r, status: "removed" } : r,
        ),
      })
      .eq("id", post.id);
  }
  await writeAudit(db, {
    tenantId: input.tenantId,
    action: "post_taken_down",
    actor: input.userId,
    details: { postId: post.id, removed, byHand, failed },
  });
  return { ok: true, removed, byHand, failed };
}
