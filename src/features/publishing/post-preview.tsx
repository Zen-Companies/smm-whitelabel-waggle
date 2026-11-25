"use client";

import { useRef, useState } from "react";
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

/**
 * One platform's post as it really shows (Posts Round 3: the big composer's preview row): its
 * frame, its own text, cut with "more" where the app cuts it.
 */
export function PreviewCard({
  platform,
  brandName,
  text,
  options,
  media,
}: {
  platform: string;
  brandName: string;
  text: string;
  options: PostOptions;
  media: PlatformMedia | null;
}) {
  const own = textFor(platform, options, text);
  const as = options[platform]?.as;
  const frame = previewFrame(platform, as, media?.shape ?? null);
  const { shown, more } = previewText(platform, own);
  const kind = !frame.tall
    ? null
    : as === "story"
      ? "Story"
      : platform === "youtube"
        ? "Short"
        : platform === "tiktok"
          ? null
          : "Reel";
  const picture = media ? <MediaFrame frame={frame} media={media} tallHeight={360} /> : null;
  const words = shown ? (
    <p className="px-3 py-2 text-[13px] whitespace-pre-wrap">
      {textBelow(platform) && <b className="font-semibold">{brandName} </b>}
      {shown}
      {more && <span className="text-ink-3"> more</span>}
    </p>
  ) : (
    <p className="text-ink-3 px-3 py-2 text-[13px]">Your text shows here.</p>
  );
  return (
    <div className="border-line bg-surface overflow-hidden rounded-xl border">
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="bg-ink text-honey inline-flex size-7 items-center justify-center rounded-full text-[11px] font-bold">
          {initials(brandName)}
        </span>
        <span className="flex-1 truncate text-[13px] font-semibold">
          {brandName}
          {kind && <span className="text-ink-3 font-normal"> · {kind}</span>}
        </span>
        <PlatformMark platform={platform} size={18} />
      </div>
      {textBelow(platform) ? (
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
  );
}

/**
 * Every picked platform's preview side by side (Posts Round 3, board 6): up to 3 fit; more scroll
 * sideways and the tabs jump to one. On a phone the row swipes, one app at a time.
 */
export function PreviewRow({
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
  mediaFor: (platform: string) => PlatformMedia | null;
}) {
  const row = useRef<HTMLDivElement>(null);
  if (!platforms.length) {
    return <p className="meta">Pick where it goes, and each app&apos;s preview shows here.</p>;
  }
  return (
    <section aria-labelledby="preview-row-heading" className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <h3 id="preview-row-heading" className="text-sm font-semibold">
          Preview
        </h3>
        {platforms.length > 1 && (
          <div className="segmented max-w-full overflow-x-auto" aria-label="Jump to">
            {platforms.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() =>
                  row.current
                    ?.querySelector(`[data-preview="${p}"]`)
                    ?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" })
                }
              >
                {platformLabel(p)}
              </button>
            ))}
          </div>
        )}
        {platforms.length > 3 && (
          <span className="meta">{platforms.length} platforms · scroll →</span>
        )}
      </div>
      <div
        ref={row}
        className="flex snap-x snap-mandatory items-start gap-3 overflow-x-auto pb-2"
        tabIndex={0}
        aria-label="Previews"
      >
        {platforms.map((p) => (
          <div
            key={p}
            data-preview={p}
            className={cn(
              "shrink-0 snap-start",
              "max-lg:w-[85%] max-lg:snap-center",
              platforms.length >= 3
                ? "lg:w-[calc((100%-24px)/3)] lg:min-w-[220px]"
                : "lg:min-w-0 lg:flex-1",
            )}
          >
            <PreviewCard
              platform={p}
              brandName={brandName}
              text={text}
              options={options}
              media={mediaFor(p)}
            />
          </div>
        ))}
      </div>
      <p className="meta">
        Each preview is the frame that app shows, with its own text. Each app trims long text with
        &ldquo;more&rdquo;.
      </p>
    </section>
  );
}
