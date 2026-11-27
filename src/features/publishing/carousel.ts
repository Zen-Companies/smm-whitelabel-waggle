import { platformLabel, platformOf } from "@/lib/social/platforms";
import type { PostAs } from "./media-fit";

// Carousels (Posts Round 4, approved 26 Nov): a post carries up to 20 photos and videos; each
// platform gets the part it takes, trimmed with a note (never blocked unless nothing fits). Pure;
// tested. Used by the composer's "How it fits" tiles and previews, and by createPost, which sends
// each trimmed set as that platform's `customMedia`.
//
// Limits from Zernio's platform media pages (read 26 Nov):
//   Instagram  /platforms/instagram/media: up to 20, photos and videos mixed.
//   Facebook   /platforms/facebook/media: feed 10 photos, 1 video; photos and videos don't mix
//              (the posts page says 20; kept at 10 until Zernio confirms).
//   TikTok     /platforms/tiktok/media: one video or up to 35 photos, never both.
//   LinkedIn   /platforms/linkedin/media: up to 20 photos, or 1 video; no mixing.
//   X          /platforms/twitter/media: up to 20 photos, or 1 GIF, or 1 video.
//   Threads    20, or 10 when a video is in. Bluesky: 4 photos, or 1 video.
//   Pinterest  1. Google Business /platforms/google-business/media: 1 photo, no video.
//   YouTube    one video.

/** The most a post carries ("N of 20"): the most any platform takes. */
export const CAROUSEL_MAX = 20;

export interface CarouselRules {
  /** Photos in one post. */
  photos: number;
  /** Videos in one post. */
  videos: number;
  /** Photos and videos together in one post. */
  mix: boolean;
  /** The most files when a video is in (Threads: 10). */
  mixedMax?: number;
}

const RULES: Partial<Record<string, CarouselRules>> = {
  instagram: { photos: 20, videos: 20, mix: true },
  threads: { photos: 20, videos: 20, mix: true, mixedMax: 10 },
  telegram: { photos: 10, videos: 10, mix: true },
  facebook: { photos: 10, videos: 1, mix: false },
  linkedin: { photos: 20, videos: 1, mix: false },
  tiktok: { photos: 35, videos: 1, mix: false },
  twitter: { photos: 20, videos: 1, mix: false },
  bluesky: { photos: 4, videos: 1, mix: false },
  googlebusiness: { photos: 1, videos: 0, mix: false },
  pinterest: { photos: 1, videos: 1, mix: false },
  youtube: { photos: 0, videos: 1, mix: false },
};

/** A platform's carousel rules; unknown ones follow their photo limit, one video, no mixing. */
export function carouselRules(platform: string): CarouselRules {
  const known = RULES[platform];
  if (known) {
    // Photos follow the platform table (src/lib/social/platforms.ts) when it's stricter.
    const max = platformOf(platform)?.post?.maxImages;
    return typeof max === "number" ? { ...known, photos: Math.min(known.photos, max) } : known;
  }
  return { photos: platformOf(platform)?.post?.maxImages ?? 1, videos: 1, mix: false };
}

