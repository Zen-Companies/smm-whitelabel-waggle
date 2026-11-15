"use client";

import { useState } from "react";
import { PlatformMark } from "@/components/app/platform-mark";
import { platformLabel } from "@/lib/social/platforms";
import { cn } from "cn";
import { initials, previewShape, previewText, textBelow } from "./preview";

/**
 * Preview (design "5 · Posts: composer with preview", T74a): roughly how the post looks in each
 * picked feed, one tab per platform. Nothing leaves the browser.
 */
export function PostPreview({
  platforms,
  brandName,
  text,
  photoUrl,
  hasVideo,
}: {
  platforms: string[];
  brandName: string;
  text: string;
  photoUrl: string | null;
  hasVideo: boolean;
}) {
  const [tab, setTab] = useState<string | null>(null);
  if (!platforms.length || (!text.trim() && !photoUrl && !hasVideo)) return null;
  const current = tab && platforms.includes(tab) ? tab : platforms[0];
  const shape = previewShape(current);
  const { shown, more } = previewText(current, text);
  const media = photoUrl ? (
    // A local preview of the picked file (blob: or our own media link).
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={photoUrl}
      alt=""
      className={cn(
        "bg-subtle w-full object-cover",
        shape === "square" && "aspect-square",
        shape === "tall" && "aspect-[2/3]",
        shape === "natural" && "max-h-64 object-contain",
      )}
    />
  ) : hasVideo ? (
    <div
      className={cn(
        "bg-ink text-surface flex w-full items-center justify-center text-sm",
        shape === "tall" ? "aspect-[9/16] max-h-80" : "aspect-video",
      )}
    >
      Video
    </div>
  ) : null;
  const words = shown ? (
    <p className="px-3 py-2 text-[13px] whitespace-pre-wrap">
      {textBelow(current) && <b className="font-semibold">{brandName} </b>}
      {shown}
      {more && <span className="text-ink-3"> more</span>}
    </p>
  ) : null;

  return (
    <section aria-labelledby="preview-heading" className="flex flex-col gap-2">
      <h3 id="preview-heading" className="text-sm font-medium">
        Preview
      </h3>
      {platforms.length > 1 && (
        <div className="segmented self-start" role="tablist" aria-label="Preview on">
          {platforms.map((p) => (
            <button
              key={p}
              type="button"
              role="tab"
              aria-selected={p === current}
              data-active={p === current || undefined}
              onClick={() => setTab(p)}
            >
              {platformLabel(p)}
            </button>
          ))}
        </div>
      )}
      <div className="border-line bg-surface overflow-hidden rounded-xl border">
        <div className="flex items-center gap-2 px-3 py-2">
          <span className="bg-ink text-honey inline-flex size-7 items-center justify-center rounded-full text-[11px] font-bold">
            {initials(brandName)}
          </span>
          <span className="flex-1 truncate text-[13px] font-semibold">{brandName}</span>
          <PlatformMark platform={current} size={18} />
        </div>
        {textBelow(current) ? (
          <>
            {media}
            {words}
          </>
        ) : (
          <>
            {words}
            {media}
          </>
        )}
      </div>
      <p className="meta">
        Roughly how it looks. Each app trims long text with &ldquo;more&rdquo;.
      </p>
    </section>
  );
}
