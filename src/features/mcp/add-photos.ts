// Pure rules of the "Add photos for your post" page. Tested.

export const ADD_PHOTOS_MAX = 10;
/** Upload links handed out per upload (retries and removed files included). */
export const ADD_PHOTOS_ISSUE_MAX = 20;
const IMAGE_MAX = 30 * 1024 * 1024;
const VIDEO_MAX = 1024 * 1024 * 1024;

const IMAGES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};
const VIDEOS: Record<string, string> = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "video/x-m4v": "m4v",
};

/** Pure: whether a file can be added, as what. */
export function fileKind(
  contentType: string,
  size: number,
): { type: "image" | "video"; ext: string } | { error: string } {
  if (IMAGES[contentType]) {
    if (size > IMAGE_MAX) return { error: "Use a photo under 30 MB." };
    return { type: "image", ext: IMAGES[contentType] };
  }
  if (VIDEOS[contentType]) {
    if (size > VIDEO_MAX) return { error: "Use a video under 1 GB." };
    return { type: "video", ext: VIDEOS[contentType] };
  }
  return { error: "Use a JPG, PNG, WebP or GIF photo, or an MP4, MOV or WebM video." };
}

export type UploadState = "open" | "done" | "expired" | "not_yours";

/** Pure: what the page shows for this upload and this person. */
export function uploadState(
  row: { created_by: string; expires_at: string; done_at: string | null },
  userId: string,
  now: Date,
): UploadState {
  if (row.created_by !== userId) return "not_yours";
  if (row.done_at) return "done";
  if (new Date(row.expires_at).getTime() <= now.getTime()) return "expired";
  return "open";
}

/** Pure: a link our presign handed out (Zernio's storage, or the mock route locally). */
export function isOurUploadUrl(url: string, opts: { mock: boolean; appUrl?: string }): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (opts.mock) return !!opts.appUrl && url.startsWith(`${opts.appUrl}/api/mock-media/`);
  return u.protocol === "https:" && u.host === "media.zernio.com";
}
