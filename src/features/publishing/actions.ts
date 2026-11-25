"use server";

import * as Sentry from "@sentry/nextjs";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getTenantFor, NOT_ALLOWED } from "@/features/tenants";
import { getSocialProvider, resolveSocialProviderMode } from "@/lib/social";
import { recordPlatformPause } from "@/lib/social/platform-pause";
import { isPlatformPaused } from "@/lib/social/zernio";
import { SocialProviderError } from "@/lib/social/types";
import { getServiceClient } from "@/lib/supabase/service";
import { POST_IMAGE_MAX_BYTES, POST_IMAGE_TYPES, POST_TEXT_MAX, YOUTUBE_TITLE_MAX } from "./limits";
import { imageMaxBytesFor } from "./post-rules";
import { retryPost as retryFailedPost } from "./retry";
import { chooseBoardFor, listBoardsFor, type PinterestBoard } from "./pinterest";
import { cancelScheduledPost, createPost, takeDownPost } from "./posts";
import { isUploadedVideoUrl, isVideoType, videoFilename, videoProblem } from "./video";
import { driveKind, isUploadedImageUrl, ONEDRIVE_VIDEO_MAX_BYTES, postableItems } from "./onedrive";
import { parsePostOptions, withoutMedia, type PostOptions } from "./post-options";
import { platformLabel } from "@/lib/social/platforms";

export interface ComposeState {
  error?: string;
  /** Field the error belongs to (design.md §4: errors stay where they happened). */
  field?: "content" | "accounts" | "when" | "image" | "youtubeTitle";
  /** Set when the post was saved: the form resets and the new post shows in the list. */
  savedAt?: number;
  outcome?: "published" | "scheduled" | "waiting" | "failed";
  /** Platforms that won't take the post as it is, with why (shown in "Before it goes out"). */
  problems?: { platform: string; message: string }[];
  /** Platforms' notes on the post: it can still go out (shown in "Before it goes out"). */
  warnings?: { platform: string; message: string }[];
}

/** Platforms a photo can be cropped for (one file each, sent only there). */
const CROP_PLATFORMS = [
  "instagram",
  "facebook",
  "linkedin",
  "pinterest",
  "tiktok",
  "googlebusiness",
  "threads",
  "twitter",
  "bluesky",
] as const;

const composeSchema = z.object({
  content: z.string().trim().min(1, "Write something to post.").max(POST_TEXT_MAX),
  accounts: z.array(z.uuid()).min(1, "Pick at least one account."),
  when: z.enum(["now", "later", "queue"]),
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
  // T84c: a photo already copied into media storage from OneDrive, and its size.
  imageUrl: z.string().optional(),
  imageSize: z.coerce.number().int().nonnegative().optional().catch(undefined),
  // Posts Round 2: the photo's or video's size in pixels, and each platform's own crop (its file
  // comes as `crop_<platform>`), all read in the browser.
  mediaShape: z
    .string()
    .optional()
    .transform((v) => {
      try {
        return v ? mediaShapeSchema.parse(JSON.parse(v)) : undefined;
      } catch {
        return undefined;
      }
    }),
});

