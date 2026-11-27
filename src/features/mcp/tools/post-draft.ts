import { z } from "zod";
import {
  CAROUSEL_MAX,
  listBoardsFor,
  loadBusinessPhone,
  POST_TEXT_MAX,
  readyGoogleOptions,
  targetExtras,
  type PostOptions,
  type StoredMedia,
} from "@/features/publishing";
import { writeAudit } from "@/lib/audit";
import { platformLabel } from "@/lib/social/platforms";
import type { MediaKind } from "@/lib/social/types";
import type { Json } from "@/lib/supabase/database.types";
import { ToolError, viaOf, type ToolContext } from "../context";
import type { ToolAnnotations } from "./define";
import {
  carouselFit,
  mediaProblems,
  optionProblems,
  PREVIEW_TTL_MS,
  toPostOptions,
  TOOL_GOOGLE_BUTTONS,
  UPLOAD_USABLE_MS,
  type PlatformFiles,
  type PublishWhen,
  type ToolPostOption,
} from "./post-preview";

// The checks every post preview shares (preview_post, duplicate_post, preview_post_edit): this
// brand's accounts, per-platform choices (Google's kind and button made ready the composer's way),
// photos and videos checked by Zernio, each platform's part of a carousel, Zernio's dry run, and
// the stored preview the owner says yes to. Nothing here reaches customers.

/** As many files as the composer takes (Posts Round 4: carousels up to 20). */
export const MAX_MEDIA = CAROUSEL_MAX;
const CHECK_TIMEOUT_MS = 20_000;

/** Saves a preview in Waggle; nothing reaches Instagram or Facebook. */
export const PREVIEW_ACTION: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
};

export const mediaItem = z.object({
  url: z
    .url()
    .describe(
      "A public https link straight to the photo or video file, or a Google Drive link shared as 'Anyone with the link'. Not Dropbox, OneDrive or iCloud links (they open a web page).",
    ),
  alt_text: z.string().trim().max(1000).optional().describe("A short description of the photo."),
  type: z
    .enum(["image", "video"])
    .optional()
    .describe(
      "Only when the link doesn't show it (no file extension): whether it's a photo or a video. Waggle's own check wins when it can tell.",
    ),
});
export type ToolMedia = z.infer<typeof mediaItem>;

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "a day as YYYY-MM-DD");
const time = z.string().regex(/^\d{2}:\d{2}$/, "a time as HH:MM (24-hour)");

const googleInput = z
  .object({
    kind: z
      .enum(["update", "offer", "event"])
      .describe("update: a normal post; offer: a deal with dates; event: something on a day."),
    title: z.string().trim().max(58).optional().describe("Offer or event: its title (Google: 58)."),
    start_day: day.optional().describe("Offer or event: first day, YYYY-MM-DD."),
    start_time: time.optional().describe("Event only: start time, HH:MM."),
    end_day: day.optional().describe("Offer or event: last day, YYYY-MM-DD."),
    end_time: time.optional().describe("Event only: end time, HH:MM."),
    coupon_code: z.string().trim().max(58).optional().describe("Offer only: a code to show."),
    redeem_url: z.string().trim().max(2000).optional().describe("Offer only: where to redeem it."),
    terms: z.string().trim().max(5000).optional().describe("Offer only: terms and conditions."),
    button: z
      .enum(TOOL_GOOGLE_BUTTONS)
      .optional()
      .describe(
        "A button under the post. call_now calls the business phone saved in Business info (no link needed); the others need button_url.",
      ),
    button_url: z
      .string()
      .trim()
      .max(2000)
      .optional()
      .describe("The button's link (https), for every button but call_now."),
  })
  .describe(
    "Google Business only: an Update (default), an Offer or an Event, and an optional button. Use only facts from search_knowledge for offers.",
  );

export const optionsList = z
  .array(
    z.object({
      platform: z.string().describe("The platform these choices are for, e.g. instagram."),
      post_type: z
        .enum(["post", "story", "reel"])
        .optional()
        .describe(
          "Instagram and Facebook: a feed post, a story or a reel (a reel needs a video). Default: post.",
        ),
      first_comment: z
        .string()
        .trim()
        .max(2200)
        .optional()
        .describe("Instagram, Facebook, YouTube, Threads, LinkedIn: posted as the first comment."),
      title: z.string().trim().max(100).optional().describe("YouTube and Facebook reels: a title."),
      pinterest_board_id: z
        .string()
        .optional()
        .describe("Pinterest: board_id from list_pinterest_boards."),
      caption: z
        .string()
        .trim()
        .max(POST_TEXT_MAX)
        .optional()
        .describe("A different caption for this platform only."),
      ai_label: z
        .boolean()
        .optional()
        .describe(
          "Instagram and YouTube: label it as made with AI (or changed to look real). Only when the owner says so.",
        ),
      visibility: z
        .enum(["public", "unlisted", "private"])
        .optional()
        .describe("YouTube: who can see the video. Default: public."),
      made_for_kids: z.boolean().optional().describe("YouTube: the video is made for kids."),
      google: googleInput.optional(),
    }),
  )
  .max(10);

