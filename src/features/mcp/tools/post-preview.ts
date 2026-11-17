// Pure pieces of the two-step posting tools (preview_post, create_post): when a post goes out,
// and which media problems block it. No database, no Zernio.

import type { PostOptions } from "@/features/publishing";
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

/** One platform's choices, as the assistant sends them in preview_post. */
export interface ToolPostOption {
  platform: string;
  post_type?: "post" | "story" | "reel";
  first_comment?: string;
  title?: string;
  pinterest_board_id?: string;
  caption?: string;
}

const POST_TYPES = new Set(["instagram", "facebook"]);
const FIRST_COMMENT = new Set(["instagram", "facebook", "youtube", "threads", "linkedin"]);
const TITLES = new Set(["youtube", "facebook"]);

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
  }
  return out;
}

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
    };
    if (Object.keys(v).length) out[p] = v;
  }
  if (extra.youtubeTitle && !out.youtube?.title) {
    out.youtube = { ...(out.youtube ?? {}), title: extra.youtubeTitle };
  }
  return out;
}
