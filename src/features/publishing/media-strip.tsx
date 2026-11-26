"use client";

import { Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "cn";
import { CAROUSEL_MAX } from "./carousel";
import { clockLength } from "./post-rules";

/** One file of the post as the strip shows it. */
export interface StripItem {
  key: string;
  kind: "image" | "video";
  /** A link the browser can show for a photo (blob: or our media link). */
  src: string | null;
  name: string;
  status: "uploading" | "ready" | "error";
  progress: number;
  error: string | null;
  seconds: number | null;
}

/** How long a finger rests on a photo before it can be dragged (a plain swipe scrolls). */
const HOLD_MS = 380;

/**
 * The post's photos and videos (Posts Round 4, approved 26 Nov): numbered thumbnails in order,
 * the first is the cover, × removes, + Add adds more, "N of 20". Reorder by dragging; on a phone
 * hold a photo, then drag (a plain swipe scrolls the strip). Alt and an arrow key move the
 * focused one. Tapping a photo opens its crop.
 */
export function MediaStrip({
  items,
  addFor,
  onRemove,
  onMove,
  onTap,
  onDropFiles,
  disabled = false,
}: {
  items: StripItem[];
  /** The id of the file input + Add opens. */
  addFor: string;
  onRemove: (key: string) => void;
  onMove: (from: number, to: number) => void;
  /** Tapping a photo (to crop it). */
  onTap: (index: number) => void;
  onDropFiles: (files: File[]) => void;
  disabled?: boolean;
}) {
  const strip = useRef<HTMLOListElement>(null);
  const [drag, setDragState] = useState<{ from: number; over: number } | null>(null);
  const dragRef = useRef<{ from: number; over: number } | null>(null);
  const setDrag = (next: { from: number; over: number } | null) => {
    dragRef.current = next;
    setDragState(next);
  };
  const press = useRef<{
    x: number;
    y: number;
    index: number;
    touch: boolean;
    moved: boolean;
    timer: ReturnType<typeof setTimeout> | null;
  } | null>(null);
  const [holding, setHolding] = useState(false);
  const full = items.length >= CAROUSEL_MAX;

  // While a photo is being dragged by touch, the strip mustn't scroll (a non-passive listener).
  useEffect(() => {
    const el = strip.current;
    if (!el) return;
    const onTouchMove = (e: TouchEvent) => {
      if (dragRef.current) e.preventDefault();
    };
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => el.removeEventListener("touchmove", onTouchMove);
  }, []);

  const indexAt = (x: number, y: number): number | null => {
    const hit = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-strip-index]");
    return hit ? Number(hit.dataset.stripIndex) : null;
  };
  const end = () => {
    if (press.current?.timer) clearTimeout(press.current.timer);
    press.current = null;
    setHolding(false);
  };

  return (
    <div
      className="flex flex-col gap-2"
      onDragOver={(e) => {
        if (disabled || full) return;
        if ([...e.dataTransfer.types].includes("Files")) e.preventDefault();
      }}
      onDrop={(e) => {
        if (disabled || full || !e.dataTransfer.files?.length) return;
        e.preventDefault();
        onDropFiles([...e.dataTransfer.files]);
      }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium">Photos and videos</span>
        <span className="meta tabular-nums">
          {items.length} of {CAROUSEL_MAX}
        </span>
      </div>
      <ol
        ref={strip}
        aria-label="Photos and videos, in order"
        className="flex [scrollbar-width:thin] gap-2 overflow-x-auto pt-2 pb-1"
      >
        {items.map((item, i) => {
          const dragging = drag?.from === i;
          const lands = drag && drag.over === i && drag.from !== i;
          return (
            <li
              key={item.key}
              data-strip-index={i}
              className={cn(
                "relative shrink-0",
                lands &&
                  (drag.from > i
                    ? "before:bg-honey before:absolute before:inset-y-0 before:-left-1.5 before:w-1 before:rounded-full"
                    : "after:bg-honey after:absolute after:inset-y-0 after:-right-1.5 after:w-1 after:rounded-full"),
              )}
            >
              <button
                type="button"
                disabled={disabled}
                aria-label={`${item.kind === "video" ? "Video" : "Photo"} ${i + 1} of ${items.length}${i === 0 ? ", the cover" : ""}${item.kind === "image" ? ". Tap to crop it" : ""}`}
                aria-describedby="strip-help"
                onContextMenu={(e) => e.preventDefault()}
                onKeyDown={(e) => {
                  if (!e.altKey) return;
                  if (e.key === "ArrowLeft" && i > 0) {
                    e.preventDefault();
                    onMove(i, i - 1);
                  } else if (e.key === "ArrowRight" && i < items.length - 1) {
                    e.preventDefault();
                    onMove(i, i + 1);
                  }
                }}
                onPointerDown={(e) => {
                  if (disabled || e.button !== 0) return;
                  const touch = e.pointerType !== "mouse";
                  press.current = {
                    x: e.clientX,
                    y: e.clientY,
                    index: i,
                    touch,
                    moved: false,
                    timer: touch
                      ? setTimeout(() => {
                          setDrag({ from: i, over: i });
                          setHolding(true);
                        }, HOLD_MS)
                      : null,
                  };
                  if (!touch) e.currentTarget.setPointerCapture(e.pointerId);
                }}
                onPointerMove={(e) => {
                  const p = press.current;
                  if (!p) return;
                  const far = Math.hypot(e.clientX - p.x, e.clientY - p.y);
                  if (!dragRef.current) {
                    if (p.touch) {
                      // Moved before the hold finished: it's a swipe, let the strip scroll.
                      if (far > 8) end();
                      return;
                    }
                    if (far > 5) {
                      p.moved = true;
                      setDrag({ from: p.index, over: p.index });
                    }
                    return;
                  }
                  p.moved = true;
                  const over = indexAt(e.clientX, e.clientY);
                  if (over !== null && over !== dragRef.current.over) {
                    setDrag({ from: dragRef.current.from, over });
                  }
                }}
                onPointerUp={() => {
                  const p = press.current;
                  const d = dragRef.current;
                  if (d && d.from !== d.over) onMove(d.from, d.over);
                  else if (
                    p &&
                    !p.moved &&
                    !d &&
                    item.kind === "image" &&
                    item.status === "ready"
                  ) {
                    onTap(i);
                  }
                  setDrag(null);
                  end();
                }}
                onPointerCancel={() => {
                  setDrag(null);
                  end();
                }}
                className={cn(
                  "border-line bg-subtle relative block size-[76px] touch-pan-x overflow-hidden rounded-xl border select-none [-webkit-touch-callout:none]",
                  dragging && "ring-honey scale-105 opacity-80 ring-2",
                  item.status === "error" && "border-danger-border",
                )}
              >
                {item.kind === "image" && item.src ? (
                  // A local or copied link to the picked photo, for the strip only.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.src}
                    alt=""
                    draggable={false}
                    className="pointer-events-none size-full object-cover"
                  />
                ) : (
                  <span className="bg-ink flex size-full flex-col items-center justify-center gap-0.5 text-xs text-white">
                    ▶
                    {item.seconds ? (
                      <span className="tabular-nums">{clockLength(item.seconds)}</span>
                    ) : null}
                  </span>
                )}
                <span className="bg-ink/75 absolute top-1 left-1 rounded-full px-1.5 text-[10px] leading-4 font-semibold text-white tabular-nums">
                  {i + 1}
                </span>
                {i === 0 && (
                  <span className="bg-honey absolute right-1 bottom-1 rounded-full px-1.5 text-[10px] leading-4 font-semibold text-[#17140F]">
                    Cover
                  </span>
                )}
                {item.status === "uploading" && (
                  <span
                    className="bg-ink/55 absolute inset-0 flex items-end"
                    role="progressbar"
                    aria-label={`Uploading ${item.name}`}
                    aria-valuenow={item.progress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <span className="bg-honey block h-1" style={{ width: `${item.progress}%` }} />
                  </span>
                )}
              </button>
              <button
                type="button"
                aria-label={`Remove ${item.kind === "video" ? "video" : "photo"} ${i + 1}`}
                onClick={() => onRemove(item.key)}
                disabled={disabled}
                className="bg-surface border-line-strong text-ink-2 hover:text-danger absolute -top-2 -right-2 flex size-6 items-center justify-center rounded-full border shadow-sm"
              >
                <X className="size-3.5" strokeWidth={2.25} aria-hidden />
              </button>
            </li>
          );
        })}
        {!full && (
          <li className="shrink-0">
            <label
              htmlFor={addFor}
              className={cn(
                "border-line-strong text-ink-2 hover:bg-subtle flex size-[76px] cursor-pointer flex-col items-center justify-center gap-0.5 rounded-xl border-[1.5px] border-dashed text-xs font-semibold",
                disabled && "pointer-events-none opacity-50",
              )}
            >
              <Plus className="size-5" strokeWidth={1.8} aria-hidden />
              Add
            </label>
          </li>
        )}
      </ol>
      <p id="strip-help" className="meta">
        {holding
          ? "Drag it to its new place."
          : "Drag to change the order (on a phone, hold a photo, then drag). The first one is the cover. Tap a photo to crop it."}
      </p>
      {items
        .filter((it) => it.status === "error" && it.error)
        .map((it) => (
          <p key={`err-${it.key}`} role="alert" className="text-danger text-sm">
            {it.name}: {it.error}
          </p>
        ))}
    </div>
  );
}
