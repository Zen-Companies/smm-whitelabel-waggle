import type { ComposeInitial } from "./compose-form";
import { parsePostOptions, type PostOptions } from "./post-options";
import { wallClockIn } from "./post-time";
import type { StoredMedia } from "./publish";

// Edit and Duplicate (Posts Round 3) open the big window filled in from a saved post. Pure.

export interface StartRow {
  id: string;
  content: string;
  media: unknown;
  target_account_ids: string[];
  platform_options: unknown;
  scheduled_for: string | null;
}

/**
 * The composer's starting point from a post: its text, file, accounts, choices and crops, and for
 * an edit its time (in the viewer's zone). A duplicate gets no time. The YouTube title and the
 * Pinterest board come back out of the options (the composer has its own field; the board is
 * set on the server).
 */
export function startFrom(
  row: StartRow,
  mode: "edit" | "duplicate",
  timeZone: string,
): ComposeInitial {
  const all = parsePostOptions(row.platform_options);
  const options: PostOptions = {};
  const crops: ComposeInitial["crops"] = {};
  for (const [platform, o] of Object.entries(all)) {
    if (!o) continue;
    const { media, ...rest } = o;
    const crop = media?.[0];
    if (crop?.width && crop.height)
      crops[platform] = { url: crop.url, width: crop.width, height: crop.height };
    const kept = Object.fromEntries(
      Object.entries(rest).filter(
        ([k]) =>
          !(platform === "youtube" && k === "title") &&
          !(platform === "pinterest" && k === "boardId"),
      ),
    );
    if (Object.keys(kept).length) options[platform] = kept;
  }
  const first = ((row.media as StoredMedia[] | null) ?? []).find((m) => m.url);
  const video =
    first?.type === "video" || (!!first?.url && /\.(mp4|mov|webm|m4v)(\?|$)/i.test(first.url));
  return {
    postId: row.id,
    text: row.content,
    media: first?.url
      ? {
          url: first.url,
          kind: video ? "video" : "image",
          width: first.width ?? null,
          height: first.height ?? null,
          seconds: first.seconds ?? null,
        }
      : null,
    accountIds: row.target_account_ids,
    options,
    crops,
    youtubeTitle: all.youtube?.title ?? "",
    when: mode === "edit" && row.scheduled_for ? wallClockIn(row.scheduled_for, timeZone) : null,
  };
}
