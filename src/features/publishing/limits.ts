/**
 * The composer's overall cap (Instagram and TikTok captions allow 2,200). Each platform's own,
 * often lower, limit is in src/lib/social/platforms.ts.
 */
export const POST_TEXT_MAX = 2200;
export const POST_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const POST_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
