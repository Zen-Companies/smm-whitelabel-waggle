import { clockLength } from "./post-rules";
import { platformLabel } from "@/lib/social/platforms";

// "How it fits" (Posts Round 2, approved 25 Nov, option A): whether a photo or video's shape
// (and a video's length) suits each platform it goes to. Pure; tested. Used by the composer's
// tiles and preview, and by createPost, which refuses a platform marked "refused".
//
// Shapes come from Zernio's platform media pages (read 25 Nov):
//   Instagram  docs.zernio.com/platforms/instagram/media: feed 9:16 (0.5625) to 1.91:1, 4:5 best
//              engagement; Stories and Reels 9:16; images outside the feed range must be Stories
//              or Reels; Reel/Story videos 3 s minimum, Story video 60 s max.
//   Facebook   /platforms/facebook/media: no feed shape rule; Reel 9:16 required, 3 to 60 s;
//              Story video up to 120 s.
//   TikTok     /platforms/tiktok/media: 9:16 ("the only format that works well"), video 3 s min.
//   LinkedIn   /platforms/linkedin/media: images 1.91:1, 1:1, 1:1.25; video 1:2.4 to 2.4:1, 3 s min.
//   Pinterest  /platforms/pinterest/media: 2:3 best, 1:1, up to 1:2.1; video 2:3, 1:1 or 9:16, 4 s min.
//   YouTube    /platforms/youtube/media: video 16:9; Shorts 9:16 or 1:1 up to 3 minutes.
//   Google     /platforms/google-business/media: Google crops images; 4:3 survives the crop best.
//   Threads, X, Bluesky: several shapes listed, none refused, so they always fit.

/** Green, honey or red (design: fits as is / posts but trimmed or better in another shape / refused). */
export type FitLevel = "fits" | "trims" | "refused";

/** What the owner can do on a tile: crop for that platform, post it as a Story, or leave it out. */
export type FitFix = "crop" | "story" | "leaveOut";

export interface MediaShape {
  kind: "image" | "video";
  width: number;
  height: number;
  /** A video's length, when the browser could read it. */
  seconds?: number | null;
}

/** How the post shows on that platform (the composer's Post / Story / Reel choice). */
export type PostAs = "post" | "story" | "reel" | undefined;

export interface Fit {
  platform: string;
  level: FitLevel;
  /** One plain sentence: "Fits as is", "Google trims the sides", "Instagram won't take this shape". */
  message: string;
  fixes: FitFix[];
}

export interface CropChoice {
  label: string;
  /** width / height */
  ratio: number;
  best?: boolean;
}

const R = {
  "9:16": 9 / 16,
  "4:5": 4 / 5,
  "1:1": 1,
  "1.91:1": 1.91,
  "16:9": 16 / 9,
  "4:3": 4 / 3,
  "2:3": 2 / 3,
  "1:2.1": 1 / 2.1,
} as const;

/** Ratios within 3% of each other count as the same shape (a 1080x1349 photo is 4:5). */
const TOLERANCE = 0.03;

export function sameShape(ratio: number, target: number): boolean {
  return Math.abs(ratio / target - 1) <= TOLERANCE;
}

/** Inside a range of shapes, with the same small tolerance at both ends. */
function within(ratio: number, min: number, max: number): boolean {
  return ratio >= min * (1 - TOLERANCE) && ratio <= max * (1 + TOLERANCE);
}

export function ratioOf(shape: { width: number; height: number }): number {
  return shape.width / shape.height;
}

/** "3:2 wide", "4:5 tall", "Square", for the photo's line. */
export function shapeLabel(width: number, height: number): string {
  const r = width / height;
  const named: [string, number][] = [
    ["1:1", 1],
    ["4:5", 4 / 5],
    ["2:3", 2 / 3],
    ["3:4", 3 / 4],
    ["9:16", 9 / 16],
    ["3:2", 3 / 2],
    ["4:3", 4 / 3],
    ["16:9", 16 / 9],
    ["1.91:1", 1.91],
    ["1:2", 1 / 2],
    ["1:3", 1 / 3],
    ["2:1", 2],
    ["3:1", 3],
  ];
  const hit = named.find(([, v]) => sameShape(r, v));
  if (hit?.[0] === "1:1") return "Square";
  const name = hit
    ? hit[0]
    : r >= 1
      ? `${(Math.round(r * 100) / 100).toString()}:1`
      : `1:${(Math.round((1 / r) * 100) / 100).toString()}`;
  return `${name} ${r >= 1 ? "wide" : "tall"}`;
}

const STORY_PLATFORMS = new Set(["instagram", "facebook"]);

/** Instagram and Facebook can show a post as a Story instead. */
export const hasStory = (platform: string): boolean => STORY_PLATFORMS.has(platform);

