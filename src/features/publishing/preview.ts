// The composer's preview (T74a, design "5 · Posts: composer with preview"): roughly what the post
// looks like in each feed. Pure; tested. Cut-offs are approximate (each app changes them).

import { isTallFormat, sameShape, type MediaShape, type PostAs } from "./media-fit";

/** About how much text each feed shows before "more". */
const VISIBLE: Record<string, number> = {
  instagram: 125,
  facebook: 480,
  linkedin: 210,
  tiktok: 100,
  threads: 500,
  pinterest: 100,
  youtube: 100,
  googlebusiness: 250,
  bluesky: 300,
};

/**
 * The frame a platform shows the photo or video in (Posts Round 2: the real shape, not a square
 * for everyone). `ratio` is width / height, null when the file's size isn't known yet (then the
 * file shows as it is); `fit` says whether the platform trims it (cover) or shows bars (contain).
 * Shapes from Zernio's platform media pages (see media-fit.ts).
 */
export interface PreviewFrame {
  ratio: number | null;
  fit: "cover" | "contain";
  /** Story / Reel / TikTok / Short: full-screen and tall. */
  tall: boolean;
}

const TALL = 9 / 16;

export function previewFrame(platform: string, as: PostAs, media: MediaShape | null): PreviewFrame {
  const r = media && media.width > 0 && media.height > 0 ? media.width / media.height : null;
  const tallFrame = (): PreviewFrame => ({
    ratio: TALL,
    fit: r !== null && sameShape(r, TALL) ? "cover" : "contain",
    tall: true,
  });
  const video = media?.kind === "video";
  if (isTallFormat(platform, as) || platform === "tiktok") return tallFrame();
  if (platform === "instagram" && video) return tallFrame();
  if (platform === "youtube" && video && r !== null) {
    const shortShape = sameShape(r, TALL) || sameShape(r, 1);
    if (shortShape && (media.seconds == null || media.seconds <= 180)) return tallFrame();
    return { ratio: 16 / 9, fit: sameShape(r, 16 / 9) ? "cover" : "contain", tall: false };
  }
  if (r === null) return { ratio: null, fit: "contain", tall: false };
  if (video) return { ratio: r, fit: "cover", tall: false };
  switch (platform) {
    case "instagram":
      return { ratio: Math.min(Math.max(r, TALL), 1.91), fit: "cover", tall: false };
    case "googlebusiness":
      return { ratio: 4 / 3, fit: "cover", tall: false };
    case "pinterest":
      return { ratio: Math.max(r, 1 / 2.1), fit: "cover", tall: false };
    default:
      return { ratio: r, fit: "cover", tall: false };
  }
}

/** Whether the text sits under the picture (Instagram, Pinterest, TikTok) or above it. */
export function textBelow(platform: string): boolean {
  return ["instagram", "pinterest", "tiktok"].includes(platform);
}

/** The text as the feed shows it before "more": cut at a word, with whether there's more. */
export function previewText(platform: string, text: string): { shown: string; more: boolean } {
  const max = VISIBLE[platform] ?? 280;
  const clean = text.trim();
  if (clean.length <= max) return { shown: clean, more: false };
  const cut = clean.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return { shown: `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`, more: true };
}

/** "CH" from "Coastal Home Team". */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return (
    words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? "?").slice(0, 2)
  ).toUpperCase();
}
