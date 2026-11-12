"use server";

import { randomUUID } from "node:crypto";
import * as Sentry from "@sentry/nextjs";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getTenantFor, NOT_ALLOWED } from "@/features/tenants";
import { writeAudit } from "@/lib/audit";
import { getSocialProvider, resolveSocialProviderMode } from "@/lib/social";
import { recordPlatformPause } from "@/lib/social/platform-pause";
import { isPlatformPaused } from "@/lib/social/zernio";
import { getServiceClient } from "@/lib/supabase/service";
import { POST_IMAGE_MAX_BYTES, POST_IMAGE_TYPES, POST_TEXT_MAX, YOUTUBE_TITLE_MAX } from "./limits";
import { imageMaxBytesFor } from "./post-rules";
import { publishPost } from "./publish";
import { cancelScheduledPost, createPost } from "./posts";
import { isUploadedVideoUrl, isVideoType, videoFilename, videoProblem } from "./video";

export interface ComposeState {
  error?: string;
  /** Field the error belongs to (design.md §4: errors stay where they happened). */
  field?: "content" | "accounts" | "when" | "image" | "youtubeTitle";
  /** Set when the post was saved: the form resets and the new post shows in the list. */
  savedAt?: number;
  outcome?: "published" | "scheduled" | "waiting" | "failed";
  /** Platforms that won't take the post as it is, with why (shown in "Before it goes out"). */
  problems?: { platform: string; message: string }[];
}

const composeSchema = z.object({
  content: z.string().trim().min(1, "Write something to post.").max(POST_TEXT_MAX),
  accounts: z.array(z.uuid()).min(1, "Pick at least one account."),
  when: z.enum(["now", "later"]),
  // The browser sends the chosen local time as ISO (with its offset).
  scheduledFor: z.string().optional(),
  youtubeTitle: z
    .string()
    .trim()
    .max(YOUTUBE_TITLE_MAX, `YouTube titles are ${YOUTUBE_TITLE_MAX} characters at most.`)
    .optional(),
  // T63: a video the browser already uploaded to Zernio, and its length if the browser read it.
  video: z.string().optional(),
  videoSeconds: z.coerce.number().positive().max(86_400).optional().catch(undefined),
});

