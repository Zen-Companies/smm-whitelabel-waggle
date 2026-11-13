"use client";

import { useState } from "react";
import { PlatformMark } from "@/components/app/platform-mark";
import { platformLabel } from "@/lib/social/platforms";
import type { PlatformPostOptions, PostOptions } from "./post-options";

const SHOWS_AS = new Set(["instagram", "facebook"]);
const FIRST_COMMENT = ["instagram", "facebook", "youtube", "threads", "linkedin"];

/**
 * Options per platform for the post being written (T75, design "Posts · options"): its own
 * text, how it shows (Post / Story / Reel), a first comment, and the YouTube, Instagram and
 * Facebook choices. Sends them as one JSON field (`platformOptions`); the server re-checks them.
 */
export function PostOptionsFields({
  platforms,
  sharedText,
  hasMedia,
  hasVideo,
}: {
  platforms: string[];
  sharedText: string;
  hasMedia: boolean;
  hasVideo: boolean;
}) {
  const [options, setOptions] = useState<PostOptions>({});
  const [textFor, setTextFor] = useState<string | null>(null);
  const set = (platform: string, patch: Partial<PlatformPostOptions>) =>
    setOptions((o) => ({ ...o, [platform]: { ...o[platform], ...patch } }));
  const opt = (p: string): PlatformPostOptions => options[p] ?? {};
  const shown = platforms.filter((p) => SHOWS_AS.has(p));
  const commentOn = platforms.filter(
    (p) => FIRST_COMMENT.includes(p) && opt(p).as !== "story",
  );
  // Only what's still picked goes to the server.
  const payload = Object.fromEntries(platforms.filter((p) => options[p]).map((p) => [p, options[p]]));

  return (
    <div className="flex flex-col gap-4">
      <input type="hidden" name="platformOptions" value={JSON.stringify(payload)} />

      {platforms.length > 1 && (
        <section className="flex flex-col gap-2" aria-labelledby="text-per-platform">
          <h3 id="text-per-platform" className="text-sm font-medium">
            Text for one platform
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {platforms.map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={textFor === p}
                onClick={() => {
                  setTextFor(textFor === p ? null : p);
                  if (opt(p).text === undefined) set(p, { text: sharedText });
                }}
                className="border-line-strong data-[on=true]:border-ink data-[on=true]:bg-subtle inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm"
                data-on={textFor === p}
              >
                <PlatformMark platform={p} size={18} />
                {platformLabel(p)}
                {opt(p).text !== undefined && opt(p).text !== sharedText ? " · edited" : ""}
              </button>
            ))}
          </div>
          {textFor && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="post-text-for" className="sr-only">
                Text for {platformLabel(textFor)}
              </label>
              <textarea
                id="post-text-for"
                rows={3}
                value={opt(textFor).text ?? sharedText}
                onChange={(e) => set(textFor, { text: e.target.value })}
                className="field min-h-20 py-3"
              />
              <button
                type="button"
                onClick={() => set(textFor, { text: undefined })}
                className="text-honey-text self-start text-sm font-medium underline"
              >
                Use the shared text on {platformLabel(textFor)}
              </button>
            </div>
          )}
        </section>
      )}

      {shown.length > 0 && (
        <section className="flex flex-col gap-2" aria-labelledby="how-it-shows">
          <h3 id="how-it-shows" className="text-sm font-medium">
            How it shows
          </h3>
          {shown.map((p) => (
            <div key={p} className="flex flex-wrap items-center gap-3">
              <span className="flex w-28 items-center gap-2 text-sm">
                <PlatformMark platform={p} size={20} />
                {platformLabel(p)}
              </span>
              <div className="segmented" role="radiogroup" aria-label={`${platformLabel(p)}: how it shows`}>
                {(["post", "story", "reel"] as const).map((v) => {
                  const disabled = (v === "reel" && !hasVideo) || (v === "story" && !hasMedia);
                  return (
                    <label key={v} data-active={(opt(p).as ?? "post") === v || undefined} aria-disabled={disabled}>
                      <input
                        type="radio"
                        name={`as-${p}`}
                        checked={(opt(p).as ?? "post") === v}
                        disabled={disabled}
                        onChange={() => set(p, { as: v })}
                        className="sr-only"
                      />
                      {v === "post" ? "Post" : v === "story" ? "Story" : "Reel"}
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
          <p className="meta">
            Stories need a photo or video and disappear after 24 hours, with no caption. Reels need
            one video.
          </p>
        </section>
      )}

      {commentOn.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="post-first-comment" className="text-sm font-medium">
            First comment <span className="text-ink-3 font-normal">(optional)</span>
          </label>
          <textarea
            id="post-first-comment"
            rows={2}
            maxLength={2200}
            value={opt(commentOn[0]).firstComment ?? ""}
            onChange={(e) => {
              for (const p of commentOn) set(p, { firstComment: e.target.value });
            }}
            placeholder="Posted right after the post. Good for hashtags or a link."
            className="field min-h-16 py-2.5"
          />
          <span className="meta">
            On {commentOn.map(platformLabel).join(", ")}.
            {platforms.length > commentOn.length ? " The others skip it." : ""}
          </span>
        </div>
      )}

      {platforms.includes("youtube") && (
        <section className="flex flex-col gap-2" aria-labelledby="yt-options">
          <h3 id="yt-options" className="flex items-center gap-2 text-sm font-medium">
            <PlatformMark platform="youtube" size={20} /> YouTube
          </h3>
          <div className="segmented self-start" role="radiogroup" aria-label="Who can watch it">
            {(["public", "unlisted", "private"] as const).map((v) => (
              <label key={v} data-active={(opt("youtube").visibility ?? "public") === v || undefined}>
                <input
                  type="radio"
                  name="yt-visibility"
                  checked={(opt("youtube").visibility ?? "public") === v}
                  onChange={() => set("youtube", { visibility: v })}
                  className="sr-only"
                />
                {v === "public" ? "Public" : v === "unlisted" ? "Unlisted" : "Private"}
              </label>
            ))}
          </div>
          <Check
            label="Made for kids"
            checked={!!opt("youtube").madeForKids}
            onChange={(v) => set("youtube", { madeForKids: v })}
          />
          <Check
            label="Made with AI or changed to look real"
            checked={!!opt("youtube").aiLabel}
            onChange={(v) => set("youtube", { aiLabel: v })}
          />
          <p className="meta">Vertical or square videos up to 3 minutes become Shorts on their own.</p>
        </section>
      )}

      {platforms.includes("instagram") && opt("instagram").as !== "story" && (
        <details className="group">
          <summary className="text-ink-2 cursor-pointer text-sm font-medium">
            More Instagram options
          </summary>
          <div className="mt-2 flex flex-col gap-2">
            {opt("instagram").as === "reel" && (
              <>
                <Check
                  label="Also show the Reel in the feed"
                  checked={opt("instagram").shareToFeed ?? true}
                  onChange={(v) => set("instagram", { shareToFeed: v })}
                />
                <Check
                  label="Trial reel: shown to people who don't follow you first"
                  checked={!!opt("instagram").trialReel}
                  onChange={(v) => set("instagram", { trialReel: v })}
                />
              </>
            )}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="ig-collabs" className="text-sm font-medium">
                Collaborators <span className="text-ink-3 font-normal">(up to 3)</span>
              </label>
              <input
                id="ig-collabs"
                value={(opt("instagram").collaborators ?? []).join(", ")}
                onChange={(e) =>
                  set("instagram", {
                    collaborators: e.target.value.split(",").map((s) => s.trim()).slice(0, 3),
                  })
                }
                placeholder="@kape.lover"
                className="field"
              />
            </div>
            <Check
              label="Paid partnership label"
              checked={!!opt("instagram").paidPartnership}
              onChange={(v) => set("instagram", { paidPartnership: v })}
            />
            <Check
              label="Made with AI label"
              checked={!!opt("instagram").aiLabel}
              onChange={(v) => set("instagram", { aiLabel: v })}
            />
          </div>
        </details>
      )}

      {platforms.includes("facebook") && opt("facebook").as === "reel" && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="fb-reel-title" className="text-sm font-medium">
            Facebook Reel title <span className="text-ink-3 font-normal">(optional)</span>
          </label>
          <input
            id="fb-reel-title"
            maxLength={100}
            value={opt("facebook").title ?? ""}
            onChange={(e) => set("facebook", { title: e.target.value })}
            className="field"
          />
        </div>
      )}
    </div>
  );
}

function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex min-h-9 items-center gap-3 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4"
      />
      {label}
    </label>
  );
}
