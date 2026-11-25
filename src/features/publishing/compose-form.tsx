"use client";

import { Camera, Check, ChevronDown } from "lucide-react";
import Link from "next/link";
import { startTransition, useActionState, useRef, useState } from "react";
import { cn } from "cn";
import { EmptyCell } from "@/components/app/empty-spot";
import { StateLabel } from "@/components/app/state-mark";
import { PlatformMark } from "@/components/app/platform-mark";
import { Button } from "@/components/ui/button";
import { platformLabel } from "@/lib/social/platforms";
import { composePost, type ComposeState } from "./actions";
import { POST_IMAGE_MAX_BYTES, POST_IMAGE_TYPES, POST_TEXT_MAX, YOUTUBE_TITLE_MAX } from "./limits";
import { checkPlatform, imageMaxBytesFor, needsConsent, textLimitFor } from "./post-rules";
import { BoardPicker } from "./board-picker";
import { PostOptionsFields } from "./post-options-fields";
import { ownText, textFor, type PostOptions } from "./post-options";
import { VideoField, type VideoState } from "./video-field";
import { OneDrivePicker } from "./onedrive-picker";
import { PostPreview } from "./post-preview";

export interface ComposeAccount {
  id: string;
  platform: string;
  username: string | null;
  /** T64: the board pins go to; null = the account's first board. */
  pinterestBoard?: { id: string; name: string } | null;
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

/** "Mon 9:00 AM" for a queue slot. */
function slotLabel(iso: string): string {
  const at = new Date(iso);
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
  nextSlot = null,
  brandName = "",
  disconnected = [],
}: {
  accounts: ComposeAccount[];
  /** T74a: the name the preview shows. */
  brandName?: string;
  /** T74a: accounts that stopped connecting, shown as "Reconnect to post here". */
  disconnected?: { platform: string; username: string | null }[];
  day?: string | null;
  time?: string | null;
  /** T75: the brand's next free posting time (ISO), or null when it has no posting times. */
  nextSlot?: string | null;
}) {
  const [state, action, pending] = useActionState<ComposeState, FormData>(composePost, {});
  // A saved post changes savedAt, which remounts the fields: text, counter and time reset.
  return (
    <ComposeFields
      key={state.savedAt}
      accounts={accounts}
      day={day}
      initialTime={time}
      nextSlot={nextSlot}
      brandName={brandName}
      disconnected={disconnected}
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
  nextSlot,
  brandName,
  disconnected,
  state,
  action,
  pending,
}: {
  accounts: ComposeAccount[];
  brandName: string;
  disconnected: { platform: string; username: string | null }[];
  day: string | null;
  initialTime: string | null;
  nextSlot: string | null;
  state: ComposeState;
  action: (formData: FormData) => void;
  pending: boolean;
}) {
  const [when, setWhen] = useState<"now" | "queue" | "later">(day ? "later" : "now");
  const [date, setDate] = useState(() => day ?? localDay(new Date(Date.now() + 24 * 3_600_000)));
  const [time, setTime] = useState(initialTime ?? "09:00");
  const [text, setText] = useState("");
  const length = text.length;
  // Per-platform choices (T75), here so each platform's own text is checked against its limit.
  const [options, setOptions] = useState<PostOptions>({});
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoSize, setPhotoSize] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [dropError, setDropError] = useState<string | null>(null);
  const pickVideo = useRef<((file: File) => void) | null>(null);
  // T74a: a local link to the picked photo, for the preview only.
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  // T84c: a photo picked from OneDrive, already copied into media storage.
  const [drivePhoto, setDrivePhoto] = useState<{ url: string; size: number } | null>(null);
  const [video, setVideo] = useState<VideoState>({ step: "none" });
  // T64: boards chosen here (saved on the account), and whose picker is open.
  const [boards, setBoards] = useState<Record<string, { id: string; name: string }>>({});
  const [boardFor, setBoardFor] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>(() => accounts.map((a) => a.id));
  const pinterest = accounts.filter((a) => a.platform === "pinterest" && picked.includes(a.id));
  const hasVideo = video.step === "ready" || video.step === "uploading";
  const hasMedia = !!photo || hasVideo;
  /** A photo from the device (or null to clear it), from the picker, Replace, Remove or a drop. */
  const choosePhoto = (file: File | null) => {
    setDropError(null);
    if (!file) {
      const input = document.getElementById("post-image") as HTMLInputElement | null;
      if (input) input.value = "";
    }
    setPhoto(file?.name ?? null);
    setPhotoSize(file?.size ?? null);
    setDrivePhoto(null);
    setPhotoUrl((old) => {
      if (old?.startsWith("blob:")) URL.revokeObjectURL(old);
      return file ? URL.createObjectURL(file) : null;
    });
  };
  /** A file dropped on the zone: photos go in the form's file field, videos start uploading. */
  const dropFile = (file: File | null) => {
    if (!file) return;
    if ((POST_IMAGE_TYPES as readonly string[]).includes(file.type)) {
      const input = document.getElementById("post-image") as HTMLInputElement | null;
      if (input) {
        const list = new DataTransfer();
        list.items.add(file);
        input.files = list.files;
      }
      choosePhoto(file);
    } else if (file.type.startsWith("video/")) {
      setDropError(null);
      pickVideo.current?.(file);
    } else {
      setDropError(
        "That file can't be posted. Use a JPG, PNG or WebP photo, or an MP4, MOV or WebM video.",
      );
    }
  };
  // What each ticked platform will do with this post (design v3 "Before it goes out").
  const pickedPlatforms = [
    ...new Set(accounts.filter((a) => picked.includes(a.id)).map((a) => a.platform)),
  ];
  const checks = pickedPlatforms.map((p) =>
    checkPlatform(p, {
      // The text that really goes there: its own when the owner wrote one, else the caption.
      textLength: textFor(p, options, text).length,
      images: photo && !hasVideo ? 1 : 0,
      videos: hasVideo ? 1 : 0,
      videoSeconds: hasVideo ? video.seconds : null,
    }),
  );
  const serverProblems = state.problems ?? [];
  // Zernio's notes: before saving they sit in "Before it goes out"; once saved, by the outcome.
  const serverWarnings = state.savedAt ? [] : (state.warnings ?? []);
  // The caption's counter: the shortest limit among platforms that use the caption.
  const followers = pickedPlatforms.filter((p) => ownText(options[p], text) === null);
  const limit = textLimitFor(followers, POST_TEXT_MAX);
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

  const issues =
    checks.filter((c) => c.level !== "ok").length + serverProblems.length + serverWarnings.length;
  const beforeSummary = issues
    ? issues === 1
      ? "1 thing to check"
      : `${issues} things to check`
    : pinterest.length
      ? "Pinterest board"
      : "All good";
  return (
    <form
      action={action}
      // Submitted by hand so React doesn't reset the fields: a refused post keeps everything the
      // owner typed and attached (a saved one remounts the form through savedAt instead).
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => action(data));
      }}
      className="flex flex-col gap-4"
    >
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
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="New on the menu: ube cheese pandesal, every morning from 7."
          className="field min-h-28 py-3"
        />
        <p className={length > limit ? "text-danger text-sm" : "meta"}>
          {length} / {limit.toLocaleString("en-US")}
          {limit < POST_TEXT_MAX && followers.length > 1 ? " (the shortest of your picks)" : ""}
        </p>
        {fieldError("content")}
      </div>

      {/* Photo or video (Posts media, approved 16 Nov): one drop zone; once something is added
          it becomes that file. A post carries a photo or a video, not both. */}
      <div className="flex flex-col gap-2">
        <input
          id="post-image"
          name="image"
          type="file"
          accept={POST_IMAGE_TYPES.join(",")}
          onChange={(e) => choosePhoto(e.target.files?.[0] ?? null)}
          className="sr-only"
        />
        <div
          onDragOver={(e) => {
            if (hasMedia) return;
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            if (hasMedia) return;
            e.preventDefault();
            setDragging(false);
            dropFile(e.dataTransfer.files?.[0] ?? null);
          }}
          className={
            hasMedia
              ? "flex flex-col gap-2"
              : cn(
                  "flex flex-col items-center gap-2.5 rounded-2xl border-[1.5px] border-dashed px-3.5 py-5 text-center transition-colors",
                  dragging ? "border-honey bg-honey-tint" : "border-line-strong bg-honey-tint/40",
                )
          }
        >
          {!hasMedia && (
            <>
              <EmptyCell size={34} />
              <b className="text-[15px] font-semibold">Add a photo or video</b>
              <span className="text-ink-2 text-[13px]">Drop it here, or pick one</span>
            </>
          )}
          {photo && (
            <div className="border-line bg-surface flex w-full items-center gap-3 rounded-2xl border p-2.5 text-left">
              {photoUrl ? (
                // A local or copied link to the picked photo, for this card only.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={photoUrl}
                  alt=""
                  className="size-[72px] shrink-0 rounded-xl object-cover"
                />
              ) : (
                <span className="bg-subtle size-[72px] shrink-0 rounded-xl" />
              )}
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <b className="truncate text-sm font-semibold">{photo}</b>
                <span className="text-ink-3 text-xs">
                  Photo{photoSize ? ` · ${sizeLabel(photoSize)}` : ""} ·{" "}
                  {drivePhoto ? "from OneDrive" : "from this device"}
                </span>
              </span>
              <label htmlFor="post-image" className="action-link cursor-pointer text-[13px]">
                Replace
              </label>
              <button
                type="button"
                onClick={() => choosePhoto(null)}
                className="action-link text-danger text-[13px]"
              >
                Remove
              </button>
            </div>
          )}
          <div
            className={
              hasMedia ? "flex flex-col gap-2" : "flex flex-wrap items-center justify-center gap-2"
            }
          >
            {!hasMedia && (
              <label
                htmlFor="post-image"
                className="border-line-strong bg-surface hover:bg-subtle inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border px-3.5 text-sm font-semibold"
              >
                <Camera className="size-[18px]" strokeWidth={1.8} aria-hidden />
                Photo
              </label>
            )}
            {!photo && (
              <VideoField
                video={video}
                onChange={setVideo}
                disabled={pending}
                pickRef={pickVideo}
              />
            )}
            {!hasMedia && (
              <OneDrivePicker
                disabled={pending}
                showSoon={false}
                allow={{ image: true, video: true }}
                onPick={(pick) => {
                  if (pick.use === "image") {
                    const file = document.getElementById("post-image") as HTMLInputElement | null;
                    if (file) file.value = "";
                    setPhoto(pick.name);
                    setPhotoSize(pick.size);
                    setDrivePhoto({ url: pick.url, size: pick.size });
                    setPhotoUrl(pick.url);
                  } else {
                    setVideo({
                      step: "ready",
                      name: pick.name,
                      size: pick.size,
                      seconds: null,
                      url: pick.url,
                    });
                  }
                }}
              />
            )}
          </div>
          {!hasMedia && (
            <>
              <span className="text-ink-3 text-xs">
                Photo: JPG, PNG or WebP, up to {imageMb} MB · Video: MP4, MOV or WebM · One or the
                other, not both
              </span>
              <StateLabel state="soon" className="text-[13px]">
                Google Drive, coming soon
              </StateLabel>
            </>
          )}
          {dropError && (
            <p role="alert" className="text-danger text-sm">
              {dropError}
            </p>
          )}
        </div>
        {drivePhoto && (
          <>
            <input type="hidden" name="imageUrl" value={drivePhoto.url} />
            <input type="hidden" name="imageSize" value={drivePhoto.size} />
          </>
        )}
        {fieldError("image")}
      </div>

      <Fold
        title="Post to"
        summary={
          pickedPlatforms.length
            ? pickedPlatforms.map((p) => platformLabel(p)).join(", ")
            : "Pick at least one"
        }
        open={!!state.field && state.field === "accounts"}
      >
        <fieldset className="flex flex-col gap-2">
          <legend className="sr-only">Post to</legend>
          {accounts.length === 0 && (
            <p className="text-ink-3 text-sm">Connect an account in Settings first.</p>
          )}
          {/* Account tiles (approved 16 Nov, option A): tap to pick; picked is honey with a check,
              unpicked goes grey. The checkbox stays (hidden) for the form and screen readers. */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {accounts.map((a) => {
              const on = picked.includes(a.id);
              return (
                <label
                  key={a.id}
                  className={cn(
                    "flex min-h-14 cursor-pointer items-center gap-2.5 rounded-[14px] border px-3 py-2 transition-colors duration-150 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2",
                    on
                      ? "border-honey bg-honey-tint border-[1.5px]"
                      : "border-line bg-surface hover:bg-subtle",
                  )}
                >
                  <input
                    type="checkbox"
                    name="accounts"
                    value={a.id}
                    checked={on}
                    onChange={(e) =>
                      setPicked((p) =>
                        e.target.checked ? [...p, a.id] : p.filter((id) => id !== a.id),
                      )
                    }
                    className="sr-only"
                  />
                  <span className={cn("flex transition", !on && "opacity-45 grayscale")}>
                    <PlatformMark platform={a.platform} size={28} />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <b className="text-sm font-semibold">{platformLabel(a.platform)}</b>
                    <span className="text-ink-3 truncate text-xs">@{a.username ?? "account"}</span>
                  </span>
                  {on ? (
                    <span
                      aria-hidden
                      className="bg-honey text-ink flex size-5 shrink-0 items-center justify-center rounded-full"
                    >
                      <Check className="size-3" strokeWidth={3} />
                    </span>
                  ) : (
                    <span
                      aria-hidden
                      className="border-line-strong size-5 shrink-0 rounded-full border-[1.5px]"
                    />
                  )}
                </label>
              );
            })}
          </div>
          {disconnected.map((a) => (
            <p
              key={`down-${a.platform}-${a.username ?? ""}`}
              className="text-ink-3 flex min-h-10 flex-wrap items-center gap-2.5 text-[13px]"
            >
              <span className="flex opacity-45 grayscale">
                <PlatformMark platform={a.platform} size={20} />
              </span>
              <span className="min-w-0 flex-1 truncate">
                {platformLabel(a.platform)} · @{a.username ?? "account"} stopped connecting
              </span>
              <Link href="/settings/accounts" className="action-link with-arrow">
                Reconnect
              </Link>
            </p>
          ))}
          {fieldError("accounts")}
        </fieldset>
      </Fold>

      <Fold
        title="Options"
        summary="Extras for each app, all optional"
        open={state.field === "youtubeTitle"}
      >
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

        <PostOptionsFields
          platforms={pickedPlatforms}
          sharedText={text}
          hasMedia={!!photo || hasVideo}
          hasVideo={hasVideo}
          options={options}
          onOptionsChange={setOptions}
        />
      </Fold>

      <Fold title="Preview" summary="How it looks on each app">
        <PostPreview
          platforms={pickedPlatforms}
          brandName={brandName}
          text={text}
          photoUrl={hasVideo ? null : photoUrl}
          hasVideo={hasVideo}
        />
      </Fold>

      {(checks.some((c) => c.level !== "ok") ||
        serverProblems.length > 0 ||
        serverWarnings.length > 0 ||
        pinterest.length > 0) && (
        <Fold
          title="Before it goes out"
          summary={beforeSummary}
          open={checks.some((c) => c.level === "blocked") || serverProblems.length > 0}
        >
          <section aria-label="Before it goes out" className="flex flex-col gap-2.5">
            <ul className="flex flex-col gap-2.5 text-sm">
              {checks.map((c) =>
                c.level === "ok" ? null : (
                  <li key={c.platform} className="flex items-start gap-2.5">
                    <PlatformMark platform={c.platform} size={22} />
                    <span className={c.level === "blocked" ? "text-danger" : "text-ink-2"}>
                      {c.message}
                      {c.level === "blocked"
                        ? c.message.endsWith("needs a photo or video.")
                          ? " Add one above, or untick it to post to the others."
                          : " Untick it to post to the others."
                        : ""}
                    </span>
                  </li>
                ),
              )}
              {pinterest.map((a) => {
                const board = boards[a.id] ?? a.pinterestBoard ?? null;
                return (
                  <li key={`board-${a.id}`} className="flex items-start gap-2.5">
                    <PlatformMark platform="pinterest" size={22} />
                    <span className="text-ink-2">
                      <b className="text-ink font-semibold">Pinterest</b>:{" "}
                      {board ? `pins to “${board.name}”.` : "pins to your first board."}{" "}
                      <button
                        type="button"
                        onClick={() => setBoardFor(a.id)}
                        className="action-link"
                      >
                        Change board
                      </button>
                    </span>
                  </li>
                );
              })}
              {serverProblems.map((p, i) => (
                <li key={`${p.platform}-${i}`} role="alert" className="flex items-start gap-2.5">
                  <PlatformMark platform={p.platform} size={22} />
                  <span className="text-danger">
                    <b className="font-semibold">{platformLabel(p.platform)}</b>: {p.message}
                  </span>
                </li>
              ))}
              {serverWarnings.map((w, i) => (
                <li key={`warn-${w.platform}-${i}`} className="flex items-start gap-2.5">
                  <PlatformMark platform={w.platform} size={22} />
                  <span className="text-ink-2">
                    <b className="text-ink font-semibold">{platformLabel(w.platform)}</b>:{" "}
                    {w.message}
                  </span>
                </li>
              ))}
            </ul>
            {boardFor && (
              <BoardPicker
                accountId={boardFor}
                username={accounts.find((a) => a.id === boardFor)?.username ?? null}
                onDone={(board) => {
                  if (board) setBoards((b) => ({ ...b, [boardFor]: board }));
                  setBoardFor(null);
                }}
              />
            )}
            <span className="text-ink-3 text-xs">
              Rules come from each platform. Waggle checks them before saving, so nothing fails
              later.
            </span>
          </section>
        </Fold>
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

      <Fold
        title="When"
        summary={
          when === "now"
            ? "Now"
            : when === "queue" && nextSlot
              ? `Next free slot · ${slotLabel(nextSlot)}`
              : (whenLabel(date, time) ?? "Pick a time")
        }
        open={state.field === "when"}
      >
        <fieldset className="flex flex-col gap-2">
          <legend className="sr-only">When</legend>
          <div className="segmented self-start" role="radiogroup">
            {(["now", "queue", "later"] as const).map((v) => (
              <label
                key={v}
                data-active={when === v || undefined}
                aria-disabled={v === "queue" && !nextSlot}
              >
                <input
                  type="radio"
                  name="when"
                  value={v}
                  checked={when === v}
                  disabled={v === "queue" && !nextSlot}
                  onChange={() => setWhen(v)}
                  className="sr-only"
                />
                {v === "now" ? "Now" : v === "queue" ? "Next free slot" : "Pick a time"}
              </label>
            ))}
          </div>
          {nextSlot ? (
            when === "queue" && (
              <p className="meta">
                Next free slot: {slotLabel(nextSlot)}.{" "}
                <a href="/posts/queue" className="link-inline">
                  Change posting times
                </a>
              </p>
            )
          ) : (
            <p className="meta">
              <a href="/posts/queue" className="link-inline">
                Set posting times
              </a>{" "}
              to post at your usual times with one tap.
            </p>
          )}
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
      </Fold>

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
              : when === "queue" && nextSlot
                ? `Add to queue · ${slotLabel(nextSlot)}`
                : `Schedule${whenLabel(date, time) ? ` for ${whenLabel(date, time)}` : ""}`}
        </Button>
        {state.outcome && (
          <p role="status" className="text-sm">
            {OUTCOME[state.outcome]}
          </p>
        )}
        {state.savedAt && state.warnings?.length ? (
          <ul className="text-ink-2 flex w-full flex-col gap-1 text-sm">
            {state.warnings.map((w, i) => (
              <li key={`saved-warn-${w.platform}-${i}`}>
                <b className="text-ink font-semibold">{platformLabel(w.platform)}</b>: {w.message}
              </li>
            ))}
          </ul>
        ) : null}
        {state.error && !state.field && (
          <p role="alert" className="text-danger text-sm">
            {state.error}
          </p>
        )}
      </div>
    </form>
  );
}

/**
 * One folded line of the composer (Posts composer, approved 16 Nov): the part's name, what's
 * chosen, and a chevron; it opens with a tap. Fields inside still submit while it's closed.
 */
function Fold({
  title,
  summary,
  open = false,
  children,
}: {
  title: string;
  summary: string;
  open?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details open={open || undefined} className="group border-line border-t">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 py-2 [&::-webkit-details-marker]:hidden">
        <span className="shrink-0 text-sm font-semibold">{title}</span>
        <span className="text-ink-3 min-w-0 flex-1 truncate text-sm">{summary}</span>
        <ChevronDown
          className="text-ink-3 size-4 shrink-0 transition-transform group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <div className="flex flex-col gap-3 pb-4">{children}</div>
    </details>
  );
}

const sizeLabel = (bytes: number) =>
  bytes >= 1024 ** 2
    ? `${(bytes / 1024 ** 2).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
