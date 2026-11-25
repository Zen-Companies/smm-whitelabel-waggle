import { z } from "zod";
import { toMediaItems, type MediaKind } from "@/lib/social/types";

/**
 * What the owner chose for one platform on a post (T75, design "Posts · options"), kept in
 * `posts.platform_options[platform]`. Field names follow Zernio's `platformSpecificData`
 * (SDK types: InstagramPlatformData, FacebookPlatformData, YouTubePlatformData, …).
 */
const optionsSchema = z.object({
  /** Text for this platform only (Zernio `customContent`). */
  text: z.string().optional().catch(undefined),
  /** How it shows: Instagram post/story/reel, Facebook post/story/reel. */
  as: z.enum(["post", "story", "reel"]).optional().catch(undefined),
  firstComment: z.string().trim().max(2200).optional().catch(undefined),
  /** YouTube video title, Facebook Reel title. */
  title: z.string().trim().max(100).optional().catch(undefined),
  visibility: z.enum(["public", "unlisted", "private"]).optional().catch(undefined),
  madeForKids: z.boolean().optional().catch(undefined),
  /** "Made with AI" (YouTube containsSyntheticMedia, Instagram isAiGenerated). */
  aiLabel: z.boolean().optional().catch(undefined),
  playlistId: z.string().optional().catch(undefined),
  shareToFeed: z.boolean().optional().catch(undefined),
  collaborators: z
    .array(z.string())
    .transform((a) =>
      a
        .map((s) => s.trim().replace(/^@/, ""))
        .filter(Boolean)
        .slice(0, 3),
    )
    .optional()
    .catch(undefined),
  trialReel: z.boolean().optional().catch(undefined),
  paidPartnership: z.boolean().optional().catch(undefined),
  /** Facebook: only these countries (up to 25). */
  countries: z
    .array(z.string())
    .transform((a) => a.slice(0, 25))
    .optional()
    .catch(undefined),
  /** Facebook: save as a draft on the Page instead of publishing. */
  fbDraft: z.boolean().optional().catch(undefined),
  /** Pinterest board (T64). */
  boardId: z.string().optional().catch(undefined),
  /**
   * Posts Round 2: this platform's own file (a crop made in the composer), sent as Zernio's
   * `customMedia`, replacing the shared file there only. Set by the server after uploading,
   * never taken from the browser's options (see `withoutMedia`).
   */
  media: z
    .array(
      z.object({
        url: z.string().url(),
        type: z.enum(["image", "video", "gif", "document"]).optional(),
        width: z.number().int().positive().optional(),
        height: z.number().int().positive().optional(),
      }),
    )
    .max(1)
    .optional()
    .catch(undefined),
});

export type PlatformPostOptions = z.infer<typeof optionsSchema>;
export type PostOptions = Partial<Record<string, PlatformPostOptions>>;

const KNOWN = [
  "instagram",
  "facebook",
  "youtube",
  "threads",
  "linkedin",
  "pinterest",
  "tiktok",
  "twitter",
  "bluesky",
  "googlebusiness",
  "telegram",
] as const;

/** `posts.platform_options`, read defensively (free-form JSON in the row). */
export function parsePostOptions(value: unknown): PostOptions {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: PostOptions = {};
  for (const key of KNOWN) {
    const raw = (value as Record<string, unknown>)[key];
    if (!raw || typeof raw !== "object") continue;
    const parsed = optionsSchema.safeParse(raw);
    if (!parsed.success) continue;
    out[key] = Object.fromEntries(
      Object.entries(parsed.data).filter(([, v]) => v !== undefined && v !== ""),
    ) as PlatformPostOptions;
  }
  return out;
}

const FIRST_COMMENT = new Set(["instagram", "facebook", "youtube", "threads", "linkedin"]);

/**
 * A platform's own text, only when it's a real change: empty or the same as the caption means
 * the platform follows the caption (so later caption edits reach it).
 */
export function ownText(o: PlatformPostOptions | undefined, sharedText: string): string | null {
  return o?.text && o.text.trim() && o.text !== sharedText ? o.text : null;
}

/** The text that really goes to this platform: its own text, else the caption. */
export function textFor(platform: string, options: PostOptions, sharedText: string): string {
  return ownText(options[platform], sharedText) ?? sharedText;
}

/**
 * The extra fields for one target in Zernio's createPost: `customContent` and
 * `platformSpecificData`, only with what the platform accepts for this kind of post.
 */
export function targetExtras(
  platform: string,
  o: PlatformPostOptions | undefined,
  sharedText: string,
): {
  customContent?: string;
  customMedia?: { type?: MediaKind; url: string }[];
  platformSpecificData?: Record<string, unknown>;
} {
  if (!o) return {};
  const out: ReturnType<typeof targetExtras> = {};
  const own = ownText(o, sharedText);
  if (own) out.customContent = own;
  // Its own crop (Posts Round 2): docs.zernio.com/guides/media-uploads, "Set `customMedia` on one
  // entry to replace it for that platform".
  if (o.media?.length) {
    out.customMedia = toMediaItems(o.media.map((m) => ({ url: m.url, type: m.type ?? null })));
  }

  const d: Record<string, unknown> = {};
  const story = o.as === "story";
  if (platform === "instagram") {
    if (story) d.contentType = "story";
    if (o.as === "reel") {
      if (o.shareToFeed !== undefined) d.shareToFeed = o.shareToFeed;
      if (o.trialReel) d.trialParams = { graduationStrategy: "MANUAL" };
    }
    if (!story) {
      if (o.collaborators?.length) d.collaborators = o.collaborators;
      if (o.aiLabel) d.isAiGenerated = true;
      if (o.paidPartnership) d.isPaidPartnership = true;
    }
  } else if (platform === "facebook") {
    if (o.as === "story" || o.as === "reel") d.contentType = o.as;
    if (o.as === "reel" && o.title) d.title = o.title;
    if (!story && o.countries?.length) d.geoRestriction = { countries: o.countries };
    if (o.as !== "story" && o.as !== "reel" && o.fbDraft) d.facebookSettings = { draft: true };
  } else if (platform === "youtube") {
    if (o.title) d.title = o.title;
    if (o.visibility) d.visibility = o.visibility;
    if (o.madeForKids !== undefined) d.madeForKids = o.madeForKids;
    if (o.aiLabel) d.containsSyntheticMedia = true;
    if (o.playlistId) d.playlistId = o.playlistId;
  } else if (platform === "pinterest") {
    if (o.boardId) d.boardId = o.boardId;
  }
  if (FIRST_COMMENT.has(platform) && !story && o.firstComment) d.firstComment = o.firstComment;

  if (Object.keys(d).length) out.platformSpecificData = d;
  return out;
}

/** The browser's options without any `media`: only the server sets a platform's own file. */
export function withoutMedia(options: PostOptions): PostOptions {
  return Object.fromEntries(
    Object.entries(options).map(([platform, o]) => [
      platform,
      o && Object.fromEntries(Object.entries(o).filter(([key]) => key !== "media")),
    ]),
  );
}

/**
 * What goes in `posts.platform_options`: the composer's choices, plus the YouTube title field
 * and the board chosen when the post was made (so a later change doesn't move a scheduled pin).
 */
export function postOptionsRow(
  options: PostOptions,
  youtubeTitle: string | undefined,
  pinterestBoardId: string | undefined,
): PostOptions {
  const out: PostOptions = { ...options };
  if (youtubeTitle) out.youtube = { ...out.youtube, title: youtubeTitle };
  if (pinterestBoardId) out.pinterest = { ...out.pinterest, boardId: pinterestBoardId };
  return out;
}
