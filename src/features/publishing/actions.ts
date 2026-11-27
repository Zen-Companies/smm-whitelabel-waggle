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
import { fixLiveText, movePost, updateScheduledPost, type UpdatePostResult } from "./edit";
import { liveEditOutcome } from "./live-edit";
import type { StoredMedia } from "./publish";
import { isUploadedVideoUrl, isVideoType, videoFilename, videoProblem } from "./video";
import { driveKind, isUploadedImageUrl, ONEDRIVE_VIDEO_MAX_BYTES, postableItems } from "./onedrive";
import { parsePostOptions, withoutMedia, type PostOptions } from "./post-options";
import { CAROUSEL_MAX, platformFiles, type PostFile } from "./carousel";
import { businessPhone, googleProblems, telUrl, withHttps } from "./google-post";
import { optionMedia } from "./posts";
import { platformLabel } from "@/lib/social/platforms";
import { getLlmClientOrNull } from "@/lib/llm";
import { CAPTION_ABOUT_MAX, sourceLine } from "./caption";
import { writeCaption, type CaptionRunResult } from "./caption-run";
import { REPEAT_MAX_COUNT, repeatChoiceProblem, type RepeatChoice } from "./repeat-rule";
import { applyEditToRepeat, createRepeat, stopRepeat } from "./repeats";
import { validTimeZone } from "@/lib/time/zone";

export interface ComposeState {
  error?: string;
  /** Field the error belongs to (design.md §4: errors stay where they happened). */
  field?: "content" | "accounts" | "when" | "image" | "youtubeTitle";
  /** Set when the post was saved: the form resets and the new post shows in the list. */
  savedAt?: number;
  /** The saved post (Round 3: a duplicate opens on it). */
  postId?: string;
  outcome?: "published" | "scheduled" | "waiting" | "failed" | "updated" | "repeating";
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

const pixels = z.number().int().positive().max(100_000);

/** Posts Round 4: the post's files in order, already uploaded (the first is the cover). */
const itemsSchema = z
  .array(
    z.object({
      url: z.string().url().max(2000),
      type: z.enum(["image", "video"]),
      width: pixels.optional(),
      height: pixels.optional(),
      seconds: z.number().positive().max(86_400).optional(),
    }),
  )
  .max(CAROUSEL_MAX);

/** Each platform's own crops, by the photo's place in the post (already uploaded). */
const cropsSchema = z.partialRecord(
  z.enum(CROP_PLATFORMS),
  z.record(
    z.string().regex(/^\d{1,2}$/),
    z.object({ url: z.string().url().max(2000), width: pixels, height: pixels }),
  ),
);

/** A JSON form field, read with `schema`; `empty` when it's missing or wrong. */
function jsonField<T>(value: FormDataEntryValue | null, schema: z.ZodType<T>, empty: T): T {
  if (typeof value !== "string" || !value) return empty;
  try {
    const r = schema.safeParse(JSON.parse(value));
    return r.success ? r.data : empty;
  } catch {
    return empty;
  }
}

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
});

type Prepared =
  | { ok: false; state: ComposeState }
  | {
      ok: true;
      tenant: NonNullable<Awaited<ReturnType<typeof getTenantFor>>>;
      db: ReturnType<typeof getServiceClient>;
      data: z.infer<typeof composeSchema>;
      scheduledFor: Date | null;
      media: StoredMedia[];
      options: PostOptions;
    };

/** The owner's words for a size limit. */
const underMb = (bytes: number) => `${Math.round(bytes / 100_000) / 10} MB`;

/**
 * The composer's form, checked: shared by a new post, a duplicate and an edit (Posts Round 3).
 * Every file is already in media storage (Round 4): a link is taken only when it's one Waggle
 * uploaded, or one of `sourceId`'s own files (the post being edited or copied, read from our
 * row, never from the browser). Several files make a carousel; each platform's crops come by the
 * photo's place; Google's post kind and button are checked here, and Call now takes the business
 * phone from Business info.
 */
