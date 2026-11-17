"use client";

import { useRef, useState, useTransition } from "react";
import { BeeBody } from "@/components/app/bee";
import { BeeCarrying, BeeDance } from "@/components/app/bee-setup";
import { Button } from "@/components/ui/button";
import {
  finishAddPhotos,
  presignAddPhoto,
  removeAddedPhoto,
  saveAddedPhoto,
} from "./add-photos-actions";
import { ADD_PHOTOS_MAX } from "./add-photos";

export interface AddedFile {
  url: string;
  type: "image" | "video";
  name: string;
  size: number;
}

type Row = AddedFile & { progress: number | null; error?: string };

const mb = (n: number) =>
  n >= 1024 * 1024
    ? `${(n / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(n / 1024))} KB`;

/** PUTs one file to the presigned URL, reporting progress (fetch can't). */
function put(url: string, file: File, onProgress: (p: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.upload.onprogress = (e) =>
      e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(String(xhr.status)));
    xhr.onerror = () => reject(new Error("network"));
    xhr.send(file);
  });
}

/**
 * "Add photos for your post" (design "AI assistants · Add photos from a chat", approved 17 Nov):
 * choose or drop files, each goes straight to storage with its progress; Done tells the owner to
 * go back to the chat. The bee carries the file while it uploads and dances once when done.
 */
export function AddPhotosForm({
  uploadId,
  initial,
  assistant,
}: {
  uploadId: string;
  initial: AddedFile[];
  assistant: string;
}) {
  const [rows, setRows] = useState<Row[]>(initial.map((f) => ({ ...f, progress: null })));
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [finishing, startFinish] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const uploading = rows.some((r) => r.progress !== null && !r.error);
  const added = rows.filter((r) => r.progress === null && !r.error);

  async function addFiles(list: FileList | null) {
    if (!list) return;
    setError(null);
    const room = ADD_PHOTOS_MAX - rows.filter((r) => !r.error).length;
    const files = [...list].slice(0, Math.max(0, room));
    if (list.length > files.length) setError(`At most ${ADD_PHOTOS_MAX} photos or videos.`);
    for (const file of files) {
      const key = `pending:${file.name}:${file.size}:${Math.random()}`;
      const kind = file.type.startsWith("video/") ? "video" : "image";
      setRows((r) => [
        ...r,
        { url: key, type: kind, name: file.name, size: file.size, progress: 0 },
      ]);
      const update = (patch: Partial<Row>) =>
        setRows((r) => r.map((x) => (x.url === key ? { ...x, ...patch } : x)));
      const signed = await presignAddPhoto(uploadId, {
        name: file.name,
        type: file.type,
        size: file.size,
      });
      if ("error" in signed) {
        update({ error: signed.error });
        continue;
      }
      try {
        await put(signed.uploadUrl, file, (p) => update({ progress: p }));
      } catch {
        update({ error: "The upload didn't finish. Try again." });
        continue;
      }
      const saved = await saveAddedPhoto(uploadId, {
        url: signed.publicUrl,
        name: file.name,
        type: file.type,
        size: file.size,
      });
      if ("error" in saved) update({ error: saved.error });
      else update({ url: signed.publicUrl, progress: null });
    }
    if (input.current) input.current.value = "";
  }

  async function remove(row: Row) {
    if (row.error || row.url.startsWith("pending:")) {
      setRows((r) => r.filter((x) => x !== row));
      return;
    }
    const r = await removeAddedPhoto(uploadId, row.url);
    if ("error" in r) setError(r.error);
    else setRows((all) => all.filter((x) => x.url !== row.url));
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <BeeDance scale={0.8} />
        <h2 className="font-display text-[24px] font-semibold">Added</h2>
        <p className="text-ink-2 max-w-[320px]">
          Go back to {assistant} and say <b>done</b>. It will show you the post before anything goes
          out.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <label
        className="border-line-strong bg-surface hover:bg-subtle flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-4 py-6 text-center"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void addFiles(e.dataTransfer.files);
        }}
      >
        {uploading ? (
          <BeeCarrying className="max-w-full" />
        ) : (
          <span aria-hidden className="bee-bob inline-block">
            <svg width="30" height="20" viewBox="0 0 24 16">
              <BeeBody />
            </svg>
          </span>
        )}
        <b>Choose photos or videos</b>
        <span className="meta">Or drop them here. Up to {ADD_PHOTOS_MAX}.</span>
        <span className="bg-honey text-ink rounded-md px-4 py-2 text-sm font-semibold">
          Choose files
        </span>
        <input
          ref={input}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm,video/x-m4v"
          className="sr-only"
          onChange={(e) => void addFiles(e.target.files)}
        />
      </label>

      {rows.length > 0 && (
        <ul className="flex flex-col gap-2" aria-live="polite">
          {rows.map((r) => (
            <li
              key={r.url}
              className="border-line bg-surface flex items-center gap-3 rounded-xl border p-2"
            >
              {r.type === "image" && !r.url.startsWith("pending:") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={r.url} alt="" className="h-11 w-14 shrink-0 rounded-md object-cover" />
              ) : (
                <span className="bg-honey-tint text-honey-text flex h-11 w-14 shrink-0 items-center justify-center rounded-md text-xs font-semibold">
                  {r.type === "video" ? "Video" : "Photo"}
                </span>
              )}
              <span className="flex min-w-0 flex-1 flex-col">
                <b className="truncate text-sm font-semibold">{r.name}</b>
                <span className={r.error ? "text-danger text-xs" : "meta"}>
                  {r.error ??
                    `${r.type === "video" ? "Video" : "Photo"} · ${mb(r.size)}${r.progress !== null ? ` · uploading ${r.progress}%` : ""}`}
                </span>
              </span>
              {r.progress === null && !r.error && (
                <span className="bg-success-soft text-success rounded-full px-2 py-0.5 text-xs font-semibold">
                  ✓ Added
                </span>
              )}
              {(r.progress === null || r.error) && (
                <button
                  type="button"
                  onClick={() => void remove(r)}
                  className="text-ink-3 hover:text-ink min-h-9 min-w-9 rounded-md"
                  aria-label={`Remove ${r.name}`}
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <span className="meta">
        Each platform has its own size limits; {assistant} tells you if one is too big when it shows
        you the post.
      </span>
      {error && (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      )}
      <div className="flex justify-end">
        <Button
          variant="primary"
          disabled={uploading || added.length === 0 || finishing}
          data-busy={finishing || undefined}
          onClick={() =>
            startFinish(async () => {
              const r = await finishAddPhotos(uploadId);
              if ("error" in r) setError(r.error);
              else setDone(true);
            })
          }
        >
          {finishing ? "Saving…" : "Done"}
        </Button>
      </div>
    </div>
  );
}
