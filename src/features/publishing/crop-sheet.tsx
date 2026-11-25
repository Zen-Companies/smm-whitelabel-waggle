"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { cropRect, outputSize, type CropChoice } from "./media-fit";

/** A crop the owner made: the file to upload, a local link for the tiles, and its size. */
export interface MadeCrop {
  file: File;
  url: string;
  width: number;
  height: number;
  label: string;
  ratio: number;
  /** Where it was, so Change opens it there again. */
  zoom: number;
  cx: number;
  cy: number;
}

const ZOOM_MAX = 4;

/** Draws the kept part on a canvas at its own size (never upscaled) and saves it. */
function exportCrop(
  img: HTMLImageElement,
  rect: { x: number; y: number; w: number; h: number },
  type: "image/jpeg" | "image/png",
): Promise<{ blob: Blob; width: number; height: number } | null> {
  const { width, height } = outputSize(rect.w, rect.h);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.resolve(null);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, rect.x, rect.y, rect.w, rect.h, 0, 0, width, height);
  return new Promise((resolve) => {
    try {
      canvas.toBlob(
        (blob) => resolve(blob ? { blob, width, height } : null),
        type,
        type === "image/jpeg" ? 0.92 : undefined,
      );
    } catch {
      // A photo from another site the browser won't let us read back.
      resolve(null);
    }
  });
}

/**
 * Crop for <Platform> (Posts Round 2, approved 25 Nov): opens in place over the composer. Drag to
 * move, pinch or scroll to zoom (or the Zoom slider), the platform's shapes as chips, Cancel /
 * Use this crop. The crop is made here in the browser; nothing changes until Use this crop.
 */
