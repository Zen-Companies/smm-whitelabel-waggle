import { randomUUID } from "node:crypto";
import * as Sentry from "@sentry/nextjs";
import { writeAudit } from "@/lib/audit";
import { recordPlatformPause } from "@/lib/social/platform-pause";
import { platformLabel, platformOf } from "@/lib/social/platforms";
import { mediaKindOf, SocialProviderError, type PostPlatformResult } from "@/lib/social/types";
import { isPlatformPaused } from "@/lib/social/zernio";
import type { Json } from "@/lib/supabase/database.types";
import { editDiff, updateFields, type EditablePost, type EditPart } from "./edit-diff";
import { afterLiveEdit, canEditLive, liveCopies } from "./live-edit";
import { canMove } from "./move";
import { parsePostOptions, postOptionsRow, type PostOptions } from "./post-options";
import { MIN_SCHEDULE_AHEAD_MS, ruleProblems, withPlatformMedia, type PostDeps } from "./posts";
import type { PostFile } from "./carousel";
import { postErrorMessage, type StoredMedia } from "./publish";

// Change a post after it was made (Posts Round 3, approved 25 Nov): edit or move a planned post
// (Zernio's update, `PUT /v1/posts/{postId}`), and fix the text of one that already went out
// (`POST /v1/posts/{postId}/edit`). Zernio first, then Waggle's row, then the audit row. A 5xx or
// timeout is never retried from here: the row stays as it was and the owner is told to check.

const TIMEOUT_MS = 30_000;
const MEDIA_KINDS = ["image", "video", "gif", "document"] as const;

export type UpdatePostResult =
  | { ok: true; changed: EditPart[]; scheduledFor: string | null }
  | {
      ok: false;
      error:
        | "not_editable"
        | "too_soon"
        | "accounts_not_owned"
        | "account_disconnected"
        | "consent_required"
        | "paused"
        | "unclear"
        | "gone"
        | "refused";
      /** The platform's own words when it refused (shown in "Before it goes out"). */
      message?: string;
      problems?: { platform: string; message: string }[];
    };

type Row = {
  id: string;
  status: string;
  zernio_post_id: string | null;
  content: string;
  media: StoredMedia[];
  target_account_ids: string[];
  scheduled_for: string | null;
  platform_options: PostOptions;
  tiktok_consent_at: string | null;
};

async function loadRow(deps: PostDeps, tenantId: string, postId: string): Promise<Row | null> {
  const { data } = await deps.db
    .from("posts")
    .select(
      "id, status, zernio_post_id, content, media, target_account_ids, scheduled_for, platform_options, tiktok_consent_at",
    )
    .eq("id", postId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!data) return null;
  return {
    ...data,
    media: (data.media as StoredMedia[] | null) ?? [],
    platform_options: parsePostOptions(data.platform_options),
  };
}

/** What a failed Zernio call means for the owner (never retried here). */
async function failure(
  deps: PostDeps,
  error: unknown,
  platforms: string[],
  postId: string,
): Promise<Extract<UpdatePostResult, { ok: false }>> {
  if (isPlatformPaused(error)) {
    await recordPlatformPause(deps.db);
    return { ok: false, error: "paused" };
  }
  if (!(error instanceof SocialProviderError)) throw error;
  const { status, ambiguous } = error.details;
  if (ambiguous) {
    Sentry.captureException(error, { extra: { postId, step: "updatePost" } });
    return { ok: false, error: "unclear" };
  }
  if (status === 404) return { ok: false, error: "gone" };
  return { ok: false, error: "refused", message: postErrorMessage(error, platforms) };
}

/**
 * Edit a planned post: text, files, accounts, per-platform choices and time (Posts Round 3,
 * "Save changes"). `media` and `options` are the edited post as the row will keep it (files
 * already uploaded, kept crops copied from the row by the caller).
 */
