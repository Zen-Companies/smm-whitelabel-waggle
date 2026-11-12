/**
 * The composer's overall cap (Instagram and TikTok captions allow 2,200). Each platform's own,
 * often lower, limit is in src/lib/social/platforms.ts.
 */
export const POST_TEXT_MAX = 2200;
export const POST_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const POST_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/**
 * Videos go from the browser straight to Zernio's storage (presigned PUT, CORS open), never
 * through our server, so this is our own cap, well under Zernio's 5 GB. Platforms are stricter
 * per length (src/lib/social/platforms.ts) and Zernio compresses where it can.
 */
export const POST_VIDEO_MAX_BYTES = 1024 * 1024 * 1024;
export const POST_VIDEO_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-m4v",
] as const;
/** The file extension Zernio reads the media type from. */
export const VIDEO_EXT: Record<(typeof POST_VIDEO_TYPES)[number], string> = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "video/x-m4v": "m4v",
};
/** YouTube's title limit; without one Zernio uses the caption's first line. */
export const YOUTUBE_TITLE_MAX = 100;
