"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { platformLabel } from "@/lib/social/platforms";

// "10 of 14 · Choose" (Posts Round 5, Round 4 leftover): when a platform takes fewer photos than
// the post has (Facebook: 10), the owner picks which go there. Opens in place under "How it
// fits"; tap a photo to take it in or out. The other platforms still get every photo.

export function PhotoChooser({
  platform,
  photos,
  chosen,
  max,
  onDone,
  onCancel,
}: {
  platform: string;
  /** The post's photos that platform could take: their place in the post and a preview. */
  photos: { index: number; src: string | null }[];
  /** The places going there now. */
  chosen: number[];
  max: number;
  onDone: (indices: number[]) => void;
  onCancel: () => void;
}) {
  const [picked, setPicked] = useState<number[]>(chosen);
  const full = picked.length >= max;
  const name = platformLabel(platform);
  return (
    <section
      aria-label={`Choose the photos for ${name}`}
      className="border-line bg-surface flex flex-col gap-3 rounded-2xl border p-3.5"
    >
      <div className="flex flex-wrap items-baseline gap-2">
        <h3 className="text-sm font-semibold">Choose the photos for {name}</h3>
        <span className="meta tabular-nums">
          {picked.length} of {max} picked
        </span>
      </div>
      <p className="text-ink-2 text-[13px]">
        {name} takes up to {max}. Tap a photo to take it out, then tap another to put it in.
      </p>
      <ul className="grid grid-cols-4 gap-2 sm:grid-cols-5">
        {photos.map((p) => {
          const on = picked.includes(p.index);
          return (
            <li key={p.index}>
              <button
                type="button"
                aria-pressed={on}
                aria-label={`Photo ${p.index + 1}${on ? ", goes" : ""}`}
                disabled={!on && full}
                onClick={() =>
                  setPicked((list) =>
                    on ? list.filter((i) => i !== p.index) : [...list, p.index].slice(0, max),
                  )
                }
                className={cn(
                  "relative block aspect-square w-full overflow-hidden rounded-lg border-2 disabled:cursor-not-allowed",
                  on ? "border-honey" : "border-transparent opacity-50",
                )}
              >
                {p.src ? (
                  // eslint-disable-next-line @next/next/no-img-element -- a local or uploaded photo
                  <img src={p.src} alt="" className="size-full object-cover" />
                ) : (
                  <span className="bg-subtle block size-full" />
                )}
                <span
                  aria-hidden
                  className={cn(
                    "absolute top-1 right-1 flex size-5 items-center justify-center rounded-full text-[10px] font-bold",
                    on ? "bg-honey text-ink" : "bg-surface/90 text-ink-3 border",
                  )}
                >
                  {on ? <Check className="size-3" strokeWidth={3} /> : p.index + 1}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {full && picked.length < photos.length && (
        <p className="meta">That&apos;s {max}. Take one out to swap it for another.</p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="primary"
          disabled={!picked.length}
          onClick={() => onDone([...picked].sort((a, b) => a - b))}
        >
          Use these {picked.length}
        </Button>
        <Button type="button" variant="quiet" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </section>
  );
}
