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
  const files = ((row.media as StoredMedia[] | null) ?? []).flatMap((m) =>
    m.url
      ? [
          {
            url: m.url,
            kind:
              m.type === "video" || /\.(mp4|mov|webm|m4v)(\?|$)/i.test(m.url)
                ? ("video" as const)
                : ("image" as const),
            width: m.width ?? null,
            height: m.height ?? null,
            seconds: m.seconds ?? null,
          },
        ]
      : [],
  );
  const options: PostOptions = {};
  const crops: ComposeInitial["crops"] = {};
  for (const [platform, o] of Object.entries(all)) {
    if (!o) continue;
    const { media, ...rest } = o;
    // Round 4: a platform's own set holds its crops by the photo's place (`from`); an older row
    // has one crop of the only photo. Files that are the post's own aren't crops.
    for (const [i, m] of (media ?? []).entries()) {
      const from = m.from ?? (media?.length === 1 ? 0 : i);
      const original = files[from];
      if (!original || original.kind !== "image" || original.url === m.url) continue;
      if (!m.width || !m.height) continue;
      crops[platform] = {
        ...crops[platform],
        [from]: { url: m.url, width: m.width, height: m.height },
      };
    }
    const kept = Object.fromEntries(
      Object.entries(rest).filter(
        ([k]) =>
          !(platform === "youtube" && k === "title") &&
          !(platform === "pinterest" && k === "boardId"),
      ),
    );
    if (Object.keys(kept).length) options[platform] = kept;
  }
  return {
    postId: row.id,
    text: row.content,
    media: files,
    accountIds: row.target_account_ids,
    options,
    crops,
    youtubeTitle: all.youtube?.title ?? "",
    when: mode === "edit" && row.scheduled_for ? wallClockIn(row.scheduled_for, timeZone) : null,
  };
}
