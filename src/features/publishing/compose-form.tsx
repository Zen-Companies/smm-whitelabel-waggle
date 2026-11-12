"use client";

import { useActionState, useState } from "react";
import { PlatformMark } from "@/components/app/platform-mark";
import { Button } from "@/components/ui/button";
import { platformLabel } from "@/lib/social/platforms";
import { composePost, type ComposeState } from "./actions";
import { POST_IMAGE_MAX_BYTES, POST_IMAGE_TYPES, POST_TEXT_MAX, YOUTUBE_TITLE_MAX } from "./limits";
import { checkPlatform, imageMaxBytesFor, needsConsent, textLimitFor } from "./post-rules";
import { VideoField, type VideoState } from "./video-field";

export interface ComposeAccount {
  id: string;
  platform: string;
  username: string | null;
}

const OUTCOME: Record<NonNullable<ComposeState["outcome"]>, string> = {
  published: "Posted. It shows as published as soon as each platform confirms.",
  scheduled: "Scheduled. It's on the calendar.",
  waiting: "Saved. It goes out as soon as posting is possible again.",
  failed: "Saved, but it couldn't be posted. It's marked on the calendar.",
};

/** "Sun 7:00 AM" for the Schedule button, so the owner sees exactly what will happen. */
function whenLabel(date: string, time: string): string {
  const at = new Date(`${date}T${time}`);
  if (Number.isNaN(at.getTime())) return "";
  return `${at.toLocaleDateString(undefined, { weekday: "short" })} ${at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
}

const localDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * Compose a post: text, an optional photo or video (T63), accounts, now or on a day and time
 * (PRD F3, design v2).
 * `day` (YYYY-MM-DD) comes from clicking a day on the calendar and preselects Schedule; `time`
 * (HH:MM) from an Analytics best time.
 */
export function ComposeForm({
  accounts,
  day = null,
  time = null,
}: {
  accounts: ComposeAccount[];
  day?: string | null;
  time?: string | null;
}) {
  const [state, action, pending] = useActionState<ComposeState, FormData>(composePost, {});
  // A saved post changes savedAt, which remounts the fields: text, counter and time reset.
  return (
    <ComposeFields
      key={state.savedAt}
      accounts={accounts}
      day={day}
      initialTime={time}
      state={state}
      action={action}
      pending={pending}
    />
  );
}

function ComposeFields({
  accounts,
  day,
  initialTime,
  state,
  action,
  pending,
}: {
  accounts: ComposeAccount[];
  day: string | null;
  initialTime: string | null;
  state: ComposeState;
  action: (formData: FormData) => void;
  pending: boolean;
}) {
  const [when, setWhen] = useState<"now" | "later">(day ? "later" : "now");
  const [date, setDate] = useState(() => day ?? localDay(new Date(Date.now() + 24 * 3_600_000)));
  const [time, setTime] = useState(initialTime ?? "09:00");
  const [length, setLength] = useState(0);
  const [photo, setPhoto] = useState<string | null>(null);
  const [video, setVideo] = useState<VideoState>({ step: "none" });
  const hasVideo = video.step === "ready" || video.step === "uploading";
  const [picked, setPicked] = useState<string[]>(() => accounts.map((a) => a.id));
  // What each ticked platform will do with this post (design v3 "Before it goes out").
  const pickedPlatforms = [
    ...new Set(accounts.filter((a) => picked.includes(a.id)).map((a) => a.platform)),
  ];
  const checks = pickedPlatforms.map((p) =>
    checkPlatform(p, {
      textLength: length,
      images: photo && !hasVideo ? 1 : 0,
      videos: hasVideo ? 1 : 0,
      videoSeconds: hasVideo ? video.seconds : null,
    }),
  );
  const serverProblems = state.problems ?? [];
  const limit = textLimitFor(pickedPlatforms, POST_TEXT_MAX);
  const imageMb =
    Math.round(imageMaxBytesFor(pickedPlatforms, POST_IMAGE_MAX_BYTES) / 100_000) / 10;
  // Day and time are the owner's local time; send them as an absolute ISO time.
  const at = date && time ? new Date(`${date}T${time}`) : null;
  const scheduledFor = at && !Number.isNaN(at.getTime()) ? at.toISOString() : "";
  const fieldError = (field: ComposeState["field"]) =>
    state.field === field && state.error ? (
      <p role="alert" className="text-danger text-sm">
        {state.error}
      </p>
    ) : null;

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor="post-content" className="text-sm font-medium">
          What do you want to share?
        </label>
        <textarea
          id="post-content"
          name="content"
          rows={4}
          maxLength={POST_TEXT_MAX}
          required
          onChange={(e) => setLength(e.target.value.length)}
          placeholder="New on the menu: ube cheese pandesal, every morning from 7."
          className="field min-h-28 py-3"
        />
        <p className={length > limit ? "text-danger text-sm" : "meta"}>
          {length} / {limit.toLocaleString("en-US")}
          {limit < POST_TEXT_MAX && pickedPlatforms.length > 1
            ? " (the shortest of your picks)"
            : ""}
        </p>
        {fieldError("content")}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-start gap-3">
          {!hasVideo && (
            <label
              htmlFor="post-image"
              className="border-line-strong text-ink-3 hover:bg-subtle flex size-16 shrink-0 cursor-pointer items-center justify-center rounded-md border border-dashed text-center text-xs has-[:focus-visible]:outline-2"
            >
              {photo ? "Change photo" : "Add photo"}
              <input
                id="post-image"
                name="image"
                type="file"
                accept={POST_IMAGE_TYPES.join(",")}
                onChange={(e) => setPhoto(e.target.files?.[0]?.name ?? null)}
                className="sr-only"
              />
            </label>
          )}
          {/* A post carries a photo or a video, not both (TikTok and others refuse the mix). */}
          {!photo && <VideoField video={video} onChange={setVideo} disabled={pending} />}
          {!hasVideo && (
            <span className="meta min-w-0 self-center truncate">
              {photo ?? `A photo (JPG or PNG, up to ${imageMb} MB) or a video`}
            </span>
          )}
        </div>
        {fieldError("image")}
      </div>

      {pickedPlatforms.includes("youtube") && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="post-youtube-title" className="text-sm font-medium">
            YouTube title
          </label>
          <input
            id="post-youtube-title"
            name="youtubeTitle"
            maxLength={YOUTUBE_TITLE_MAX}
            placeholder="Without one, YouTube uses the first line of your text"
            className="field"
          />
          <span className="meta">
            {YOUTUBE_TITLE_MAX} characters max; your text becomes the description.
          </span>
          {fieldError("youtubeTitle")}
        </div>
      )}

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Post to</legend>
        {accounts.length === 0 && (
          <p className="text-ink-3 text-sm">Connect an account in Settings first.</p>
        )}
        {accounts.map((a) => (
          <label key={a.id} className="flex min-h-11 items-center gap-3 text-sm">
            <input
              type="checkbox"
              name="accounts"
              value={a.id}
              checked={picked.includes(a.id)}
              onChange={(e) =>
                setPicked((p) => (e.target.checked ? [...p, a.id] : p.filter((id) => id !== a.id)))
              }
              className="size-4"
            />
            <PlatformMark platform={a.platform} size={24} />
            {platformLabel(a.platform)} @{a.username ?? "account"}
          </label>
        ))}
        {fieldError("accounts")}
      </fieldset>

      {(checks.some((c) => c.level !== "ok") || serverProblems.length > 0) && (
        <section
          aria-labelledby="before-heading"
          className="border-line flex flex-col gap-2.5 rounded-xl border p-4"
        >
          <h3 id="before-heading" className="text-sm font-semibold">
            Before it goes out
          </h3>
          <ul className="flex flex-col gap-2.5 text-sm">
            {checks.map((c) =>
              c.level === "ok" ? null : (
                <li key={c.platform} className="flex items-start gap-2.5">
                  <PlatformMark platform={c.platform} size={22} />
                  <span className={c.level === "blocked" ? "text-danger" : "text-ink-2"}>
                    {c.message}
                    {c.level === "blocked" ? " Untick it to post to the others." : ""}
                  </span>
                </li>
              ),
            )}
            {serverProblems.map((p, i) => (
              <li key={`${p.platform}-${i}`} role="alert" className="flex items-start gap-2.5">
                <PlatformMark platform={p.platform} size={22} />
                <span className="text-danger">
                  <b className="font-semibold">{platformLabel(p.platform)}</b>: {p.message}
                </span>
              </li>
            ))}
          </ul>
          <span className="text-ink-3 text-xs">
            Rules come from each platform. Waggle checks them before saving, so nothing fails later.
          </span>
        </section>
      )}

      {needsConsent(pickedPlatforms) && (
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            name="tiktokConsent"
            value="yes"
            required
            className="mt-0.5 size-4"
          />
          <span>
            I&apos;ve checked this post and agree to publish it to TikTok. It posts publicly.
          </span>
        </label>
      )}

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">When</legend>
        <div className="segmented self-start" role="radiogroup">
          {(["now", "later"] as const).map((v) => (
            <label key={v} data-active={when === v || undefined}>
              <input
                type="radio"
                name="when"
                value={v}
                checked={when === v}
                onChange={() => setWhen(v)}
                className="sr-only"
              />
              {v === "now" ? "Now" : "Schedule"}
            </label>
          ))}
        </div>
        {when === "later" && (
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="post-day" className="text-sm font-medium">
                Day
              </label>
              <input
                id="post-day"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="field"
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="post-time" className="text-sm font-medium">
                Time
              </label>
              <input
                id="post-time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="field"
                required
              />
            </div>
            <input type="hidden" name="scheduledFor" value={scheduledFor} />
          </div>
        )}
        {fieldError("when")}
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          variant="primary"
          disabled={
            pending ||
            video.step === "uploading" ||
            picked.length === 0 ||
            checks.some((c) => c.level === "blocked")
          }
        >
          {pending
            ? "Saving…"
            : when === "now"
              ? "Post now"
              : `Schedule${whenLabel(date, time) ? ` for ${whenLabel(date, time)}` : ""}`}
        </Button>
        {state.outcome && (
          <p role="status" className="text-sm">
            {OUTCOME[state.outcome]}
          </p>
        )}
        {state.error && !state.field && (
          <p role="alert" className="text-danger text-sm">
            {state.error}
          </p>
        )}
      </div>
    </form>
  );
}