export async function composePost(_prev: ComposeState, formData: FormData): Promise<ComposeState> {
  const parsed = composeSchema.safeParse({
    content: formData.get("content"),
    accounts: formData.getAll("accounts"),
    when: formData.get("when"),
    scheduledFor: formData.get("scheduledFor") || undefined,
    youtubeTitle: formData.get("youtubeTitle") || undefined,
    video: formData.get("video") || undefined,
    videoSeconds: formData.get("videoSeconds") || undefined,
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue.path[0];
    return {
      error: issue.message,
      field: field === "accounts" || field === "youtubeTitle" ? field : "content",
    };
  }
  const { content, accounts, when } = parsed.data;
  let scheduledFor: Date | null = null;
  if (when === "later") {
    const at = parsed.data.scheduledFor ? new Date(parsed.data.scheduledFor) : null;
    if (!at || Number.isNaN(at.getTime())) {
      return { error: "Pick a date and time.", field: "when" };
    }
    if (at.getTime() < Date.now() + 5 * 60_000) {
      return { error: "Pick a time at least 5 minutes from now.", field: "when" };
    }
    scheduledFor = at;
  }

  const tenant = await getTenantFor("posts.write");
  if (!tenant) return { error: NOT_ALLOWED };
  const db = getServiceClient();
  // Optional image: uploaded through Zernio's presign flow before the post is created.
  const media: { url: string; seconds?: number | null }[] = [];
  const image = formData.get("image");
  if (parsed.data.video) {
    const mock = resolveSocialProviderMode(process.env) === "mock";
    if (!isUploadedVideoUrl(parsed.data.video, { mock, appUrl: process.env.APP_URL })) {
      return { error: "Upload the video again.", field: "image" };
    }
    media.push({ url: parsed.data.video, seconds: parsed.data.videoSeconds ?? null });
  } else if (image instanceof File && image.size > 0) {
    if (!(POST_IMAGE_TYPES as readonly string[]).includes(image.type)) {
      return { error: "Use a JPG, PNG or WebP image.", field: "image" };
    }
    // The strictest size among the picked platforms (Bluesky takes 1 MB).
    const { data: picked } = await db
      .from("social_accounts")
      .select("platform")
      .eq("tenant_id", tenant.id)
      .in("id", accounts);
    const maxBytes = imageMaxBytesFor(
      (picked ?? []).map((a) => a.platform),
      POST_IMAGE_MAX_BYTES,
    );
    if (image.size > maxBytes) {
      return {
        error: `Use an image under ${Math.round(maxBytes / 100_000) / 10} MB.`,
        field: "image",
      };
    }
    try {
      const { publicUrl } = await getSocialProvider().uploadMedia({
        filename: image.name || "image",
        contentType: image.type,
        bytes: new Uint8Array(await image.arrayBuffer()),
        signal: AbortSignal.timeout(30_000),
      });
      media.push({ url: publicUrl });
    } catch (error) {
      if (isPlatformPaused(error)) {
        await recordPlatformPause(db);
        return {
          error: "Posting is paused on our side right now. Try again later.",
          field: "image",
        };
      }
      Sentry.captureException(error, { extra: { tenantId: tenant.id } });
      return { error: "The image couldn't be uploaded. Try again.", field: "image" };
    }
  }

  const result = await createPost(
    { db, social: getSocialProvider },
    {
      tenantId: tenant.id,
      userId: tenant.userId,
      content,
      accountIds: accounts,
      scheduledFor,
      media,
      tiktokConsent: formData.get("tiktokConsent") === "yes",
      youtubeTitle: parsed.data.youtubeTitle || undefined,
    },
  );
  if (!result.ok) {
    if (result.error === "not_accepted") {
      return {
        problems: result.problems,
        error: "Some platforms won't take this post as it is.",
        field: "accounts",
      };
    }
    if (result.error === "consent_required") {
      return { error: "Tick the TikTok confirmation to post there.", field: "accounts" };
    }
    if (result.error === "accounts_not_owned") {
      return { error: "Pick your connected accounts only.", field: "accounts" };
    }
    if (result.error === "account_disconnected") {
      return {
        error: "One of these accounts is disconnected. Reconnect it in Settings first.",
        field: "accounts",
      };
    }
    if (result.error === "too_soon") {
      return { error: "Pick a time at least 5 minutes from now.", field: "when" };
    }
    return { error: "Couldn't save the post. Try again." };
  }
  revalidatePath("/posts");
  if (result.outcome === "failed") {
    return { error: result.error, savedAt: Date.now(), outcome: "failed" };
  }
  return { savedAt: Date.now(), outcome: result.outcome };
}

export interface PostActionState {
  error?: string;
}

const idSchema = z.object({ postId: z.uuid() });

/** Cancels a scheduled post: Zernio first, then here. */
export async function cancelPost(
  _prev: PostActionState,
  formData: FormData,
): Promise<PostActionState> {
  const parsed = idSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Something went wrong. Reload the page." };
  const tenant = await getTenantFor("posts.write");
  if (!tenant) return { error: NOT_ALLOWED };
  const result = await cancelScheduledPost(
    { db: getServiceClient(), social: getSocialProvider },
    { tenantId: tenant.id, userId: tenant.userId, postId: parsed.data.postId },
  );
  if (!result.ok) {
    return {
      error:
        result.error === "not_cancellable"
          ? "This post can't be cancelled any more."
          : "Couldn't cancel it right now. Try again.",
    };
  }
  revalidatePath("/posts");
  return {};
}

const retrySchema = z.object({
  postId: z.uuid(),
  scheduledFor: z.string().optional(),
});

/**
 * Retry a failed post, or reschedule one that failed during a Zernio pause or was cancelled
 * because its account was removed. A new idempotency key: the old one would replay the failure.
 */
export async function retryPost(
  _prev: PostActionState,
  formData: FormData,
): Promise<PostActionState> {
  const parsed = retrySchema.safeParse({
    postId: formData.get("postId"),
    scheduledFor: formData.get("scheduledFor") || undefined,
  });
  if (!parsed.success) return { error: "Something went wrong. Reload the page." };
  const at = parsed.data.scheduledFor ? new Date(parsed.data.scheduledFor) : null;
  if (at && (Number.isNaN(at.getTime()) || at.getTime() < Date.now() + 5 * 60_000)) {
    return { error: "Pick a time at least 5 minutes from now." };
  }
  const tenant = await getTenantFor("posts.write");
  if (!tenant) return { error: NOT_ALLOWED };
  const db = getServiceClient();
  const { data: updated } = await db
    .from("posts")
    .update({
      status: "queued",
      idempotency_key: randomUUID(),
      zernio_post_id: null,
      scheduled_for: at?.toISOString() ?? null,
      failure_reason: null,
      last_error: null,
      attempts: 0,
      next_attempt_at: null,
      platform_results: [],
    })
    .eq("id", parsed.data.postId)
    .eq("tenant_id", tenant.id)
    .in("status", ["failed", "partial", "cancelled"])
    .select("id");
  if (!updated?.length) return { error: "This post can't be retried." };
  await writeAudit(db, {
    tenantId: tenant.id,
    action: "post_retried",
    actor: tenant.userId,
    details: { postId: parsed.data.postId, rescheduled: !!at },
  });
  const result = await publishPost({ db, social: getSocialProvider }, parsed.data.postId);
  revalidatePath("/posts");
  return result.outcome === "failed" ? { error: result.error } : {};
}

const videoMetaSchema = z.object({
  type: z.string(),
  size: z.number().int().nonnegative(),
});

/**
 * T63: an upload link for one video. The browser PUTs the file straight to Zernio's storage
 * (it allows any origin), so a video never passes through our server.
 */
export async function prepareVideoUpload(
  meta: z.infer<typeof videoMetaSchema>,
): Promise<{ uploadUrl: string; publicUrl: string } | { error: string }> {
  const parsed = videoMetaSchema.safeParse(meta);
  if (!parsed.success) return { error: "Pick the video again." };
  const problem = videoProblem(parsed.data);
  if (problem || !isVideoType(parsed.data.type)) return { error: problem ?? "Use an MP4 video." };
  const tenant = await getTenantFor("posts.write");
  if (!tenant) return { error: NOT_ALLOWED };
  try {
    return await getSocialProvider().presignMedia({
      filename: videoFilename(parsed.data.type),
      contentType: parsed.data.type,
      size: parsed.data.size,
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    if (isPlatformPaused(error)) {
      await recordPlatformPause(getServiceClient());
      return { error: "Posting is paused on our side right now. Try again later." };
    }
    Sentry.captureException(error, { extra: { tenantId: tenant.id, step: "presignVideo" } });
    return { error: "The video couldn't be uploaded. Try again." };
  }
}
