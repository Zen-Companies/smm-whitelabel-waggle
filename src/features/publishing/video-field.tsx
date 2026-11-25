"use client";

import { useEffect, useRef } from "react";
import { Film } from "lucide-react";
import { prepareVideoUpload } from "./actions";
import { POST_VIDEO_TYPES } from "./limits";
import { clockLength } from "./post-rules";
import { videoProblem } from "./video";

/** What the browser could read about a video: its length and size in pixels (null when it can't). */
export type VideoMeta = { seconds: number | null; width: number | null; height: number | null };

export type VideoState =
  | { step: "none" }
  | ({ step: "uploading"; name: string; size: number; progress: number } & VideoMeta)
  | ({ step: "ready"; name: string; size: number; url: string } & VideoMeta)
  | { step: "error"; message: string };

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
 * Add a video (design v3 "Composer: video and board"): uploads straight to Zernio's storage with
 * a progress bar; the form only carries the finished video's URL and length.
 */
export function VideoField({
  video,
  onChange,
  disabled,
  pickRef,
}: {
  video: VideoState;
  onChange: (v: VideoState) => void;
  disabled?: boolean;
  /** Lets the drop zone hand over a dropped video file. */
  pickRef?: { current: ((file: File) => void) | null };
}) {
  const input = useRef<HTMLInputElement>(null);
  // A newer pick (or Remove) cancels what an older upload reports.
  const run = useRef(0);

  async function pick(file: File) {
    const id = ++run.current;
    const problem = videoProblem(file);
    if (problem) return onChange({ step: "error", message: problem });
    const meta = await readFileMeta(file);
    const base = { name: file.name, size: file.size, ...meta };
    onChange({ step: "uploading", ...base, progress: 0 });
    const link = await prepareVideoUpload({ type: file.type, size: file.size });
    if (id !== run.current) return;
    if ("error" in link) return onChange({ step: "error", message: link.error });
    const ok = await put(link.uploadUrl, file, (progress) => {
      if (id === run.current) onChange({ step: "uploading", ...base, progress });
    });
    if (id !== run.current) return;
    onChange(
      ok
        ? { step: "ready", ...base, url: link.publicUrl }
        : { step: "error", message: "The video couldn't be uploaded. Try again." },
    );
  }

  const remove = () => {
    run.current += 1;
    if (input.current) input.current.value = "";
    onChange({ step: "none" });
  };

  useEffect(() => {
    if (!pickRef) return;
    pickRef.current = (file) => void pick(file);
    return () => {
      pickRef.current = null;
    };
  });

  const busy = video.step === "uploading" || video.step === "ready";
  return (
    <>
      {/* Always mounted, so Replace and a fresh pick reuse the same input. */}
      <input
        ref={input}
        id="post-video"
        type="file"
        accept={POST_VIDEO_TYPES.join(",")}
        disabled={disabled}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void pick(file);
        }}
        className="sr-only"
      />
      {busy ? (
        // The drop zone becomes the video (Posts media, approved 16 Nov).
        <div className="border-line bg-surface flex w-full items-center gap-3 rounded-2xl border p-2.5">
          <span className="bg-ink flex size-[72px] shrink-0 items-center justify-center rounded-xl text-sm text-white">
            ▶
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <b className="truncate text-sm font-semibold">{video.name}</b>
            {video.step === "uploading" ? (
              <>
                <span className="text-ink-3 text-xs" role="status">
                  Uploading · {video.progress}% ·{" "}
                  {mb(Math.round((video.size * video.progress) / 100))} of {mb(video.size)}
                </span>
                <span
                  className="bg-subtle h-1.5 overflow-hidden rounded-full"
                  role="progressbar"
                  aria-label="Uploading video"
                  aria-valuenow={video.progress}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <span className="bg-honey block h-full" style={{ width: `${video.progress}%` }} />
                </span>
              </>
            ) : (
              <span className="text-ink-3 text-xs">
                Video{video.seconds ? ` · ${clockLength(video.seconds)}` : ""}
                {video.size ? ` · ${mb(video.size)}` : ""}
              </span>
            )}
          </span>
          {video.step === "ready" && (
            <label htmlFor="post-video" className="action-link cursor-pointer text-[13px]">
              Replace
            </label>
          )}
          <button type="button" onClick={remove} className="action-link text-danger text-[13px]">
            {video.step === "uploading" ? "Cancel" : "Remove"}
          </button>
        </div>
      ) : (
        <label
          htmlFor="post-video"
          className="border-line-strong bg-surface hover:bg-subtle inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border px-3.5 text-sm font-semibold has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50"
        >
          <Film className="size-[18px]" strokeWidth={1.8} aria-hidden />
          Video
        </label>
      )}
      {video.step === "uploading" && (
        <span className="meta w-full">
          Schedule stays off until the upload finishes. Keep this page open; a large video can take
          a minute.
        </span>
      )}
      {video.step === "error" && (
        <p role="alert" className="text-danger w-full text-sm">
          {video.message}
        </p>
      )}
      {video.step === "ready" && <input type="hidden" name="video" value={video.url} />}
      {video.step === "ready" && video.seconds && (
        <input type="hidden" name="videoSeconds" value={String(video.seconds)} />
      )}
    </>
  );
}
