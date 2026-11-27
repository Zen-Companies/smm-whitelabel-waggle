// Pure pieces of the two-step posting tools (preview_post, create_post): when a post goes out,
// and which media problems block it. No database, no Zernio.

import {
  platformSet,
  type GoogleButton,
  type GoogleOptions,
  type PostOptions,
} from "@/features/publishing";
import { platformLabel } from "@/lib/social/platforms";
import type { MediaCheck } from "@/lib/social/types";

export const PREVIEW_TTL_MS = 30 * 60_000;
/** An upload link works for 30 minutes; its files can be used in a preview for a day. */
export const UPLOAD_TTL_MS = 30 * 60_000;
export const UPLOAD_USABLE_MS = 24 * 60 * 60_000;
export const MIN_AHEAD_MS = 5 * 60_000;
/** The furthest ahead a post may be scheduled from an assistant. */
export const MAX_AHEAD_MS = 365 * 86_400_000;

export type PublishWhen =
  { mode: "now"; at: null } | { mode: "queue"; at: null } | { mode: "at"; at: Date };

/**
 * Pure: "now", "queue" (the brand's next free posting time) or an ISO date-time with its
 * timezone offset, checked against `now`. Errors say exactly what to send instead.
 */
export function parsePublishWhen(raw: string, now: Date): PublishWhen | { error: string } {
  const v = raw.trim();
  if (v === "now") return { mode: "now", at: null };
  if (v === "queue") return { mode: "queue", at: null };
  const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
  const example = "2026-11-21T09:00:00-06:00";
  if (!iso.test(v)) {
    return {
      error: `publish_at must be "now", "queue" or a full date and time with its timezone offset, like ${example} (not "today 11:30am"). Ask the owner their timezone if you don't know it.`,
    };
  }
  const at = new Date(v);
  if (Number.isNaN(at.getTime())) return { error: `publish_at isn't a real date: ${v}.` };
  if (at.getTime() < now.getTime() + MIN_AHEAD_MS) {
    return {
      error: `publish_at is in the past or less than 5 minutes ahead (it's ${now.toISOString()} now). Use "now" or a later time.`,
    };
  }
  if (at.getTime() > now.getTime() + MAX_AHEAD_MS) {
    return { error: "publish_at is more than a year ahead." };
  }
  return { mode: "at", at };
}

/**
 * Pure: the problems with one checked media link for the chosen platforms, in words the
 * assistant can pass on. Empty when it can be used.
 */
export function mediaProblems(index: number, check: MediaCheck, platforms: string[]): string[] {
  const n = `media[${index}]`;
  if (!check.valid) {
    switch (check.code) {
      case "MEDIA_URL_NOT_ALLOWED":
        return [`${n}: not a public https link.`];
      case "MEDIA_URL_UNREACHABLE":
        return [
          `${n}: couldn't download the file (${check.error ?? "unreachable"}). Use a direct link to the file, or a Google Drive link shared as "Anyone with the link". Dropbox, OneDrive and iCloud links open a web page and don't work.`,
        ];
      case "MEDIA_UNDECODABLE":
        return [`${n}: the file isn't a photo or video Waggle can post.`];
      default:
        return [`${n}: ${check.error ?? "can't be used."}`];
    }
  }
  if (check.type === "document") return [`${n}: only photos and videos can be posted here.`];
  const problems: string[] = [];
  for (const p of platforms) {
    const limit = check.platformLimits[p];
    if (limit && !limit.withinLimit) {
      problems.push(`${n}: too big for ${p} (limit ${limit.limitFormatted}).`);
    }
  }
  return problems;
}

/** Google Business: an Update, an Offer or an Event, and a button (Posts Round 4). */
export interface ToolGoogle {
  kind: "update" | "offer" | "event";
  title?: string;
  start_day?: string;
  start_time?: string;
  end_day?: string;
  end_time?: string;
  coupon_code?: string;
  redeem_url?: string;
  terms?: string;
  button?: ToolGoogleButton;
  button_url?: string;
}

export const TOOL_GOOGLE_BUTTONS = [
  "book",
  "order",
  "shop",
  "learn_more",
  "sign_up",
  "call_now",
] as const;
export type ToolGoogleButton = (typeof TOOL_GOOGLE_BUTTONS)[number];

const GOOGLE_BUTTON: Record<ToolGoogleButton, GoogleButton> = {
  book: "BOOK",
  order: "ORDER",
  shop: "SHOP",
  learn_more: "LEARN_MORE",
  sign_up: "SIGN_UP",
  call_now: "CALL",
};

/** One platform's choices, as the assistant sends them in preview_post. */
export interface ToolPostOption {
  platform: string;
  post_type?: "post" | "story" | "reel";
  first_comment?: string;
  title?: string;
  pinterest_board_id?: string;
  caption?: string;
  ai_label?: boolean;
  /** YouTube: who can see the video. */
  visibility?: "public" | "unlisted" | "private";
  /** YouTube: made for kids. */
  made_for_kids?: boolean;
  google?: ToolGoogle;
}

