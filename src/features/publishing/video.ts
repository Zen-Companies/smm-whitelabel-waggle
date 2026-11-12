import { POST_VIDEO_MAX_BYTES, POST_VIDEO_TYPES, VIDEO_EXT } from "./limits";

// T63: videos go from the browser straight to Zernio's storage. The server hands out the upload
// link (presign) and later only accepts a video URL that such an upload could have produced.

export type VideoType = (typeof POST_VIDEO_TYPES)[number];

export const isVideoType = (type: string): type is VideoType =>
  (POST_VIDEO_TYPES as readonly string[]).includes(type);

/** Why a picked file can't be uploaded, or null. Checked in the browser and again on the server. */
export function videoProblem(file: { type: string; size: number }): string | null {
  if (!isVideoType(file.type)) return "Use an MP4, MOV or WebM video.";
  if (file.size <= 0) return "That file is empty.";
  if (file.size > POST_VIDEO_MAX_BYTES) return "Use a video under 1 GB.";
  return null;
}

/** Our own filename, so the extension Zernio reads the type from is always right. */
export const videoFilename = (type: VideoType) => `video.${VIDEO_EXT[type]}`;

/**
 * A video URL the composer may post: Zernio's media host (https), or the mock's own route in a
 * local demo. Anything else (a link someone typed into the form) is refused.
 */
export function isUploadedVideoUrl(url: string, opts: { mock: boolean; appUrl?: string }): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (!/\.(mp4|mov|webm|m4v)$/i.test(u.pathname)) return false;
  if (opts.mock) {
    return !!opts.appUrl && url.startsWith(`${opts.appUrl}/api/mock-media/`);
  }
  return u.protocol === "https:" && u.host === "media.zernio.com";
}
