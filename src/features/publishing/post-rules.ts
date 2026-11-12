import { platformLabel, platformOf } from "@/lib/social/platforms";

export interface DraftShape {
  textLength: number;
  images: number;
  videos: number;
}

export type RuleCheck =
  | { platform: string; level: "ok" }
  | { platform: string; level: "note"; message: string }
  | { platform: string; level: "blocked"; message: string };

/**
 * "Before it goes out" (design v3 "Platforms · post composer"): what each ticked platform will do
 * with this post. blocked = it can't go there as it is; note = it goes, with a change to know.
 * Hints only: Zernio's validate call is the final check before saving.
 */
export function checkPlatform(platform: string, draft: DraftShape): RuleCheck {
  const name = platformLabel(platform);
  const rules = platformOf(platform)?.post;
  if (!rules) return { platform, level: "blocked", message: `${name} can't take posts.` };
  const media = draft.images + draft.videos;
  if (rules.videoOnly && draft.videos === 0) {
    return { platform, level: "blocked", message: `${name} needs a video.` };
  }
  if (rules.mediaRequired && media === 0) {
    return { platform, level: "blocked", message: `${name} needs a photo or video.` };
  }
  if (draft.images > 0 && rules.maxImages === 0) {
    return { platform, level: "blocked", message: `${name} doesn't take photos.` };
  }
  if (draft.textLength > rules.textMax) {
    return {
      platform,
      level: "blocked",
      message: `${name}: ${rules.textMax.toLocaleString("en-US")} characters max. Shorten the text by ${(draft.textLength - rules.textMax).toLocaleString("en-US")}.`,
    };
  }
  if (draft.images > rules.maxImages) {
    return rules.extraImagesDropped
      ? { platform, level: "note", message: rules.note ?? `${name}: only the first photo.` }
      : {
          platform,
          level: "blocked",
          message: `${name}: up to ${rules.maxImages} photo${rules.maxImages === 1 ? "" : "s"}.`,
        };
  }
  if (rules.note) return { platform, level: "note", message: rules.note };
  return { platform, level: "ok" };
}

/** The smallest text limit among the ticked platforms (the composer's counter). */
export function textLimitFor(platforms: string[], fallback: number): number {
  const limits = platforms
    .map((p) => platformOf(p)?.post?.textMax)
    .filter((n): n is number => typeof n === "number");
  return limits.length ? Math.min(...limits) : fallback;
}

/** Image size limit for an upload going to all of these platforms (the strictest). */
export function imageMaxBytesFor(platforms: string[], fallback: number): number {
  const limits = platforms
    .map((p) => platformOf(p)?.post?.imageMaxBytes)
    .filter((n): n is number => typeof n === "number");
  return limits.length ? Math.min(fallback, ...limits) : fallback;
}

/** TikTok asks for the owner's consent on every post. */
export const needsConsent = (platforms: string[]): boolean =>
  platforms.some((p) => platformOf(p)?.post?.consentRequired === true);