/** Whether the post shows full-screen and tall on this platform (Story, Reel). */
export function isTallFormat(platform: string, as: PostAs): boolean {
  return STORY_PLATFORMS.has(platform) && (as === "story" || as === "reel");
}

/** The crop shapes offered for a platform, its best one first marked. */
export function cropChoicesFor(platform: string, as?: PostAs): CropChoice[] {
  if (isTallFormat(platform, as)) return [{ label: "9:16", ratio: R["9:16"], best: true }];
  switch (platform) {
    case "instagram":
      return [
        { label: "4:5", ratio: R["4:5"], best: true },
        { label: "1:1", ratio: R["1:1"] },
        { label: "9:16", ratio: R["9:16"] },
        { label: "1.91:1", ratio: R["1.91:1"] },
      ];
    case "linkedin":
      return [
        { label: "1.91:1", ratio: R["1.91:1"], best: true },
        { label: "1:1", ratio: R["1:1"] },
        { label: "4:5", ratio: R["4:5"] },
      ];
    case "pinterest":
      return [
        { label: "2:3", ratio: R["2:3"], best: true },
        { label: "1:1", ratio: R["1:1"] },
        { label: "1:2.1", ratio: R["1:2.1"] },
      ];
    case "googlebusiness":
      return [
        { label: "4:3", ratio: R["4:3"], best: true },
        { label: "1:1", ratio: R["1:1"] },
      ];
    case "tiktok":
      return [{ label: "9:16", ratio: R["9:16"], best: true }];
    default:
      return [
        { label: "4:5", ratio: R["4:5"] },
        { label: "1:1", ratio: R["1:1"] },
        { label: "16:9", ratio: R["16:9"] },
      ];
  }
}

/** "One shape for all" (shown with 3 or more platforms): Original, then these. */
export const ONE_SHAPE_CHOICES: CropChoice[] = [
  { label: "4:5", ratio: R["4:5"] },
  { label: "1:1", ratio: R["1:1"] },
  { label: "9:16", ratio: R["9:16"] },
  { label: "16:9", ratio: R["16:9"] },
];

/** The chips show only when the post goes to 3 or more platforms. */
export function showOneShapeForAll(platforms: string[]): boolean {
  return new Set(platforms).size >= 3;
}

/**
 * How a photo or video fits one platform, or null when there's nothing to say about its shape
 * (a platform that doesn't take this kind of file: "Before it goes out" says that already).
 */
export function fitFor(platform: string, shape: MediaShape, as?: PostAs): Fit | null {
  if (!(shape.width > 0 && shape.height > 0)) return null;
  return shape.kind === "image"
    ? imageFit(platform, ratioOf(shape), as)
    : videoFit(platform, shape, as);
}

const fits = (platform: string): Fit => ({
  platform,
  level: "fits",
  message: "Fits as is",
  fixes: [],
});

function imageFit(platform: string, r: number, as: PostAs): Fit | null {
  const name = platformLabel(platform);
  const trims = (message: string): Fit => ({ platform, level: "trims", message, fixes: ["crop"] });
  if (isTallFormat(platform, as)) {
    return sameShape(r, R["9:16"])
      ? fits(platform)
      : trims(`${name} Stories fill the screen at 9:16`);
  }
  switch (platform) {
    case "instagram":
      if (!within(r, R["9:16"], R["1.91:1"])) {
        return {
          platform,
          level: "refused",
          message: "Instagram won't take this shape",
          fixes: ["crop", "story"],
        };
      }
      return sameShape(r, R["4:5"]) || sameShape(r, R["1:1"])
        ? fits(platform)
        : trims("Instagram looks best at 4:5");
    case "googlebusiness":
      if (sameShape(r, R["4:3"])) return fits(platform);
      return trims(r > R["4:3"] ? "Google trims the sides" : "Google trims the top and bottom");
    case "linkedin":
      return [R["1.91:1"], R["1:1"], R["4:5"]].some((t) => sameShape(r, t))
        ? fits(platform)
        : trims("LinkedIn looks best at 1.91:1, 1:1 or 4:5");
    case "pinterest":
      if (r < R["1:2.1"] * (1 - TOLERANCE)) return trims("Pinterest cuts pins taller than 1:2.1");
      return sameShape(r, R["2:3"]) || sameShape(r, R["1:1"]) || sameShape(r, R["1:2.1"])
        ? fits(platform)
        : trims("Pinterest looks best at 2:3");
    case "tiktok":
      return sameShape(r, R["9:16"]) ? fits(platform) : trims("TikTok shows photos best at 9:16");
    case "youtube":
      return null;
    default:
      // Facebook feed, Threads, X, Bluesky and the rest: no shape rule in the docs.
      return fits(platform);
  }
}