export const optionsInput = optionsList
  .default([])
  .describe("Optional per-platform choices. Leave out for a normal post everywhere.");

export interface AccountRow {
  id: string;
  platform: string;
  username: string | null;
  status: string;
  zernio_account_id: string;
}

export async function brandAccounts(ctx: ToolContext, tenantId: string): Promise<AccountRow[]> {
  const { data, error } = await ctx.db
    .from("social_accounts")
    .select("id, platform, username, status, zernio_account_id")
    .eq("tenant_id", tenantId);
  if (error) throw new Error(`mcp post accounts failed: ${error.message}`);
  return data ?? [];
}

const describeAccounts = (rows: { id: string; platform: string; username: string | null }[]) =>
  rows
    .map((a) => `${a.id} (${platformLabel(a.platform)}${a.username ? ` @${a.username}` : ""})`)
    .join(", ");

/**
 * The accounts asked for: this brand's, connected, and never TikTok unless the post already goes
 * there (TikTok needs the owner's own confirmation on every post, given in Waggle).
 */
export async function pickAccounts(
  ctx: ToolContext,
  tenantId: string,
  ids: readonly string[],
  opts: { tiktokAlready?: boolean } = {},
): Promise<AccountRow[]> {
  const all = await brandAccounts(ctx, tenantId);
  const picked = [...new Set(ids)].map((id) => all.find((a) => a.id === id));
  if (!picked.length || picked.some((a) => !a)) {
    throw new ToolError(
      "invalid_input",
      `account_ids must be this brand's account_id values. This brand has: ${describeAccounts(all) || "no connected accounts"}.`,
    );
  }
  const accounts = picked as AccountRow[];
  const off = accounts.filter((a) => a.status !== "active");
  if (off.length) {
    throw new ToolError(
      "invalid_input",
      `${off.map((a) => platformLabel(a.platform)).join(", ")} is disconnected; the owner reconnects it in Waggle.`,
    );
  }
  if (!opts.tiktokAlready && accounts.some((a) => a.platform === "tiktok")) {
    throw new ToolError(
      "invalid_input",
      "TikTok needs the owner's own confirmation on every post: leave TikTok out here, and the owner posts it in Waggle.",
    );
  }
  return accounts;
}

/**
 * The assistant's per-platform choices, checked against the accounts and made ready to save: a
 * Pinterest board must be the account's, and Google's kind and button go through the composer's
 * own check (Call now dials the business phone from Business info).
 */
export async function prepareOptions(
  ctx: ToolContext,
  tenantId: string,
  accounts: readonly AccountRow[],
  options: ToolPostOption[],
  youtubeTitle?: string,
): Promise<PostOptions> {
  const platforms = [...new Set(accounts.map((a) => a.platform))];
  const issues = optionProblems(options, platforms);
  const board = options.find(
    (o) => o.platform.trim().toLowerCase() === "pinterest" && o.pinterest_board_id,
  )?.pinterest_board_id;
  if (board) {
    const pin = accounts.find((a) => a.platform === "pinterest");
    let ok = false;
    try {
      const r = pin
        ? await listBoardsFor({ db: ctx.db, social: ctx.social() }, { tenantId, accountId: pin.id })
        : null;
      ok = !!r?.boards.some((b) => b.id === board);
    } catch {
      throw new ToolError("provider_failed", "Couldn't check the Pinterest board. Try again.");
    }
    if (!ok)
      issues.push(
        "options: pinterest_board_id isn't one of this account's boards (see list_pinterest_boards).",
      );
  }
  if (issues.length) throw new ToolError("invalid_input", issues.join(" "));
  const out = toPostOptions(options, { youtubeTitle });
  const google = out.googlebusiness?.google;
  if (google) {
    const phone = google.button === "CALL" ? await loadBusinessPhone(ctx.db, tenantId) : null;
    const ready = readyGoogleOptions(google, phone);
    if (!ready.ok) {
      throw new ToolError(
        "invalid_input",
        `Google Business: ${ready.problems.map((p) => p.message).join(" ")}`,
      );
    }
    out.googlebusiness = { ...out.googlebusiness, google: ready.google };
  }
  return out;
}

