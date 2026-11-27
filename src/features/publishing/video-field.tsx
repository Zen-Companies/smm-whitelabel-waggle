"use client";

import { prepareVideoUpload } from "./actions";
import { videoProblem } from "./video";

/** What the browser could read about a video: its length and size in pixels (null when it can't). */
export type VideoMeta = { seconds: number | null; width: number | null; height: number | null };

const mb = (bytes: number) =>
  bytes >= 1024 ** 3
    ? `${(bytes / 1024 ** 3).toFixed(1)} GB`
    : `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`;

/**
 * A video's length and shape, read by the browser from its metadata (Posts Round 2: "How it
 * fits" checks both). `src` is a file's object URL or a public link.
 */
export function readVideoMeta(src: string): Promise<VideoMeta> {
  return new Promise((resolve) => {
    const el = document.createElement("video");
    el.preload = "metadata";
    el.muted = true;
    el.onloadedmetadata = () =>
      resolve({
        seconds: Number.isFinite(el.duration) ? el.duration : null,
        width: el.videoWidth || null,
        height: el.videoHeight || null,
      });
    el.onerror = () => resolve({ seconds: null, width: null, height: null });
    el.src = src;
  });
}

async function readFileMeta(file: File): Promise<VideoMeta> {
  const url = URL.createObjectURL(file);
  try {
    return await readVideoMeta(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** PUT to the presigned link with progress (fetch can't report upload progress). */
function put(url: string, file: File, onProgress: (pct: number) => void): Promise<boolean> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300);
    xhr.onerror = () => resolve(false);
    xhr.send(file);
  });
}

/**
 * Uploads one video straight to Zernio's storage with progress (design v3 "Composer: video and
 * board"; Posts Round 4: one of a post's files). The form only carries the finished link, its
 * length and its size in pixels. `current` says whether the result is still wanted (a removed
 * file stops reporting).
 */
export async function uploadVideoFile(
  file: File,
  onProgress: (pct: number) => void,
  current: () => boolean,
): Promise<({ url: string } & VideoMeta) | { error: string }> {
  const problem = videoProblem(file);
  if (problem) return { error: problem };
  const meta = await readFileMeta(file);
  const link = await prepareVideoUpload({ type: file.type, size: file.size });
  if ("error" in link) return { error: link.error };
  if (!current()) return { error: "" };
  const ok = await put(link.uploadUrl, file, (pct) => {
    if (current()) onProgress(pct);
  });
  return ok
    ? { url: link.publicUrl, ...meta }
    : { error: "The video couldn't be uploaded. Try again." };
}

/** "24 MB" for a video's line. */
export const videoMb = mb;
