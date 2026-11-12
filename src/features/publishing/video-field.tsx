"use client";

import { useRef } from "react";
import { prepareVideoUpload } from "./actions";
import { POST_VIDEO_TYPES } from "./limits";
import { clockLength } from "./post-rules";
import { videoProblem } from "./video";

export type VideoState =
  | { step: "none" }
  | { step: "uploading"; name: string; size: number; seconds: number | null; progress: number }
  | { step: "ready"; name: string; size: number; seconds: number | null; url: string }
  | { step: "error"; message: string };

const mb = (bytes: number) =>
  bytes >= 1024 ** 3
    ? `${(bytes / 1024 ** 3).toFixed(1)} GB`
    : `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`;

/** The video's length, read by the browser (null if it can't tell). */
function readSeconds(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const el = document.createElement("video");
    const url = URL.createObjectURL(file);
    const done = (value: number | null) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    el.preload = "metadata";
    el.onloadedmetadata = () => done(Number.isFinite(el.duration) ? el.duration : null);
    el.onerror = () => done(null);
    el.src = url;
  });
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
}: {
  video: VideoState;
  onChange: (v: VideoState) => void;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  // A newer pick (or Remove) cancels what an older upload reports.
  const run = useRef(0);

  async function pick(file: File) {
    const id = ++run.current;
    const problem = videoProblem(file);
    if (problem) return onChange({ step: "error", message: problem });
    const seconds = await readSeconds(file);
    const base = { name: file.name, size: file.size, seconds };
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

  return (
    <div className="flex flex-col gap-2">
      {(video.step === "uploading" || video.step === "ready") && (
        <div className="flex w-44 flex-col gap-1.5">
          <span className="bg-ink flex h-24 items-end justify-between rounded-xl px-2.5 py-2 text-xs text-white">
            <span>{video.seconds ? `▶ ${clockLength(video.seconds)}` : "▶ Video"}</span>
            <span>{mb(video.size)}</span>
          </span>
          {video.step === "uploading" ? (
            <>
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
              <span className="text-ink-2 text-xs" role="status">
                Uploading video · {video.progress}%
              </span>
            </>
          ) : (
            <span className="text-ink-2 truncate text-xs">
              {video.name} ·{" "}
              <button type="button" onClick={remove} className="underline">
                Remove
              </button>
            </span>
          )}
        </div>
      )}
      {video.step !== "uploading" && video.step !== "ready" && (
        <label
          htmlFor="post-video"
          className="border-line-strong text-ink-3 hover:bg-subtle flex size-16 shrink-0 cursor-pointer items-center justify-center rounded-md border border-dashed text-center text-xs has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50 has-[:focus-visible]:outline-2"
        >
          Add video
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
        </label>
      )}
      {video.step === "uploading" && (
        <span className="meta">
          Schedule stays off until the upload finishes. Keep this page open; a large video can take
          a minute.
        </span>
      )}
      {video.step === "error" && (
        <p role="alert" className="text-danger text-sm">
          {video.message}
        </p>
      )}
      {video.step === "ready" && <input type="hidden" name="video" value={video.url} />}
      {video.step === "ready" && video.seconds && (
        <input type="hidden" name="videoSeconds" value={String(video.seconds)} />
      )}
    </div>
  );
}