/** One file of a preview, as stored in `post_previews.media` and shown to the owner. */
export interface PreviewFile {
  url: string;
  type: string | null;
  format: string | null;
  size_bytes: number | null;
  alt_text: string | null;
  seconds?: number | null;
  width?: number | null;
  height?: number | null;
}

/** The files the owner added on Waggle's Add photos page (create_upload_link). */
export async function uploadedFiles(
  ctx: ToolContext,
  tenantId: string,
  uploadId: string,
  now: Date,
): Promise<{ url: string }[]> {
  const { data: up } = await ctx.db
    .from("media_uploads")
    .select("files, created_at")
    .eq("id", uploadId)
    .eq("tenant_id", tenantId)
    .eq("created_by", ctx.principal.userId)
    .eq("client_id", ctx.principal.clientId)
    .maybeSingle();
  if (!up) {
    throw new ToolError(
      "invalid_input",
      "No upload with this upload_id for this brand. Call create_upload_link.",
    );
  }
  if (new Date(up.created_at).getTime() + UPLOAD_USABLE_MS < now.getTime()) {
    throw new ToolError(
      "invalid_input",
      "This upload is too old. Make a new one with create_upload_link.",
    );
  }
  const files = (up.files as { url: string }[]) ?? [];
  if (!files.length) {
    throw new ToolError(
      "invalid_input",
      "No photos were added yet. Ask the owner to add them with the link, then tell you when they're done.",
    );
  }
  return files;
}

/**
 * The post's files in order, each checked: links the post already has (`known`, from our row) are
 * taken as they are; every other link is checked by Zernio (reachable, really a photo or video,
 * within each platform's size).
 */
export async function checkMedia(
  ctx: ToolContext,
  items: readonly ToolMedia[],
  platforms: readonly string[],
  known: ReadonlyMap<string, StoredMedia> = new Map(),
): Promise<PreviewFile[]> {
  if (items.length > MAX_MEDIA) {
    throw new ToolError("invalid_input", `At most ${MAX_MEDIA} photos or videos in one post.`);
  }
  const social = ctx.social();
  const checks = await Promise.all(
    items.map((m) =>
      known.has(m.url)
        ? Promise.resolve(undefined)
        : social
            .validateMedia({ url: m.url, signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) })
            .catch(() => null),
    ),
  );
  const problems: string[] = [];
  checks.forEach((c, i) => {
    if (c === null) problems.push(`media[${i}]: couldn't be checked right now. Try again.`);
    else if (c) problems.push(...mediaProblems(i, c, [...platforms]));
  });
  if (problems.length) throw new ToolError("invalid_input", problems.join(" "));
  return items.map((m, i) => {
    const c = checks[i];
    const stored = known.get(m.url);
    if (!c) {
      return {
        url: m.url,
        type: stored?.type ?? m.type ?? null,
        format: null,
        size_bytes: null,
        alt_text: m.alt_text ?? stored?.altText ?? null,
        seconds: stored?.seconds ?? null,
        width: stored?.width ?? null,
        height: stored?.height ?? null,
      };
    }
    return {
      url: m.url,
      type: c.type === "image" || c.type === "video" ? c.type : (m.type ?? c.type ?? null),
      format: c.format ?? null,
      size_bytes: c.size ?? null,
      alt_text: m.alt_text ?? null,
    };
  });
}

const KINDS: readonly MediaKind[] = ["image", "video", "gif", "document"];
const mediaKind = (t: string | null): MediaKind | null => KINDS.find((k) => k === t) ?? null;

const kindOfFile = (f: { type: string | null }): "image" | "video" =>
  f.type === "video" ? "video" : "image";

/**
 * What each platform takes of the files (a carousel is trimmed per platform, never blocked unless
 * nothing fits), then Zernio's dry run with each platform's own text and choices. Returns the
 * notes to show the owner.
 */
export async function dryRun(
  ctx: ToolContext,
  input: {
    content: string;
    files: readonly PreviewFile[];
    accounts: readonly AccountRow[];
    options: PostOptions;
  },
): Promise<{ warnings: string[]; perPlatform: PlatformFiles[] }> {
  const platforms = [...new Set(input.accounts.map((a) => a.platform))];
  const fit = carouselFit(platforms, input.files.map(kindOfFile), input.options);
  if (fit.blocked.length) throw new ToolError("invalid_input", fit.blocked.join(" "));
  const warnings = [...fit.warnings];
  try {
    const v = await ctx.social().validatePost({
      content: input.content,
      media: input.files.map((m) => ({ url: m.url, type: mediaKind(m.type), altText: m.alt_text })),
      // Zernio's account ids (as the composer sends), not Waggle's.
      targets: input.accounts.map((a) => ({
        platform: a.platform as "instagram",
        accountId: a.zernio_account_id,
      })),
      extras: Object.fromEntries(
        platforms.map((p) => [p, targetExtras(p, input.options[p], input.content)]),
      ),
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
    });
    if (v.errors.length) {
      throw new ToolError(
        "invalid_input",
        v.errors.map((e) => `${platformLabel(e.platform)}: ${e.message}`).join(" "),
      );
    }
    warnings.push(...v.warnings.map((w) => `${platformLabel(w.platform)}: ${w.message}`));
  } catch (e) {
    if (e instanceof ToolError) throw e;
    warnings.push("The platforms' own checks didn't answer in time; they run again when it posts.");
  }
  return { warnings, perPlatform: fit.perPlatform };
}