const pixels = z.number().int().positive().max(100_000);
const mediaShapeSchema = z.object({
  width: pixels,
  height: pixels,
  crops: z
    .partialRecord(z.enum(CROP_PLATFORMS), z.object({ width: pixels, height: pixels }))
    .optional()
    .default({}),
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
    imageUrl: formData.get("imageUrl") || undefined,
    imageSize: formData.get("imageSize") || undefined,
    mediaShape: formData.get("mediaShape") || undefined,
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
  const media: {
    url: string;
    seconds?: number | null;
    type: "image" | "video";
    width?: number;
    height?: number;
  }[] = [];
  const shape = parsed.data.mediaShape;
  const dims = shape ? { width: shape.width, height: shape.height } : {};
  const image = formData.get("image");
  if (parsed.data.video) {
    const mock = resolveSocialProviderMode(process.env) === "mock";
    if (!isUploadedVideoUrl(parsed.data.video, { mock, appUrl: process.env.APP_URL })) {
      return { error: "Upload the video again.", field: "image" };
    }
    media.push({
      url: parsed.data.video,
      seconds: parsed.data.videoSeconds ?? null,
      type: "video",
      ...dims,
    });
  } else if (parsed.data.imageUrl && !(image instanceof File && image.size > 0)) {
    const mock = resolveSocialProviderMode(process.env) === "mock";
    if (!isUploadedImageUrl(parsed.data.imageUrl, { mock, appUrl: process.env.APP_URL })) {
      return { error: "Pick the photo again.", field: "image" };
    }
    const { data: picked } = await db
      .from("social_accounts")
      .select("platform")
      .eq("tenant_id", tenant.id)
      .in("id", accounts);
    const maxBytes = imageMaxBytesFor(
      (picked ?? []).map((a) => a.platform),
      POST_IMAGE_MAX_BYTES,
    );
    if ((parsed.data.imageSize ?? 0) > maxBytes) {
      return {
        error: `Use an image under ${Math.round(maxBytes / 100_000) / 10} MB.`,
        field: "image",
      };
    }
    media.push({ url: parsed.data.imageUrl, type: "image", ...dims });
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
    const uploaded = await uploadPhoto(image, tenant.id);
    if ("error" in uploaded) return uploaded;
    media.push({ url: uploaded.url, type: "image", ...dims });
  }

  // Posts Round 2: each platform's own crop, uploaded like the photo and sent only there
  // (Zernio `customMedia`). Only with a photo; the browser's options never carry files.
  const options = withoutMedia(readOptions(formData.get("platformOptions")));
  const crops = media[0]?.type === "image" ? Object.entries(shape?.crops ?? {}) : [];
  for (const [platform, size] of crops) {
    const file = formData.get(`crop_${platform}`);
    if (!size || !(file instanceof File) || file.size === 0) continue;
    if (!["image/jpeg", "image/png"].includes(file.type)) {
      return { error: "Crop the photo again.", field: "image" };
    }
    const maxBytes = imageMaxBytesFor([platform], POST_IMAGE_MAX_BYTES);
    if (file.size > maxBytes) {
      return {
        error: `The crop for ${platformLabel(platform)} is over ${Math.round(maxBytes / 100_000) / 10} MB. Crop a smaller part, or remove the crop.`,
        field: "image",
      };
    }
    const uploaded = await uploadPhoto(file, tenant.id);
    if ("error" in uploaded) return uploaded;
    options[platform] = {
      ...options[platform],
      media: [{ url: uploaded.url, type: "image", width: size.width, height: size.height }],
    };
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
      options,
      queued: when === "queue",
    },
  );
  if (!result.ok) {
    if (result.error === "not_accepted") {
      return {
        problems: result.problems,
        warnings: result.warnings,
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
  const warnings = result.warnings.length ? { warnings: result.warnings } : {};
  if (result.outcome === "failed") {
    return { error: result.error, savedAt: Date.now(), outcome: "failed", ...warnings };
  }
  return { savedAt: Date.now(), outcome: result.outcome, ...warnings };
}

/** Uploads a photo (or a crop of it) to media storage for a post. */
async function uploadPhoto(
  file: File,
  tenantId: string,
): Promise<{ url: string } | { error: string; field: "image" }> {
  try {
    const { publicUrl } = await getSocialProvider().uploadMedia({
      filename: file.name || "image",
      contentType: file.type,
      bytes: new Uint8Array(await file.arrayBuffer()),
      signal: AbortSignal.timeout(30_000),
    });
    return { url: publicUrl };
  } catch (error) {
    if (isPlatformPaused(error)) {
      await recordPlatformPause(getServiceClient());
      return { error: "Posting is paused on our side right now. Try again later.", field: "image" };
    }
    Sentry.captureException(error, { extra: { tenantId } });
    return { error: "The image couldn't be uploaded. Try again.", field: "image" };
  }
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
 * Try a failed or partly posted post again, or move one that never went out to a new time
 * (posts.ts / retry.ts decide how; only the accounts that didn't get it are tried again).
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
  const result = await retryFailedPost(
    { db: getServiceClient(), social: getSocialProvider },
    { tenantId: tenant.id, userId: tenant.userId, postId: parsed.data.postId, scheduledFor: at },
  );
  revalidatePath("/posts");
  return result.ok ? {} : { error: result.error };
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

/** T64: the boards of one Pinterest account, for "Change board". */
export async function loadPinterestBoards(
  accountId: string,
): Promise<{ boards: PinterestBoard[]; current: string | null } | { error: string }> {
  if (!z.uuid().safeParse(accountId).success) return { error: "Reload the page." };
  const tenant = await getTenantFor("posts.write");
  if (!tenant) return { error: NOT_ALLOWED };
  try {
    const result = await listBoardsFor(
      { db: getServiceClient(), social: getSocialProvider() },
      { tenantId: tenant.id, accountId },
    );
    return result ?? { error: "That Pinterest account isn't connected." };
  } catch (error) {
    Sentry.captureException(error, { extra: { tenantId: tenant.id, step: "pinterestBoards" } });
    return { error: "Couldn't load your boards from Pinterest. Try again." };
  }
}

const boardSchema = z.object({ accountId: z.uuid(), boardId: z.string().min(1).max(100) });

/** T64: remember a board for the account; every pin goes there from now on. */
export async function choosePinterestBoard(input: {
  accountId: string;
  boardId: string;
}): Promise<{ board: PinterestBoard } | { error: string }> {
  const parsed = boardSchema.safeParse(input);
  if (!parsed.success) return { error: "Pick a board." };
  const tenant = await getTenantFor("posts.write");
  if (!tenant) return { error: NOT_ALLOWED };
  try {
    const result = await chooseBoardFor(
      { db: getServiceClient(), social: getSocialProvider() },
      { tenantId: tenant.id, actor: tenant.userId, ...parsed.data },
    );
    if (!result.ok) return { error: "That board isn't on this Pinterest account any more." };
    revalidatePath("/posts");
    return { board: result.board };
  } catch (error) {
    Sentry.captureException(error, { extra: { tenantId: tenant.id, step: "pinterestBoard" } });
    return { error: "Couldn't save the board. Try again." };
  }
}

/** The composer's per-platform options (T75), re-checked here; bad JSON means none. */
function readOptions(value: FormDataEntryValue | null): PostOptions {
  if (typeof value !== "string" || !value) return {};
  try {
    return parsePostOptions(JSON.parse(value));
  } catch {
    return {};
  }
}

export type TakeDownState = { error?: string; done?: string };

/** Take a published post down (T75c); the row says where it's gone and where it isn't. */
export async function takeDown(_prev: TakeDownState, formData: FormData): Promise<TakeDownState> {
  const parsed = idSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Something went wrong. Reload the page." };
  const tenant = await getTenantFor("posts.write");
  if (!tenant) return { error: NOT_ALLOWED };
  const result = await takeDownPost(
    { db: getServiceClient(), social: getSocialProvider },
    { tenantId: tenant.id, userId: tenant.userId, postId: parsed.data.postId },
  );
  if (!result.ok) return { error: "Only a published post can be taken down." };
  revalidatePath("/posts");
  const names = (ps: string[]) => ps.map(platformLabel).join(", ");
  if (result.failed.length && !result.removed.length) {
    return { error: `Couldn't remove it from ${names(result.failed)}. Try again.` };
  }
  return {
    done: [
      result.removed.length ? `Removed from ${names(result.removed)}.` : "",
      result.failed.length ? `Couldn't remove it from ${names(result.failed)}; try again.` : "",
      result.byHand.length ? `Remove it yourself in the ${names(result.byHand)} app.` : "",
    ]
      .filter(Boolean)
      .join(" "),
  };
}

// --- OneDrive (T84c) --------------------------------------------------------------------------

export type OneDriveList =
  { items: ReturnType<typeof postableItems> } | { error: string; connect?: "outlook" | "files" };

/** The brand's Outlook account (OneDrive lives on it). */
async function microsoftAccount(tenantId: string) {
  const { data } = await getServiceClient()
    .from("social_accounts")
    .select("zernio_account_id")
    .eq("tenant_id", tenantId)
    .eq("platform", "microsoft")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  return data?.zernio_account_id ?? null;
}

/** A OneDrive folder (or a search) with the photos and videos a post can use. */
export async function listOneDriveAction(input: {
  folderId?: string;
  q?: string;
}): Promise<OneDriveList> {
  const tenant = await getTenantFor("posts.write");
  if (!tenant) return { error: NOT_ALLOWED };
  const accountId = await microsoftAccount(tenant.id);
  if (!accountId) {
    return {
      error: "Sign in with Microsoft in Settings → Accounts to use OneDrive.",
      connect: "outlook",
    };
  }
  const folderId = typeof input.folderId === "string" ? input.folderId.slice(0, 300) : undefined;
  const q = typeof input.q === "string" ? input.q.trim().slice(0, 100) : undefined;
  try {
    const items = await getSocialProvider().listFiles({
      accountId,
      ...(folderId ? { folderId } : {}),
      ...(q ? { q } : {}),
      signal: AbortSignal.timeout(15_000),
    });
    return { items: postableItems(items) };
  } catch (error) {
    const s = error instanceof SocialProviderError ? error.details.status : undefined;
    if (s === 412) {
      return {
        error: "Sign in with Microsoft again and allow files, so Waggle can see OneDrive.",
        connect: "files",
      };
    }
    Sentry.captureException(error, { extra: { tenantId: tenant.id, step: "listOneDrive" } });
    return { error: "OneDrive couldn't be loaded right now. Try again in a moment." };
  }
}

/** Copies a OneDrive photo or video into post media, for the composer to use like an upload. */
export async function pickOneDriveAction(input: {
  fileId: string;
  use: "image" | "video";
}): Promise<{ url: string; name: string; size: number } | { error: string }> {
  const tenant = await getTenantFor("posts.write");
  if (!tenant) return { error: NOT_ALLOWED };
  const accountId = await microsoftAccount(tenant.id);
  if (!accountId || typeof input.fileId !== "string" || !input.fileId) {
    return { error: "Reload the page and pick the file again." };
  }
  try {
    const copy = await getSocialProvider().copyFileToMedia({
      accountId,
      fileId: input.fileId.slice(0, 300),
      maxBytes: input.use === "video" ? ONEDRIVE_VIDEO_MAX_BYTES : POST_IMAGE_MAX_BYTES,
      signal: AbortSignal.timeout(120_000),
    });
    const kind = driveKind({ kind: "file", mimeType: copy.contentType });
    if (kind !== input.use) return { error: "Pick a JPG, PNG or WebP photo, or an MP4 video." };
    return { url: copy.publicUrl, name: copy.name, size: copy.size };
  } catch (error) {
    const s = error instanceof SocialProviderError ? error.details.status : undefined;
    if (s === 413) {
      return {
        error:
          input.use === "video"
            ? "That video is over 100 MB. Upload it from your device instead."
            : "That photo is over 5 MB.",
      };
    }
    if (s === 404) return { error: "That file isn't in OneDrive any more." };
    if (isPlatformPaused(error)) {
      await recordPlatformPause(getServiceClient());
      return { error: "Posting is paused on our side right now. Try again later." };
    }
    Sentry.captureException(error, { extra: { tenantId: tenant.id, step: "pickOneDrive" } });
    return { error: "The file couldn't be copied. Try again." };
  }
}