export function CropSheet({
  title,
  note,
  src,
  width,
  height,
  mime,
  choices,
  start,
  onCancel,
  onUse,
}: {
  title: string;
  note: string;
  src: string;
  width: number;
  height: number;
  /** The photo's type: a PNG stays PNG, the rest become JPEG (what every platform takes). */
  mime: string | null;
  choices: CropChoice[];
  start?: { ratio: number; zoom?: number; cx?: number; cy?: number };
  onCancel: () => void;
  onUse: (crop: MadeCrop) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const img = useRef<HTMLImageElement>(null);
  const [ratio, setRatio] = useState(start?.ratio ?? choices[0]?.ratio ?? 1);
  const [zoom, setZoom] = useState(start?.zoom ?? 1);
  const [centre, setCentre] = useState({ x: start?.cx ?? width / 2, y: start?.cy ?? height / 2 });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; zoom: number } | null>(null);
  const rect = cropRect(width, height, ratio, zoom, centre.x, centre.y);
  // Kept inside the photo, so dragging past an edge doesn't pile up.
  const settle = (z: number, cx: number, cy: number) => {
    const r = cropRect(width, height, ratio, z, cx, cy);
    setZoom(Math.min(ZOOM_MAX, Math.max(1, z)));
    setCentre({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
  };

  useEffect(() => {
    box.current?.focus();
  }, []);

  // Scroll to zoom: a native listener, so the page doesn't scroll too.
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setZoom((z) => Math.min(ZOOM_MAX, Math.max(1, z * Math.exp(-e.deltaY * 0.0015))));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const sourcePerPixel = () => rect.w / (frame.current?.clientWidth || 1);

  async function use() {
    const el = img.current;
    if (!el?.complete || !el.naturalWidth) return;
    setSaving(true);
    setError(null);
    const type = mime === "image/png" ? "image/png" : "image/jpeg";
    const out = await exportCrop(el, rect, type);
    setSaving(false);
    if (!out) {
      setError("This photo can't be cropped here. Add it from this device to crop it.");
      return;
    }
    const label = choices.find((c) => c.ratio === ratio)?.label ?? "";
    const file = new File(
      [out.blob],
      `crop-${label.replace(/[^0-9a-z]+/gi, "x")}.${type === "image/png" ? "png" : "jpg"}`,
      {
        type,
      },
    );
    onUse({
      file,
      url: URL.createObjectURL(out.blob),
      width: out.width,
      height: out.height,
      label,
      ratio,
      zoom,
      cx: rect.x + rect.w / 2,
      cy: rect.y + rect.h / 2,
    });
  }

  const tall = ratio < 1;
  return createPortal(
    <>
      <div aria-hidden className="bg-ink/30 fixed inset-0 z-[80]" onClick={onCancel} />
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-labelledby="crop-title"
        tabIndex={-1}
        onKeyDown={(e) => {
          // Escape closes the crop only, not the composer under it.
          if (e.key === "Escape") {
            e.stopPropagation();
            onCancel();
            return;
          }
          const step = rect.w * 0.05;
          const moves: Record<string, [number, number]> = {
            ArrowLeft: [-step, 0],
            ArrowRight: [step, 0],
            ArrowUp: [0, -step],
            ArrowDown: [0, step],
          };
          const move = moves[e.key];
          if (move && e.target === frame.current) {
            e.preventDefault();
            settle(zoom, centre.x + move[0], centre.y + move[1]);
          }
        }}
        className="bg-surface border-line text-ink fixed inset-x-0 bottom-0 z-[90] flex max-h-[92dvh] flex-col gap-3 overflow-y-auto rounded-t-[24px] border px-[18px] pt-3 pb-[max(18px,env(safe-area-inset-bottom))] shadow-[0_12px_32px_rgba(23,20,15,0.14)] outline-none sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:w-[calc(100%-32px)] sm:max-w-[440px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[20px] sm:p-5"
      >
        <span aria-hidden className="bg-line-strong mx-auto h-[5px] w-10 rounded-full sm:hidden" />
        <h2 id="crop-title" className="section-title">
          {title}
        </h2>
        <div
          ref={frame}
          tabIndex={0}
          role="img"
          aria-label={`The part of the photo kept. Drag or use the arrow keys to move it.`}
          className="bg-ink relative mx-auto touch-none overflow-hidden rounded-xl select-none focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{
            aspectRatio: String(ratio),
            width: tall ? `min(100%, calc(52dvh * ${ratio}))` : "100%",
            cursor: "grab",
          }}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (pointers.current.size === 2) {
              const [a, b] = [...pointers.current.values()];
              pinch.current = { distance: Math.hypot(a.x - b.x, a.y - b.y), zoom };
            }
          }}
          onPointerMove={(e) => {
            const last = pointers.current.get(e.pointerId);
            if (!last) return;
            pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (pointers.current.size === 2 && pinch.current) {
              const [a, b] = [...pointers.current.values()];
              const d = Math.hypot(a.x - b.x, a.y - b.y);
              settle((pinch.current.zoom * d) / (pinch.current.distance || 1), centre.x, centre.y);
              return;
            }
            const k = sourcePerPixel();
            settle(zoom, centre.x - (e.clientX - last.x) * k, centre.y - (e.clientY - last.y) * k);
          }}
          onPointerUp={(e) => {
            pointers.current.delete(e.pointerId);
            if (pointers.current.size < 2) pinch.current = null;
          }}
          onPointerCancel={(e) => {
            pointers.current.delete(e.pointerId);
            pinch.current = null;
          }}
        >
          {/* The whole photo, placed so the kept part fills the frame. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={img}
            src={src}
            alt=""
            draggable={false}
            crossOrigin={src.startsWith("blob:") ? undefined : "anonymous"}
            className="pointer-events-none absolute max-w-none"
            style={{
              width: `${(width / rect.w) * 100}%`,
              height: `${(height / rect.h) * 100}%`,
              left: `${(-rect.x / rect.w) * 100}%`,
              top: `${(-rect.y / rect.h) * 100}%`,
            }}
          />
        </div>
        <p className="meta text-center">Drag to move · pinch or scroll to zoom</p>
        <label className="flex items-center gap-3 text-sm">
          <span className="shrink-0 font-medium">Zoom</span>
          <input
            type="range"
            min={1}
            max={ZOOM_MAX}
            step={0.01}
            value={zoom}
            onChange={(e) => settle(Number(e.target.value), centre.x, centre.y)}
            className="accent-honey w-full"
          />
        </label>
        {choices.length > 1 && (
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Shape">
            {choices.map((c) => {
              const on = c.ratio === ratio;
              return (
                <button
                  key={c.label}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => {
                    setRatio(c.ratio);
                    setZoom(1);
                  }}
                  className={cn(
                    "inline-flex min-h-9 items-center rounded-full border px-3 text-xs font-semibold",
                    on
                      ? "border-honey bg-honey-tint text-ink border-[1.5px]"
                      : "border-line-strong bg-surface text-ink-2 hover:bg-subtle",
                  )}
                >
                  {c.label}
                  {c.best ? " · best" : ""}
                </button>
              );
            })}
          </div>
        )}
        {error && (
          <p role="alert" className="text-danger text-sm">
            {error}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" variant="primary" onClick={() => void use()} disabled={saving}>
            {saving ? "Cropping…" : "Use this crop"}
          </Button>
        </div>
        <p className="meta">{note}</p>
      </div>
    </>,
    document.body,
  );
}