function videoFit(platform: string, shape: MediaShape, as: PostAs): Fit | null {
  const r = ratioOf(shape);
  const s = shape.seconds ?? null;
  const tall = sameShape(r, R["9:16"]);
  const refused = (message: string): Fit => ({
    platform,
    level: "refused",
    message,
    fixes: ["leaveOut"],
  });
  const trims = (message: string): Fit => ({ platform, level: "trims", message, fixes: [] });
  const tooShort = (min: number) => s !== null && s < min;
  switch (platform) {
    case "instagram":
      if (tooShort(3)) return refused("Instagram needs a video of 3 seconds or more");
      if (as === "story" && s !== null && s > 60) {
        return refused(`Instagram Stories are up to 60 seconds; this is ${clockLength(s)}`);
      }
      if (!tall) return trims("Instagram shows it at 9:16 with bars; a tall video looks best");
      return {
        ...fits(platform),
        message: as === "story" ? "Fits as is" : "Instagram posts it as a Reel",
      };
    case "facebook":
      if (as === "reel") {
        if (s !== null && s > 60) {
          return refused(`Facebook Reels are up to 60 seconds; this is ${clockLength(s)}`);
        }
        if (tooShort(3)) return refused("Facebook Reels need 3 seconds or more");
        if (!tall) return refused("Facebook Reels need a tall 9:16 video");
        return fits(platform);
      }
      if (as === "story") {
        if (s !== null && s > 120) {
          return refused(`Facebook Stories are up to 2 minutes; this is ${clockLength(s)}`);
        }
        return tall ? fits(platform) : trims("Facebook Stories fill the screen at 9:16");
      }
      return fits(platform);
    case "tiktok":
      if (!tall) return refused("TikTok needs a tall 9:16 video");
      if (tooShort(3)) return refused("TikTok needs a video of 3 seconds or more");
      return fits(platform);
    case "youtube": {
      const shortShape = tall || sameShape(r, 1);
      if (shortShape && (s === null || s <= 180)) {
        return { ...fits(platform), message: "YouTube posts it as a Short" };
      }
      if (shortShape)
        return trims("Over 3 minutes, so YouTube posts it as a normal video, with bars");
      return sameShape(r, R["16:9"])
        ? fits(platform)
        : trims("YouTube shows videos at 16:9, with bars");
    }
    case "linkedin":
      if (!within(r, 1 / 2.4, 2.4)) return refused("LinkedIn won't take this shape of video");
      if (tooShort(3)) return refused("LinkedIn needs a video of 3 seconds or more");
      return fits(platform);
    case "pinterest":
      if (tooShort(4)) return refused("Pinterest needs a video of 4 seconds or more");
      return [R["2:3"], R["1:1"], R["9:16"]].some((t) => sameShape(r, t))
        ? fits(platform)
        : trims("Pinterest shows videos best at 2:3, 1:1 or 9:16");
    case "googlebusiness":
      return null;
    default:
      return fits(platform);
  }
}

/**
 * The part of a photo a crop keeps: the largest `ratio` box that fits, made smaller by `zoom`
 * (1 = as large as possible), centred on (cx, cy) in the photo's pixels and kept inside it.
 */
export function cropRect(
  width: number,
  height: number,
  ratio: number,
  zoom = 1,
  cx = width / 2,
  cy = height / 2,
): { x: number; y: number; w: number; h: number } {
  const z = Math.max(1, zoom);
  let w = width;
  let h = w / ratio;
  if (h > height) {
    h = height;
    w = h * ratio;
  }
  w /= z;
  h /= z;
  const x = Math.min(Math.max(cx - w / 2, 0), width - w);
  const y = Math.min(Math.max(cy - h / 2, 0), height - h);
  return { x, y, w, h };
}

/** The size the cropped file is saved at: the crop's own pixels, never upscaled, at most `max` a side. */
export function outputSize(w: number, h: number, max = 2400): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

/**
 * What each platform's file is: its own crop when the owner made one, else the shared file.
 * (Two accounts on one platform share it.)
 */
export function shapeFor(
  platform: string,
  shared: MediaShape | null,
  crops: Partial<Record<string, { width: number; height: number }>>,
): MediaShape | null {
  const crop = crops[platform];
  if (crop && shared?.kind === "image")
    return { kind: "image", width: crop.width, height: crop.height };
  return shared;
}

/** A refused platform, as the server says it (createPost's problems). */
export function refusedMessage(fit: Fit): string {
  if (fit.fixes.includes("crop")) {
    return `${fit.message}. Crop it for ${platformLabel(fit.platform)}${fit.fixes.includes("story") ? " or post it as a Story" : ""}.`;
  }
  return `${fit.message}. Leave ${platformLabel(fit.platform)} out or pick another video.`;
}
