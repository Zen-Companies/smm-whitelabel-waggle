"use client";

import { Check } from "lucide-react";
import { cn } from "cn";
import { PlatformMark } from "@/components/app/platform-mark";
import { StateMark } from "@/components/app/state-mark";
import { platformLabel } from "@/lib/social/platforms";
import type { MadeCrop } from "./crop-sheet";
import {
  cropChoicesFor,
  ONE_SHAPE_CHOICES,
  showOneShapeForAll,
  type CropChoice,
  type Fit,
} from "./media-fit";
import { MediaFrame, type PlatformMedia } from "./post-preview";
import type { PostOptions } from "./post-options";
import { previewFrame } from "./preview";

const TILE: Record<Fit["level"], string> = {
  fits: "border-line bg-surface",
  trims: "border-honey-border bg-honey-tint",
  refused: "border-danger-border bg-danger-soft",
};

/**
 * "How it fits" (Posts Round 2, approved 25 Nov, option A): one tile per picked platform (two
 * accounts on one platform share it) with the photo or video in that platform's frame. Green fits,
 * honey posts but is trimmed or better in another shape, red is refused and offers the fixes.
 * Nothing changes unless the owner picks a crop.
 */
export function FitRow({
  platforms,
  accountCount,
  summary,
  fits,
  details,
  options,
  mediaFor,
  photo,
  oneShapeForAll,
  crops,
  allCrop,
  onCrop,
  onRemoveCrop,
  onStory,
  onLeaveOut,
  onAllShape,
  choose = {},
  onChoose,
}: {
  platforms: string[];
  accountCount: number;
  /** Round 4: "12 photos and 1 video" when the post has several files. */
  summary: string | null;
  fits: Partial<Record<string, Fit | null>>;
  /** Round 4: what each platform gets of a carousel ("5 photos, swipe", "1 photo"). */
  details: Partial<Record<string, string>>;
  options: PostOptions;
  mediaFor: (platform: string) => PlatformMedia | null;
  /** The post has a photo (crops are offered). */
  photo: boolean;
  /** One shape for all: a single photo only. */
  oneShapeForAll: boolean;
  /** Each platform's crop in use (a new one, or one the post already had). */
  crops: Partial<Record<string, { label: string }>>;
  allCrop: MadeCrop | null;
  onCrop: (platform: string) => void;
  onRemoveCrop: (platform: string) => void;
  onStory: (platform: string) => void;
  onLeaveOut: (platform: string) => void;
  /** null = Original. */
  onAllShape: (choice: CropChoice | null) => void;
  /** Round 5: "10 of 14 · Choose" where a platform takes fewer photos than the post has. */
  choose?: Partial<Record<string, string>>;
  onChoose?: (platform: string) => void;
}) {
  const shown = platforms.filter((p) => fits[p]);
  if (!shown.length) return null;
  return (
    <section aria-labelledby="fit-heading" className="flex flex-col gap-2">
      <div className="flex items-baseline gap-2">
        <h3 id="fit-heading" className="text-sm font-semibold">
          How it fits
        </h3>
        <span className="meta">
          {accountCount} account{accountCount === 1 ? "" : "s"}
          {summary ? ` · ${summary}` : ""}
        </span>
      </div>
      <ul className="grid grid-cols-2 gap-2">
        {shown.map((p) => {
          const fit = fits[p] as Fit;
          const media = mediaFor(p);
          const as = options[p]?.as;
          const crop = crops[p];
          const name = `${platformLabel(p)}${as === "story" ? " Story" : as === "reel" ? " Reel" : ""}`;
          const canCrop = photo && fit.fixes.includes("crop") && cropChoicesFor(p, as).length > 0;
          return (
            <li
              key={p}
              className={cn(
                "flex min-w-0 flex-col gap-2 rounded-[14px] border p-2",
                TILE[fit.level],
              )}
            >
              {media && (
                <MediaFrame
                  frame={previewFrame(p, as, media.shape)}
                  media={media}
                  tallHeight={150}
                  className="rounded-lg"
                />
              )}
              <span className="flex items-center gap-1.5">
                <PlatformMark platform={p} size={18} />
                <b className="truncate text-[13px] font-semibold">{name}</b>
              </span>
              <span
                className={cn(
                  "flex items-start gap-1.5 text-[13px]",
                  fit.level === "fits" && "text-success",
                  fit.level === "trims" && "text-honey-text",
                  fit.level === "refused" && "text-danger",
                )}
              >
                {fit.level === "fits" ? (
                  <Check className="mt-0.5 size-3.5 shrink-0" strokeWidth={3} aria-hidden />
                ) : fit.level === "refused" ? (
                  <span className="mt-0.5">
                    <StateMark state="needs" />
                  </span>
                ) : null}
                <span className="min-w-0">{fit.message}</span>
              </span>
              {details[p] && <span className="text-ink-3 text-xs">{details[p]}</span>}
              {choose[p] && onChoose && (
                <button
                  type="button"
                  onClick={() => onChoose(p)}
                  className="action-link self-start text-[13px] tabular-nums"
                >
                  {choose[p]}
                </button>
              )}
              {crop && (
                <span className="text-ink-2 flex flex-wrap items-center gap-x-2 text-xs">
                  Cropped to {crop.label}
                  <button type="button" onClick={() => onCrop(p)} className="action-link text-xs">
                    Change
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemoveCrop(p)}
                    className="action-link text-danger text-xs"
                  >
                    Remove crop
                  </button>
                </span>
              )}
              {!crop &&
                (canCrop || fit.fixes.includes("story") || fit.fixes.includes("leaveOut")) && (
                  <span className="flex flex-col items-start gap-1">
                    {canCrop && (
                      <button
                        type="button"
                        onClick={() => onCrop(p)}
                        className="action-link text-[13px]"
                      >
                        Crop for {platformLabel(p)}
                      </button>
                    )}
                    {fit.fixes.includes("story") && (
                      <button
                        type="button"
                        onClick={() => onStory(p)}
                        className="action-link text-[13px]"
                      >
                        Post as a Story
                      </button>
                    )}
                    {fit.fixes.includes("leaveOut") && (
                      <button
                        type="button"
                        onClick={() => onLeaveOut(p)}
                        className="action-link text-[13px]"
                      >
                        Leave {platformLabel(p)} out
                      </button>
                    )}
                  </span>
                )}
            </li>
          );
        })}
      </ul>
      {shown.some((p) => fits[p]?.level === "refused") && (
        <p className="text-danger text-sm">
          {platformList(shown.filter((p) => fits[p]?.level === "refused"))} can&apos;t be sent until
          one of these is picked. The other accounts aren&apos;t held up.
        </p>
      )}
      {photo && oneShapeForAll && showOneShapeForAll(platforms) && (
        <div
          className="flex flex-wrap items-center gap-2"
          role="radiogroup"
          aria-label="One shape for all"
        >
          <span className="text-ink-2 text-[13px]">Or one shape for all:</span>
          {[null, ...ONE_SHAPE_CHOICES].map((c) => {
            const on = c === null ? !allCrop : allCrop?.label === c.label;
            return (
              <button
                key={c?.label ?? "original"}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => onAllShape(c)}
                className={cn(
                  "inline-flex min-h-9 items-center rounded-full border px-3 text-xs font-semibold",
                  on
                    ? "border-honey bg-honey-tint text-ink border-[1.5px]"
                    : "border-line-strong bg-surface text-ink-2 hover:bg-subtle",
                )}
              >
                {c?.label ?? "Original"}
              </button>
            );
          })}
        </div>
      )}
      {!photo && shown.some((p) => fits[p]?.level === "refused") && (
        <p className="meta">
          Videos aren&apos;t cropped here. Leave that platform out, or pick another video.
        </p>
      )}
    </section>
  );
}

function platformList(platforms: string[]): string {
  const names = platforms.map(platformLabel);
  return names.length <= 1
    ? (names[0] ?? "")
    : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}
