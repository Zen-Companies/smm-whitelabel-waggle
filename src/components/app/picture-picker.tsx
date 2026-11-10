"use client";

import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "cn";

export type PictureActionState = { error?: string; saved?: number };

const BOX = 220;
const OUT = 512;
/** Bigger originals are fine: the browser crops them to a 512 px square before upload. */
const ORIGINAL_MAX = 10 * 1024 * 1024;

/**
 * Pick, crop and save a square picture (T57, design OrgPictures). The crop opens in place on
 * the card, not in a pop-up; errors show under the button. `shape` only changes how it's shown:
 * organizations are rounded squares, brands circles.
 */
export function PicturePicker({
  action,
  fields,
  currentUrl,
  initials,
  shape,
  canRemove,
}: {
  action: (formData: FormData) => Promise<PictureActionState>;
  fields: Record<string, string>;
  currentUrl: string | null;
  initials: string;
  shape: "square" | "circle";
  canRemove: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const round = shape === "circle" ? "rounded-full" : "rounded-2xl";

  const pick = (file: File | undefined) => {
    setError(null);
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setError("Only PNG or JPG pictures.");
      return;
    }
    if (file.size > ORIGINAL_MAX) {
      setError(`That file is ${Math.round(file.size / 1024 / 1024)} MB. Pick one under 10 MB.`);
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setImage(img);
      setSrc(url);
      setZoom(1);
    };
    img.onerror = () => setError("Couldn't read that picture. Try another one.");
    img.src = url;
  };

  const send = (fd: FormData) =>
    startTransition(async () => {
      for (const [k, v] of Object.entries(fields)) fd.set(k, v);
      const result = await action(fd);
      if (result.error) setError(result.error);
      else {
        setImage(null);
        if (src) URL.revokeObjectURL(src);
        setSrc(null);
      }
    });

  const save = () => {
    if (!image) return;
    const canvas = document.createElement("canvas");
    canvas.width = OUT;
    canvas.height = OUT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const scale = Math.max(OUT / image.width, OUT / image.height) * zoom;
    const w = image.width * scale;
    const h = image.height * scale;
    ctx.drawImage(image, (OUT - w) / 2, (OUT - h) / 2, w, h);
    canvas.toBlob((blob) => {
      if (!blob) return setError("Couldn't read that picture. Try another one.");
      const fd = new FormData();
      fd.set("picture", new File([blob], "picture.png", { type: "image/png" }));
      send(fd);
    }, "image/png");
  };

  if (image && src) {
    const scale = Math.max(BOX / image.width, BOX / image.height) * zoom;
    return (
      <div className="flex flex-col gap-3">
        <div
          className="relative flex h-[240px] items-center justify-center overflow-hidden rounded-xl"
          style={{
            background:
              "repeating-conic-gradient(var(--subtle) 0% 25%, var(--surface) 0% 50%) 0 0 / 16px 16px",
          }}
        >
          <div
            className={cn("relative overflow-hidden", round)}
            style={{ width: BOX, height: BOX, boxShadow: "0 0 0 999px rgba(24,24,27,.45)" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- a local preview, not a page image */}
            <img
              src={src}
              alt="Crop preview"
              className="absolute top-1/2 left-1/2 max-w-none"
              style={{
                width: image.width * scale,
                height: image.height * scale,
                transform: "translate(-50%, -50%)",
              }}
            />
          </div>
        </div>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Zoom
          <input
            type="range"
            min={1}
            max={3}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="accent-[var(--ink)]"
          />
        </label>
        {error && (
          <p role="alert" className="text-danger text-sm">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <Button
            type="button"
            variant="primary"
            onClick={save}
            disabled={pending}
            data-busy={pending || undefined}
          >
            {pending ? "Saving…" : "Save picture"}
          </Button>
          <Button
            type="button"
            variant="quiet"
            onClick={() => {
              setImage(null);
              setSrc(null);
            }}
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4">
      {currentUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- our own storage, already 512 px
        <img src={currentUrl} alt="" className={cn("size-[72px] shrink-0 object-cover", round)} />
      ) : (
        <span
          aria-hidden
          className={cn(
            "bg-subtle text-ink-2 inline-flex size-[72px] shrink-0 items-center justify-center text-xl font-bold",
            round,
          )}
        >
          {initials}
        </span>
      )}
      <div className="flex flex-col gap-2">
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            pick(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => input.current?.click()}
            disabled={pending}
          >
            {currentUrl ? "Change picture" : "Upload picture"}
          </Button>
          {currentUrl && canRemove && (
            <Button
              type="button"
              variant="quiet"
              disabled={pending}
              onClick={() => {
                const fd = new FormData();
                fd.set("remove", "1");
                send(fd);
              }}
            >
              Remove
            </Button>
          )}
        </div>
        {error ? (
          <p role="alert" className="text-danger text-sm">
            {error}
          </p>
        ) : (
          <span className="meta">
            {currentUrl
              ? "PNG or JPG, cropped to a square."
              : "Until then, the initials of the name are shown."}
          </span>
        )}
      </div>
    </div>
  );
}