export async function updateScheduledPost(
  deps: PostDeps,
  input: {
    tenantId: string;
    userId: string;
    postId: string;
    content: string;
    accountIds: string[];
    scheduledFor: Date;
    media: StoredMedia[];
    options: PostOptions;
    youtubeTitle?: string;
    tiktokConsent: boolean;
    now?: Date;
  },
): Promise<UpdatePostResult> {
  const { db } = deps;
  const now = input.now ?? new Date();
  const row = await loadRow(deps, input.tenantId, input.postId);
  if (!row || !canMove(row)) return { ok: false, error: "not_editable" };
  if (input.scheduledFor.getTime() < now.getTime() + MIN_SCHEDULE_AHEAD_MS) {
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
  const platforms = owned.map((a) => a.platform);
  const media: StoredMedia[] = input.media.flatMap((m) => {
    if (!m.url) return [];
    const stored = MEDIA_KINDS.find((k) => k === m.type) ?? null;
    const type = mediaKindOf({ url: m.url, type: stored });
    return [{ ...m, ...(type ? { type } : {}) }];
  });
  // Round 4: each platform's part of a carousel, trimmed to what it takes.
  const withMedia = withPlatformMedia(platforms, media as PostFile[], input.options);
  const problems = ruleProblems(platforms, input.content, media, withMedia);
  if (problems.length) return { ok: false, error: "refused", problems };
  const tiktok = owned.some((a) => a.platform === "tiktok");
  if (tiktok && !input.tiktokConsent && !row.tiktok_consent_at) {
    return { ok: false, error: "consent_required" };
  }
  // The board stays the one the post was made with (a later change never moves a planned pin).
  const options = postOptionsRow(
    Object.fromEntries(owned.map((a) => [a.platform, withMedia[a.platform]]).filter(([, o]) => o)),
    input.youtubeTitle,
    row.platform_options.pinterest?.boardId ??
      owned.find((a) => a.platform === "pinterest")?.pinterest_board_id ??
      undefined,
  );
  const before: EditablePost = {
    content: row.content,
    media: row.media,
    accountIds: row.target_account_ids,
    options: row.platform_options,
    scheduledFor: row.scheduled_for,
  };
  const after: EditablePost = {
    content: input.content,
    media,
    accountIds,
    options,
    scheduledFor: input.scheduledFor.toISOString(),
  };
  const changed = editDiff(before, after);
  if (!changed.length) return { ok: true, changed, scheduledFor: row.scheduled_for };
  let scheduledFor: string | null = after.scheduledFor;
  try {
    const r = await deps.social().updatePost({
      postId: row.zernio_post_id as string,
      idempotencyKey: randomUUID(),
      ...updateFields(changed, after, owned, input.tiktokConsent || !!row.tiktok_consent_at),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    scheduledFor = r.scheduledFor ?? scheduledFor;
  } catch (error) {
    return failure(deps, error, platforms, row.id);
  }
  await db
    .from("posts")
    .update({
      content: after.content,
      media: after.media as unknown as Json,
      target_account_ids: accountIds,
      scheduled_for: scheduledFor,
      queued: false,
      platform_options: options as unknown as Json,
      ...(tiktok && input.tiktokConsent && !row.tiktok_consent_at
        ? { tiktok_consent_at: now.toISOString() }
        : {}),
    })
    .eq("id", row.id)
    .eq("tenant_id", input.tenantId);
  await writeAudit(db, {
    tenantId: input.tenantId,
    action: "post_updated",
    actor: input.userId,
    details: { postId: row.id, changed, accounts: accountIds.length },
  });
  return { ok: true, changed, scheduledFor };
}

/** Move a planned post to a new time (drag on the calendar, or Move). Undo is a move back. */
export async function movePost(
  deps: PostDeps,
  input: { tenantId: string; userId: string; postId: string; scheduledFor: Date; now?: Date },
): Promise<UpdatePostResult> {
  const { db } = deps;
  const now = input.now ?? new Date();
  const row = await loadRow(deps, input.tenantId, input.postId);
  if (!row || !canMove(row)) return { ok: false, error: "not_editable" };
  if (input.scheduledFor.getTime() < now.getTime() + MIN_SCHEDULE_AHEAD_MS) {
    return { ok: false, error: "too_soon" };
  }
  const to = input.scheduledFor.toISOString();
  if (row.scheduled_for && new Date(row.scheduled_for).getTime() === input.scheduledFor.getTime()) {
    return { ok: true, changed: [], scheduledFor: row.scheduled_for };
  }
  let scheduledFor = to;
  try {
    const r = await deps.social().updatePost({
      postId: row.zernio_post_id as string,
      idempotencyKey: randomUUID(),
      publishAt: input.scheduledFor,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    scheduledFor = r.scheduledFor ?? to;
  } catch (error) {
    return failure(deps, error, [], row.id);
  }
  await db
    .from("posts")
    .update({ scheduled_for: scheduledFor, queued: false })
    .eq("id", row.id)
    .eq("tenant_id", input.tenantId);
  await writeAudit(db, {
    tenantId: input.tenantId,
    action: "post_moved",
    actor: input.userId,
    details: { postId: row.id, from: row.scheduled_for, to: scheduledFor },
  });
  return { ok: true, changed: ["time"], scheduledFor };
}

export type FixTextResult =
  | {
      ok: true;
      edited: string[];
      failed: { platform: string; reason: string }[];
      notAllowed: string[];
    }
  | { ok: false; error: "not_published" | "nothing_editable" | "too_long"; message?: string };

/** The owner's words for one platform's refused fix. */
function fixReason(error: unknown): string {
  if (!(error instanceof SocialProviderError)) return "Couldn't change it. Try again.";
  if (error.details.ambiguous) {
    return "We couldn't tell whether it changed. Check the post there before trying again.";
  }
  if (error.details.status === 404) return "The post isn't there any more.";
  return "It didn't take the change (the platform may have a time limit on edits). Try again, or take it down and post again.";
}

/**
 * Fix the text of a post that went out, on every live platform that allows it (Posts Round 3,
 * decision 2). The photo or video never changes. Each platform is its own call; one refusing
 * doesn't stop the others.
 */
export async function fixLiveText(
  deps: PostDeps,
  input: { tenantId: string; userId: string; postId: string; content: string },
): Promise<FixTextResult> {
  const { db } = deps;
  const { data: post } = await db
    .from("posts")
    .select(
      "id, status, zernio_post_id, content, target_account_ids, platform_results, platform_options",
    )
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
  const results = (post.platform_results as unknown as PostPlatformResult[] | null) ?? [];
  const live = liveCopies(results, accounts ?? []);
  const editable = live.filter((c) => canEditLive(c.platform));
  const notAllowed = [
    ...new Set(live.filter((c) => !canEditLive(c.platform)).map((c) => c.platform)),
  ];
  if (!editable.length) return { ok: false, error: "nothing_editable" };
  for (const c of editable) {
    const max = platformOf(c.platform)?.post?.textMax;
    if (max && input.content.length > max) {
      return {
        ok: false,
        error: "too_long",
        message: `${platformLabel(c.platform)} takes ${max.toLocaleString("en-US")} characters at most.`,
      };
    }
  }
  const edited: string[] = [];
  const failed: { platform: string; reason: string }[] = [];
  for (const c of editable) {
    try {
      await deps.social().editPublishedPost({
        postId: post.zernio_post_id,
        platform: c.platform,
        accountId: c.accountId,
        content: input.content,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!edited.includes(c.platform)) edited.push(c.platform);
    } catch (error) {
      if (isPlatformPaused(error)) await recordPlatformPause(db);
      if (error instanceof SocialProviderError && error.details.ambiguous) {
        Sentry.captureException(error, { extra: { postId: post.id, platform: c.platform } });
      }
      failed.push({ platform: c.platform, reason: fixReason(error) });
    }
  }
  // A platform with two accounts counts as fixed only when both took it.
  const fixed = edited.filter((p) => !failed.some((f) => f.platform === p));
  if (fixed.length) {
    const next = afterLiveEdit(
      { content: post.content, options: parsePostOptions(post.platform_options) },
      live.map((c) => c.platform),
      fixed,
      input.content,
    );
    await db
      .from("posts")
      .update({ content: next.content, platform_options: next.options as unknown as Json })
      .eq("id", post.id)
      .eq("tenant_id", input.tenantId);
  }
  await writeAudit(db, {
    tenantId: input.tenantId,
    action: "post_text_fixed",
    actor: input.userId,
    details: {
      postId: post.id,
      edited: fixed,
      failed: failed.map((f) => f.platform),
      notAllowed,
    },
  });
  return { ok: true, edited: fixed, failed, notAllowed };
}