const POST_TYPES = new Set(["instagram", "facebook"]);
const FIRST_COMMENT = new Set(["instagram", "facebook", "youtube", "threads", "linkedin"]);
const TITLES = new Set(["youtube", "facebook"]);
const AI_LABEL = new Set(["instagram", "youtube"]);

/** Pure: choices that don't fit the chosen platforms, said so the assistant can fix them. */
export function optionProblems(options: ToolPostOption[], platforms: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const o of options) {
    const p = o.platform.trim().toLowerCase();
    if (seen.has(p)) out.push(`options: ${p} is listed twice.`);
    seen.add(p);
    if (!platforms.includes(p)) {
      out.push(`options: ${p} isn't one of the accounts in account_ids (${platforms.join(", ")}).`);
      continue;
    }
    if (o.post_type && !POST_TYPES.has(p))
      out.push(`options: post_type is for Instagram and Facebook, not ${p}.`);
    if (o.first_comment && !FIRST_COMMENT.has(p)) out.push(`options: ${p} has no first comment.`);
    if (o.title && !TITLES.has(p))
      out.push(`options: title is for YouTube and Facebook, not ${p}.`);
    if (o.pinterest_board_id && p !== "pinterest")
      out.push("options: pinterest_board_id is for Pinterest only.");
    if (o.ai_label && !AI_LABEL.has(p))
      out.push(`options: ai_label is for Instagram and YouTube, not ${p}.`);
    if ((o.visibility || o.made_for_kids !== undefined) && p !== "youtube")
      out.push("options: visibility and made_for_kids are for YouTube only.");
    if (o.google && p !== "googlebusiness")
      out.push("options: google is for Google Business (platform googlebusiness) only.");
    if (o.google?.button === "call_now" && o.google.button_url)
      out.push(
        "options: google.button_url isn't used with call_now (it calls the business phone from Business info).",
      );
  }
  return out;
}

/** Pure: the assistant's Google choices as the composer keeps them. */
export function toGoogleOptions(g: ToolGoogle): GoogleOptions {
  return {
    kind: g.kind,
    ...(g.title ? { title: g.title } : {}),
    ...(g.start_day ? { startDay: g.start_day } : {}),
    ...(g.start_time ? { startTime: g.start_time } : {}),
    ...(g.end_day ? { endDay: g.end_day } : {}),
    ...(g.end_time ? { endTime: g.end_time } : {}),
    ...(g.coupon_code ? { coupon: g.coupon_code } : {}),
    ...(g.redeem_url ? { redeemUrl: g.redeem_url } : {}),
    ...(g.terms ? { terms: g.terms } : {}),
    ...(g.button ? { button: GOOGLE_BUTTON[g.button] } : {}),
    ...(g.button_url ? { buttonUrl: g.button_url } : {}),
  };
}

/** What one platform gets of a post's files (carousels are trimmed per platform). */
export interface PlatformFiles {
  platform: string;
  files: number;
  note: string | null;
}

/**
 * Pure: what each platform takes of the post's files, in the composer's words (Posts Round 4,
 * `platformSet`): a note per platform that gets fewer, and the platforms nothing fits.
 */
export function carouselFit(
  platforms: readonly string[],
  kinds: readonly ("image" | "video")[],
  options: PostOptions,
): { perPlatform: PlatformFiles[]; warnings: string[]; blocked: string[] } {
  const perPlatform: PlatformFiles[] = [];
  const warnings: string[] = [];
  const blocked: string[] = [];
  for (const p of new Set(platforms)) {
    const set = platformSet(p, kinds, options[p]?.as);
    if (set.blocked) {
      blocked.push(set.blocked);
      continue;
    }
    perPlatform.push({ platform: p, files: set.indices.length, note: set.note });
    if (set.note) warnings.push(`${set.note}.`);
  }
  return { perPlatform, warnings, blocked };
}

export const placesOf = (platforms: readonly string[]) => platforms.map(platformLabel).join(", ");

/** Pure: the assistant's choices as the composer's per-platform options (posts.platform_options). */
export function toPostOptions(
  options: ToolPostOption[],
  extra: { youtubeTitle?: string } = {},
): PostOptions {
  const out: PostOptions = {};
  for (const o of options) {
    const p = o.platform.trim().toLowerCase();
    const v = {
      ...(o.caption ? { text: o.caption } : {}),
      ...(o.post_type ? { as: o.post_type } : {}),
      ...(o.first_comment ? { firstComment: o.first_comment } : {}),
      ...(o.title ? { title: o.title } : {}),
      ...(o.pinterest_board_id ? { boardId: o.pinterest_board_id } : {}),
      ...(o.ai_label ? { aiLabel: true } : {}),
      ...(o.visibility ? { visibility: o.visibility } : {}),
      ...(o.made_for_kids !== undefined ? { madeForKids: o.made_for_kids } : {}),
      ...(o.google ? { google: toGoogleOptions(o.google) } : {}),
    };
    if (Object.keys(v).length) out[p] = v;
  }
  if (extra.youtubeTitle && !out.youtube?.title) {
    out.youtube = { ...(out.youtube ?? {}), title: extra.youtubeTitle };
  }
  return out;
}