async function prepareCompose(formData: FormData, sourceId?: string): Promise<Prepared> {
  const parsed = composeSchema.safeParse({
    content: formData.get("content"),
    accounts: formData.getAll("accounts"),
    when: formData.get("when"),
    scheduledFor: formData.get("scheduledFor") || undefined,
    youtubeTitle: formData.get("youtubeTitle") || undefined,
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue.path[0];
    return {
      ok: false,
      state: {
        error: issue.message,
        field: field === "accounts" || field === "youtubeTitle" ? field : "content",
      },
    };
  }
  const items = jsonField(formData.get("items"), itemsSchema, null);
  if (!items) return { ok: false, state: { error: "Add the photos again.", field: "image" } };
  const cropsIn = jsonField(formData.get("crops"), cropsSchema, {});
  const { accounts, when } = parsed.data;
  let scheduledFor: Date | null = null;
  if (when === "later") {
    const at = parsed.data.scheduledFor ? new Date(parsed.data.scheduledFor) : null;
    if (!at || Number.isNaN(at.getTime())) {
      return { ok: false, state: { error: "Pick a date and time.", field: "when" } };
    }
    if (at.getTime() < Date.now() + 5 * 60_000) {
      return {
        ok: false,
        state: { error: "Pick a time at least 5 minutes from now.", field: "when" },
      };
    }
    scheduledFor = at;
  }

  const tenant = await getTenantFor("posts.write");
  if (!tenant) return { ok: false, state: { error: NOT_ALLOWED } };
  const db = getServiceClient();
  // The post being edited or copied, only this brand's: its files may be reused, never re-sent.
  const known = new Set<string>();
  if (sourceId) {
    const { data } = await db
      .from("posts")
      .select("media, platform_options")
      .eq("id", sourceId)
      .eq("tenant_id", tenant.id)
      .maybeSingle();
    if (!data) {
      return { ok: false, state: { error: "That post isn't here any more. Reload the page." } };
    }
    for (const m of (data.media as StoredMedia[] | null) ?? []) if (m.url) known.add(m.url);
    for (const o of Object.values(parsePostOptions(data.platform_options))) {
      for (const m of o?.media ?? []) known.add(m.url);
    }
  }
  const mock = resolveSocialProviderMode(process.env) === "mock";
  const linkOpts = { mock, appUrl: process.env.APP_URL };
  const ours = (url: string, kind: "image" | "video") =>
    known.has(url) ||
    (kind === "video" ? isUploadedVideoUrl(url, linkOpts) : isUploadedImageUrl(url, linkOpts));

  const media: StoredMedia[] = [];
  for (const item of items) {
    if (!ours(item.url, item.type)) {
      return {
        ok: false,
        state: {
          error: `Add the ${item.type === "video" ? "video" : "photo"} again.`,
          field: "image",
        },
      };
    }
    media.push({
      url: item.url,
      type: item.type,
      ...(item.seconds ? { seconds: item.seconds } : {}),
      ...(item.width && item.height ? { width: item.width, height: item.height } : {}),
    });
  }

  const { data: pickedRows } = await db
    .from("social_accounts")
    .select("platform")
    .eq("tenant_id", tenant.id)
    .in("id", accounts);
  const picked = new Set((pickedRows ?? []).map((a) => a.platform));

  const options = withoutMedia(readOptions(formData.get("platformOptions")));
  // Posts Round 2 and 4: each platform's crops, sent only there (Zernio `customMedia`), as its
  // own trimmed set with the crops in place.
  for (const [platform, byIndex] of Object.entries(cropsIn)) {
    if (!byIndex || !picked.has(platform)) continue;
    const crops: Record<number, { url: string; width: number; height: number }> = {};
    for (const [key, crop] of Object.entries(byIndex)) {
      const i = Number(key);
      if (media[i]?.type !== "image") continue;
      if (!ours(crop.url, "image")) {
        return { ok: false, state: { error: "Crop the photo again.", field: "image" } };
      }
      crops[i] = crop;
    }
    if (!Object.keys(crops).length) continue;
    const { files } = platformFiles(
      platform,
      media as PostFile[],
      crops,
      options[platform]?.as,
      options[platform]?.pick,
    );
    if (files) options[platform] = { ...options[platform], media: optionMedia(files) };
  }

  // Round 4: Google's post kind and button. Call now dials the business phone from Business info.
  const google = options.googlebusiness?.google;
  if (google && picked.has("googlebusiness")) {
    const phone = google.button === "CALL" ? await loadBusinessPhone(db, tenant.id) : null;
    const problems = googleProblems(google, phone);
    if (problems.length) {
      return {
        ok: false,
        state: {
          error: "Some platforms won't take this post as it is.",
          field: "accounts",
          problems: problems.map((p) => ({ platform: "googlebusiness", message: p.message })),
        },
      };
    }
    options.googlebusiness = {
      ...options.googlebusiness,
      google: {
        ...google,
        ...(google.button === "CALL"
          ? { buttonUrl: telUrl(phone) ?? undefined }
          : google.button && google.buttonUrl
            ? { buttonUrl: withHttps(google.buttonUrl) }
            : { buttonUrl: undefined }),
        redeemUrl: google.redeemUrl?.trim() ? withHttps(google.redeemUrl) : undefined,
      },
    };
  }
  return { ok: true, tenant, db, data: parsed.data, scheduledFor, media, options };
}

/** The business phone Waggle has (Business info), for Google's Call now. */
async function loadBusinessPhone(
  db: ReturnType<typeof getServiceClient>,
  tenantId: string,
): Promise<string | null> {
  const { data } = await db
    .from("kb_entries")
    .select("title, content, found_kind")
    .eq("tenant_id", tenantId)
    .limit(500);
  return businessPhone(data ?? []);
}

const uploadSchema = z.object({
  platforms: z.array(z.string().max(40)).max(30),
});

/**
 * Posts Round 4: uploads one photo (or a crop of one) to media storage as soon as it's needed, so
 * a post with many photos never carries them all in one request. Checked against the strictest
 * size among the picked platforms (Bluesky takes 1 MB).
 */
export async function uploadPostPhoto(
  formData: FormData,
): Promise<{ url: string } | { error: string }> {
  const file = formData.get("file");
  const parsed = uploadSchema.safeParse({ platforms: formData.getAll("platforms") });
  if (!(file instanceof File) || file.size === 0 || !parsed.success) {
    return { error: "Pick the photo again." };
  }
  if (!(POST_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return { error: "Use a JPG, PNG or WebP image." };
  }
  const maxBytes = imageMaxBytesFor(parsed.data.platforms, POST_IMAGE_MAX_BYTES);
  if (file.size > maxBytes) return { error: `Use an image under ${underMb(maxBytes)}.` };
  const tenant = await getTenantFor("posts.write");
  if (!tenant) return { error: NOT_ALLOWED };
  const uploaded = await uploadPhoto(file, tenant.id);
  return "error" in uploaded ? { error: uploaded.error } : uploaded;
}

/** Round 5: the composer's Repeat choice (the first time is the post's own). */
const repeatSchema = z.object({
  every: z.enum(["day", "week", "month"]),
  ends: z.enum(["never", "on", "after"]),
  endDate: z.iso.date().nullish(),
  count: z.number().int().min(2).max(REPEAT_MAX_COUNT).nullish(),
});

function readRepeat(formData: FormData): RepeatChoice | null | "bad" {
  const raw = formData.get("repeat");
  if (typeof raw !== "string" || !raw) return null;
  try {
    const parsed = repeatSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : "bad";
  } catch {
    return "bad";
  }
}

export async function composePost(_prev: ComposeState, formData: FormData): Promise<ComposeState> {
  // Round 3: Duplicate starts from another post; its files are reused from our row.
  const from = z.uuid().safeParse(formData.get("fromPostId"));
  // Round 5: a repeat starts from a post with a time.
  const repeat = readRepeat(formData);
  const zone = validTimeZone(String(formData.get("timeZone") ?? ""));
  if (repeat === "bad") return { error: "Check how it repeats.", field: "when" };
  if (repeat) {
    if (formData.get("when") !== "later") {
      return { error: "Pick when the first one goes out.", field: "when" };
    }
    const first = new Date(String(formData.get("scheduledFor") ?? ""));
    const problem = Number.isNaN(first.getTime()) ? null : repeatChoiceProblem(repeat, first, zone);
    if (problem) return { error: problem, field: "when" };
  }
  const prepared = await prepareCompose(formData, from.success ? from.data : undefined);
  if (!prepared.ok) return prepared.state;
  const { tenant, db, data, scheduledFor, media, options } = prepared;
  const result = await createPost(
    { db, social: getSocialProvider },
    {
      tenantId: tenant.id,
      userId: tenant.userId,
      content: data.content,
      accountIds: data.accounts,
      scheduledFor,
      media: media.flatMap((m) =>
        m.url
          ? [
              {
                url: m.url,
                seconds: m.seconds ?? null,
                type: m.type === "video" ? ("video" as const) : ("image" as const),
                altText: m.altText ?? null,
                width: m.width ?? null,
                height: m.height ?? null,
              },
            ]
          : [],
      ),
      tiktokConsent: formData.get("tiktokConsent") === "yes",
      youtubeTitle: data.youtubeTitle || undefined,
      options,
      queued: data.when === "queue",
      ...(from.success ? { via: { duplicateOf: from.data } } : {}),
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
  // Round 5: the repeat starts once its first post is planned (a refused first post starts none).
  let repeated = false;
  if (repeat && result.outcome !== "failed") {
    try {
      repeated = !!(await createRepeat(db, {
        tenantId: tenant.id,
        userId: tenant.userId,
        postId: result.postId,
        choice: repeat,
        timeZone: zone,
      }));
    } catch (error) {
      Sentry.captureException(error, { extra: { postId: result.postId, step: "createRepeat" } });
    }
  }
  revalidatePath("/posts");
  const warnings = result.warnings.length ? { warnings: result.warnings } : {};
  if (repeat && !repeated && result.outcome !== "failed") {
    return {
      savedAt: Date.now(),
      postId: result.postId,
      outcome: result.outcome,
      error:
        "The first post is planned, but the repeat couldn't be saved. Open the post to try again.",
      ...warnings,
    };
  }
  if (result.outcome === "failed") {
    return {
      error: result.error,
      savedAt: Date.now(),
      postId: result.postId,
      outcome: "failed",
      ...warnings,
    };
  }
  return {
    savedAt: Date.now(),
    postId: result.postId,
    outcome: repeated ? "repeating" : result.outcome,
    ...warnings,
  };
}

/**
 * Edit post → Save changes (Posts Round 3): the planned post changes in place through Zernio's
 * update; the row follows; the audit row lists what changed.
 */
export async function saveEditedPost(
  _prev: ComposeState,
  formData: FormData,
): Promise<ComposeState> {
  const id = z.uuid().safeParse(formData.get("postId"));
  if (!id.success) return { error: "Something went wrong. Reload the page." };
  if (formData.get("when") !== "later") {
    return { error: "Pick a time for the post.", field: "when" };
  }
  const prepared = await prepareCompose(formData, id.data);
  if (!prepared.ok) return prepared.state;
  const { tenant, db, data, scheduledFor, media, options } = prepared;
  if (!scheduledFor) return { error: "Pick a date and time.", field: "when" };
  const result = await updateScheduledPost(
    { db, social: getSocialProvider },
    {
      tenantId: tenant.id,
      userId: tenant.userId,
      postId: id.data,
      content: data.content,
      accountIds: data.accounts,
      scheduledFor,
      media,
      options,
      youtubeTitle: data.youtubeTitle || undefined,
      tiktokConsent: formData.get("tiktokConsent") === "yes",
    },
  );
  if (!result.ok) return { ...updateErrorState(result), field: updateErrorField(result) };
  // Round 5: a repeating post asks "Just this one" or "This and the ones after".
  if (formData.get("repeatScope") === "following") {
    await applyEditToRepeat(db, { tenantId: tenant.id, userId: tenant.userId, postId: id.data });
  }
  revalidatePath("/posts");
  return { savedAt: Date.now(), outcome: "updated" };
}

function updateErrorField(r: Extract<UpdatePostResult, { ok: false }>): ComposeState["field"] {
  if (r.error === "too_soon") return "when";
  if (["accounts_not_owned", "account_disconnected", "consent_required"].includes(r.error)) {
    return "accounts";
  }
  return r.error === "refused" && r.problems?.length ? "accounts" : undefined;
}

/** An edit or move Zernio (or our checks) didn't take, in the owner's words. */
function updateErrorState(r: Extract<UpdatePostResult, { ok: false }>): ComposeState {
  switch (r.error) {
    case "not_editable":
      return { error: "This post can't be changed any more: it's going out or already went out." };
    case "too_soon":
      return { error: "Pick a time at least 5 minutes from now." };
    case "accounts_not_owned":
      return { error: "Pick your connected accounts only." };
    case "account_disconnected":
      return { error: "One of these accounts is disconnected. Reconnect it in Settings first." };
    case "consent_required":
      return { error: "Tick the TikTok confirmation to post there." };
    case "paused":
      return { error: "Posting is paused on our side right now. Try again later." };
    case "unclear":
      return {
        error:
          "We couldn't tell whether the change was saved. Reload in a minute to check before trying again.",
      };
    case "gone":
      return { error: "This post isn't planned any more. Reload the page." };
    case "refused":
      return r.problems?.length
        ? { error: "Some platforms won't take this post as it is.", problems: r.problems }
        : { error: r.message ?? "The change wasn't accepted. Try again." };
  }
}

const moveSchema = z.object({ postId: z.uuid(), scheduledFor: z.iso.datetime({ offset: true }) });

export type MoveState = { error?: string; scheduledFor?: string };

/**
 * Move a planned post (Posts Round 3): drag on the week calendar, Move in the post panel, or
 * Undo (a move back). The post keeps everything else.
 */
export async function movePostAction(input: {
  postId: string;
  scheduledFor: string;
}): Promise<MoveState> {
  const parsed = moveSchema.safeParse(input);
  if (!parsed.success) return { error: "Pick a day and time." };
  const tenant = await getTenantFor("posts.write");
  if (!tenant) return { error: NOT_ALLOWED };
  const result = await movePost(
    { db: getServiceClient(), social: getSocialProvider },
    {
      tenantId: tenant.id,
      userId: tenant.userId,
      postId: parsed.data.postId,
      scheduledFor: new Date(parsed.data.scheduledFor),
    },
  );
  if (!result.ok) return { error: updateErrorState(result).error };
  revalidatePath("/posts");
  return { scheduledFor: result.scheduledFor ?? parsed.data.scheduledFor };
}

const fixSchema = z.object({
  postId: z.uuid(),
  content: z.string().trim().min(1, "Write the text.").max(POST_TEXT_MAX),
});

export type FixTextState = { error?: string; done?: string };

/** Fix the text on a live post (Posts Round 3, decision 2), where the platform allows it. */
export async function fixPostText(_prev: FixTextState, formData: FormData): Promise<FixTextState> {
  const parsed = fixSchema.safeParse({
    postId: formData.get("postId"),
    content: formData.get("content"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Write the text." };
  const tenant = await getTenantFor("posts.write");
  if (!tenant) return { error: NOT_ALLOWED };
  const result = await fixLiveText(
    { db: getServiceClient(), social: getSocialProvider },
    { tenantId: tenant.id, userId: tenant.userId, ...parsed.data },
  );
  if (!result.ok) {
    return {
      error:
        result.error === "too_long"
          ? (result.message ?? "The text is too long.")
          : result.error === "nothing_editable"
            ? "None of the platforms this post is on allow editing a live post."
            : "Only a post that went out can have its text fixed.",
    };
  }
  revalidatePath("/posts");
  const line = liveEditOutcome(result.edited, result.failed);
  return result.edited.length ? { done: line } : { error: line };
}

/** Uploads a photo (or a crop of it) to media storage for a post. */
async function uploadPhoto(
  file: File,
  tenantId: string,
): Promise<{ url: string } | { error: string; field: "image" }> {
  try {
    // The link keeps the file's extension, which is how Waggle and Zernio know it's a photo.
    const ext = ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const)[
      file.type as "image/jpeg"
    ];
    const base = file.name || "image";
    const { publicUrl } = await getSocialProvider().uploadMedia({
      filename: ext && !/\.(jpe?g|png|webp)$/i.test(base) ? `${base}.${ext}` : base,
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

const captionSchema = z.object({
  mode: z.enum(["write", "another", "shorter", "hashtags", "improve"]),
  tone: z.enum(["friendly", "punchy", "excited", "calm"]),
  about: z.string().max(CAPTION_ABOUT_MAX),
  current: z.string().max(POST_TEXT_MAX),
  maxLength: z.number().int().min(50).max(POST_TEXT_MAX),
});

export type CaptionState =
  { ok: true; caption: string; source: string } | { ok: false; error: string; capped?: boolean };

const CAPTION_ERRORS: Record<Exclude<CaptionRunResult, { ok: true }>["reason"], string> = {
  ai_cap_reached:
    "This month's AI allowance is used up, so Waggle can't write captions until next month. You can still write your own.",
  hourly_limit: "That's a lot of captions this hour. Try again in a little while.",
  not_set_up: "Writing with Waggle isn't available right now. Write your own for now.",
  invented:
    "Waggle's try mentioned a price or offer that isn't in your business info, so it was dropped. Try again, or add the offer to what the post is about.",
  failed: "Waggle couldn't write one just now. Try again.",
};

/**
 * Write with Waggle (Posts Round 5): a caption from what the post is about and the business info,
 * or Shorter / Another one / + Hashtags / Improve on one already there. Under the AI cap.
 */
export async function writeCaptionAction(input: unknown): Promise<CaptionState> {
  const parsed = captionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Something went wrong. Reload the page." };
  const d = parsed.data;
  if (d.mode === "write" || d.mode === "another" ? !d.about.trim() : !d.current.trim()) {
    return {
      ok: false,
      error: d.mode === "improve" ? "Write something first." : "Say what the post is about.",
    };
  }
  const tenant = await getTenantFor("posts.write");
  if (!tenant) return { ok: false, error: NOT_ALLOWED };
  const result = await writeCaption(
    { db: getServiceClient(), llm: getLlmClientOrNull() },
    {
      tenantId: tenant.id,
      businessName: tenant.name,
      actor: tenant.userId,
      mode: d.mode,
      tone: d.tone,
      about: d.about,
      current: d.current,
      maxLength: d.maxLength,
    },
  );
  if (!result.ok) {
    return {
      ok: false,
      error: CAPTION_ERRORS[result.reason],
      ...(result.reason === "ai_cap_reached" ? { capped: true } : {}),
    };
  }
  return { ok: true, caption: result.caption, source: sourceLine(result.usedTitles) };
}

export type StopRepeatState = { error?: string; done?: boolean };

/** Stop repeating (Posts Round 5): the planned post still goes out; no more after it. */
export async function stopRepeating(
  _prev: StopRepeatState,
  formData: FormData,
): Promise<StopRepeatState> {
  const id = z.uuid().safeParse(formData.get("repeatId"));
  if (!id.success) return { error: "Something went wrong. Reload the page." };
  const tenant = await getTenantFor("posts.write");
  if (!tenant) return { error: NOT_ALLOWED };
  const result = await stopRepeat(getServiceClient(), {
    tenantId: tenant.id,
    userId: tenant.userId,
    repeatId: id.data,
  });
  if (!result.ok) return { error: "This post doesn't repeat any more. Reload the page." };
  revalidatePath("/posts");
  return { done: true };
}
