"use client";

import { useState } from "react";
import { PlatformMark } from "@/components/app/platform-mark";
import { platformLabel } from "@/lib/social/platforms";
import { cn } from "cn";
import type { MediaShape } from "./media-fit";
import { textFor, type PostOptions } from "./post-options";
import { initials, previewFrame, previewText, textBelow, type PreviewFrame } from "./preview";

/** What a platform gets: its own crop when there is one, else the shared photo or video. */
export interface PlatformMedia {
  /** A link the browser can show (blob: or our media link); null for a video. */
  src: string | null;
  shape: MediaShape | null;
}

/**
 * A photo or video drawn in a platform's frame (Posts Round 2): trimmed where the platform trims
 * it, with bars where it shows bars. Tall frames are narrower so they don't fill the panel.
 */
export function MediaFrame({
  frame,
  media,
  tallHeight = 420,
  className,
}: {
  frame: PreviewFrame;
  media: PlatformMedia;
  /** The most a tall frame may be high, in px. */
  tallHeight?: number;
  className?: string;
}) {
  const photo = !!media.src && media.shape?.kind !== "video";
  const style =
    frame.ratio === null
      ? undefined
      : {
          aspectRatio: String(frame.ratio),
          width: frame.ratio < 1 ? `min(100%, ${Math.round(tallHeight * frame.ratio)}px)` : "100%",
        };
  return (
    <div
      className={cn(
        "bg-ink relative mx-auto flex w-full items-center justify-center overflow-hidden",
        frame.ratio === null && !photo && "aspect-video",
        className,
      )}
      style={style}
    >
      {photo ? (
        // A local preview of the picked file (blob: or our own media link).
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={media.src ?? undefined}
          alt=""
          className={cn(
            "w-full",
            frame.ratio === null ? "max-h-64" : "h-full",
            frame.fit === "cover" && frame.ratio !== null ? "object-cover" : "object-contain",
          )}
        />
      ) : (
        <span className="text-xs text-white">▶ Video</span>
      )}
    </div>
  );
}

/**
 * Preview (design "5 · Posts: composer with preview", T74a; Posts Round 2): one tab per picked
 * platform with the frame it really shows (the crop it gets, Story/Reel as a tall frame) and its
 * own text when the owner wrote one. Nothing leaves the browser.
 */
export function PostPreview({
  platforms,
  brandName,
  text,
  options,
  mediaFor,
}: {
  platforms: string[];
  brandName: string;
  text: string;
  options: PostOptions;
  /** Each platform's file; null when the post has none. */
  mediaFor: (platform: string) => PlatformMedia | null;
}) {
  const [tab, setTab] = useState<string | null>(null);
  if (!platforms.length) return null;
  const current = tab && platforms.includes(tab) ? tab : platforms[0];
  const media = mediaFor(current);
  const own = textFor(current, options, text);
  if (!own.trim() && !media) return null;
  const as = options[current]?.as;
  const frame = previewFrame(current, as, media?.shape ?? null);
  const { shown, more } = previewText(current, own);
  const kind = !frame.tall
    ? null
    : as === "story"
      ? "Story"
      : current === "youtube"
        ? "Short"
        : current === "tiktok"
          ? null
          : "Reel";
  const picture = media ? <MediaFrame frame={frame} media={media} /> : null;
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
        <div
          className="segmented max-w-full self-start overflow-x-auto"
          role="tablist"
          aria-label="Preview on"
        >
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
          <span className="flex-1 truncate text-[13px] font-semibold">
            {brandName}
            {kind && <span className="text-ink-3 font-normal"> · {kind}</span>}
          </span>
          <PlatformMark platform={current} size={18} />
        </div>
        {textBelow(current) ? (
          <>
            {picture}
            {words}
          </>
        ) : (
          <>
            {words}
            {picture}
          </>
        )}
      </div>
      <p className="meta">
        The shape {platformLabel(current)} shows
        {own !== text ? ", with its own text" : ""}. Each app trims long text with
        &ldquo;more&rdquo;.
      </p>
    </section>
  );
}