export interface PlatformSet {
  platform: string;
  /** Which files go there, by their place in the post (the first is the cover). */
  indices: number[];
  /** What was left out and why, in plain words (shown on the tile); null when all go. */
  note: string | null;
  /** Nothing in the post can go there (shown in "Before it goes out"); null otherwise. */
  blocked: string | null;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Round 5 ("10 of 14 · Choose"): the files the owner chose for a platform that takes fewer than
 * the post has, by place; the rest of `max` filled in post order. Without a valid choice, the
 * first `max`. Always in post order.
 */
export function chooseFrom(
  pool: readonly number[],
  max: number,
  pick?: readonly number[],
): number[] {
  const chosen = pool.filter((i) => pick?.includes(i)).slice(0, max);
  if (!chosen.length) return pool.slice(0, max);
  for (const i of pool) {
    if (chosen.length >= max) break;
    if (!chosen.includes(i)) chosen.push(i);
  }
  return chosen.sort((a, b) => a - b);
}

/**
 * The part of a post's files one platform takes. `kinds` is each file's kind in order; `as` is how
 * it shows (a Story or Reel takes one file); `pick` the files the owner chose when it takes fewer
 * than the post has (Round 5, Facebook's "Choose").
 */
export function platformSet(
  platform: string,
  kinds: readonly ("image" | "video")[],
  as?: PostAs,
  pick?: readonly number[],
): PlatformSet {
  const picked = (pool: readonly number[], max: number) =>
    !!pick?.length && pool.length > max && pool.some((i) => pick.includes(i));
  const name = platformLabel(platform);
  const all = kinds.map((_, i) => i);
  const photos = all.filter((i) => kinds[i] === "image");
  const videos = all.filter((i) => kinds[i] === "video");
  const out = (indices: number[], note: string | null = null): PlatformSet => ({
    platform,
    indices,
    note,
    blocked: null,
  });
  const block = (blocked: string): PlatformSet => ({ platform, indices: [], note: null, blocked });
  const r = carouselRules(platform);

  if (kinds.length === 0) return out([]);

  // Google takes one photo and no video.
  if (r.videos === 0 && videos.length) {
    if (!photos.length) {
      return block(`${name} doesn't take videos. Add a photo, or leave ${name} out.`);
    }
    if (kinds.length === 1) return out(photos);
    return out(
      [photos[0]],
      r.photos === 1
        ? `${name}: first photo only. The other ${plural(kinds.length - 1, "file")} stay off ${name}`
        : `${name} doesn't take videos: the photos go`,
    );
  }
  if (kinds.length === 1) return out(all);

  // A Story or a Reel is one file.
  if ((platform === "instagram" || platform === "facebook") && (as === "story" || as === "reel")) {
    const what = as === "story" ? "A Story" : "A Reel";
    const first = as === "reel" ? (videos[0] ?? all[0]) : all[0];
    return out(
      [first],
      `${what} takes one ${as === "reel" ? "video" : "photo or video"}: the first one goes`,
    );
  }

  // YouTube: one video, no photos.
  if (r.photos === 0) {
    if (!videos.length) return out([]);
    return videos.length === 1 && !photos.length
      ? out(videos)
      : out([videos[0]], `${name} takes one video: the first video goes`);
  }

  // Pinterest: one file, the first.
  if (platform === "pinterest") return out([all[0]], `${name}: first one only`);

  // Photos and videos together where the platform can't mix them.
  if (photos.length && videos.length && !r.mix) {
    const kept = chooseFrom(photos, r.photos, pick);
    const left = videos.length === 1 ? "The video is left out" : "The videos are left out";
    const capped = photos.length > r.photos ? `; the first ${r.photos} photos go` : "";
    if (platform === "tiktok") {
      return out(kept, `${name}: photos only in a carousel. ${left}${capped}`);
    }
    if (r.photos === 1) {
      return out(kept, `${name}: first photo only. ${left}`);
    }
    const goes =
      photos.length > r.photos
        ? picked(photos, r.photos)
          ? `the ${r.photos} photos you chose go`
          : `the first ${r.photos} photos go`
        : kept.length === 1
          ? "the photo goes"
          : `the ${kept.length} photos go`;
    return out(
      kept,
      `${name} can't mix photos and ${videos.length === 1 ? "a video" : "videos"}: ${goes}`,
    );
  }

  // Only videos.
  if (!photos.length) {
    if (videos.length <= r.videos) return out(videos);
    if (platform === "tiktok") {
      return block(
        `${name} takes one video or photos, not several videos. Keep one video, or leave ${name} out.`,
      );
    }
    if (r.videos === 1) return out([videos[0]], `${name} takes one video: the first one goes`);
    return out(
      videos.slice(0, r.videos),
      `${name} takes up to ${r.videos} videos: the first ${r.videos} go`,
    );
  }

  // Mixed where allowed, or only photos.
  const max = videos.length && r.mix ? Math.min(r.mixedMax ?? r.photos, r.photos) : r.photos;
  const pool = r.mix ? all : photos;
  if (pool.length <= max) return out(pool);
  if (max === 1)
    return out(
      [pool[0]],
      `${name}: first photo only. The other ${plural(pool.length - 1, "photo")} stay off ${name}`,
    );
  const unit = r.mix && videos.length ? "files" : "photos";
  return out(
    chooseFrom(pool, max, pick),
    `${name} takes up to ${max} ${unit}${videos.length && r.mixedMax ? " with a video" : ""}: ${picked(pool, max) ? `the ${max} you chose go` : `the first ${max} go`}`,
  );
}

/** "5 photos, swipe", "12 photos and 1 video" for a tile or the counter. */
export function setLabel(kinds: readonly ("image" | "video")[]): string {
  const p = kinds.filter((k) => k === "image").length;
  const v = kinds.length - p;
  const parts = [p ? plural(p, "photo") : null, v ? plural(v, "video") : null].filter(Boolean);
  return parts.join(" and ");
}

/** Moves one file to a new place (drag to reorder). */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= list.length) return [...list];
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, item);
  return next;
}

/** One file of a post as the server keeps it. */
export interface PostFile {
  url: string;
  type?: string | null;
  width?: number | null;
  height?: number | null;
  seconds?: number | null;
  altText?: string | null;
}

/** A file in one platform's own set: `from` is its place in the post's files. */
export type PlatformFile = PostFile & { from: number };

export const fileKind = (f: { type?: string | null }): "image" | "video" =>
  f.type === "video" ? "video" : "image";

/**
 * One platform's own files: its trimmed set, with its crops (by place in the post) in place of
 * the originals. `files` is null when the platform gets the post's files exactly as they are, so
 * nothing extra is sent.
 */
export function platformFiles(
  platform: string,
  media: readonly PostFile[],
  crops: Partial<Record<number, { url: string; width: number; height: number }>> | undefined,
  as?: PostAs,
  pick?: readonly number[],
): { set: PlatformSet; files: PlatformFile[] | null } {
  const set = platformSet(platform, media.map(fileKind), as, pick);
  const files = set.indices.map((i): PlatformFile => {
    const crop = media[i].type !== "video" ? crops?.[i] : undefined;
    return crop
      ? { url: crop.url, type: "image", width: crop.width, height: crop.height, from: i }
      : { ...media[i], from: i };
  });
  const same =
    files.length === media.length && files.every((f, i) => f.from === i && f.url === media[i].url);
  return { set, files: same || set.blocked ? null : files };
}