/** A preview row: a new post (change null), or a change to `postId`. */
export interface PreviewRow {
  content: string;
  accountIds: string[];
  media: readonly PreviewFile[];
  when: PublishWhen;
  youtubeTitle?: string | null;
  options: PostOptions;
  change?: { kind: "edit" | "move" | "fix_text"; postId: string };
}

/** Stores what the owner is shown, for one confirmation by the same person and assistant. */
export async function savePreview(
  ctx: ToolContext,
  tenantId: string,
  row: PreviewRow,
  audit: { action: string; details: Record<string, Json> },
): Promise<{ confirmation: string; expiresAt: string }> {
  const now = ctx.now?.() ?? new Date();
  const expires = new Date(now.getTime() + PREVIEW_TTL_MS);
  const { data, error } = await ctx.db
    .from("post_previews")
    .insert({
      tenant_id: tenantId,
      created_by: ctx.principal.userId,
      client_id: ctx.principal.clientId,
      content: row.content,
      // The column keeps 1–10; a change keeps the post's accounts only to show them.
      account_ids: row.accountIds.slice(0, 10),
      media: row.media as unknown as Json,
      publish_mode: row.when.mode,
      publish_at: row.when.at?.toISOString() ?? null,
      youtube_title: row.youtubeTitle ?? null,
      options: row.options as unknown as Json,
      expires_at: expires.toISOString(),
      ...(row.change ? { change: row.change.kind, post_id: row.change.postId } : {}),
    })
    .select("id")
    .single();
  if (error || !data) throw new ToolError("unavailable", "Couldn't save the preview. Try again.");
  await writeAudit(ctx.db, {
    tenantId,
    action: audit.action,
    actor: ctx.principal.userId,
    details: { previewId: data.id, ...audit.details, via: viaOf(ctx.principal) },
  });
  return { confirmation: data.id, expiresAt: expires.toISOString() };
}

/** The preview the owner is shown (the same shape for a new post, a duplicate and an edit). */
export const previewShape = z.object({
  content: z.string(),
  accounts: z.array(
    z.object({ account_id: z.uuid(), platform: z.string(), username: z.string().nullable() }),
  ),
  media: z.array(
    z.object({
      url: z.string(),
      type: z.string().nullable(),
      format: z.string().nullable(),
      size_bytes: z.number().nullable(),
    }),
  ),
  media_per_platform: z
    .array(
      z.object({
        platform: z.string(),
        files: z.number().describe("How many of the files go there."),
        note: z.string().nullable().describe("Why some stay off that platform, when they do."),
      }),
    )
    .describe("A carousel is trimmed to what each platform takes."),
  publish: z.object({ mode: z.enum(["now", "queue", "at"]), at: z.string().nullable() }),
  options: z.record(z.string(), z.record(z.string(), z.unknown())),
});

/** Per-platform choices to show: each platform's own files are summed up, not listed. */
function shownOptions(options: PostOptions): Record<string, Record<string, unknown>> {
  return Object.fromEntries(
    Object.entries(options).flatMap(([p, o]) => {
      if (!o) return [];
      const rest = Object.fromEntries(Object.entries(o).filter(([k]) => k !== "media"));
      return Object.keys(rest).length ? [[p, rest]] : [];
    }),
  );
}

export function previewOf(input: {
  content: string;
  accounts: readonly AccountRow[];
  files: readonly PreviewFile[];
  perPlatform: PlatformFiles[];
  when: PublishWhen;
  options: PostOptions;
}): z.infer<typeof previewShape> {
  return {
    content: input.content,
    accounts: input.accounts.map((a) => ({
      account_id: a.id,
      platform: a.platform,
      username: a.username,
    })),
    media: input.files.map(({ url, type, format, size_bytes }) => ({
      url,
      type,
      format,
      size_bytes,
    })),
    media_per_platform: input.files.length ? input.perPlatform : [],
    publish: { mode: input.when.mode, at: input.when.at?.toISOString() ?? null },
    options: shownOptions(input.options),
  };
}
