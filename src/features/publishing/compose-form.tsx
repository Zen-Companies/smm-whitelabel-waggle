"use client";

import { Camera, Check, ChevronDown } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { cn } from "cn";
import { EmptyCell } from "@/components/app/empty-spot";
import { StateLabel } from "@/components/app/state-mark";
import { PlatformMark } from "@/components/app/platform-mark";
import { Button } from "@/components/ui/button";
import { platformLabel } from "@/lib/social/platforms";
import { composePost, saveEditedPost, type ComposeState } from "./actions";
import type { BestChip } from "./best-chips";
import { ComposeModal } from "./compose-modal";
import { DateTimePicker, PickerShell } from "./date-time-picker";
import { POST_IMAGE_MAX_BYTES, POST_IMAGE_TYPES, POST_TEXT_MAX, YOUTUBE_TITLE_MAX } from "./limits";
import { checkPlatform, imageMaxBytesFor, needsConsent, textLimitFor } from "./post-rules";
import { BoardPicker } from "./board-picker";
import { PostOptionsFields } from "./post-options-fields";
import { ownText, textFor, type PostOptions } from "./post-options";
import { readVideoMeta, VideoField, type VideoState } from "./video-field";
import { OneDrivePicker } from "./onedrive-picker";
import { PreviewRow, type PlatformMedia } from "./post-preview";
import { CropSheet, type MadeCrop } from "./crop-sheet";
import { FitRow } from "./fit-row";
import { clock12, dayKeyIn, fromWallClock, wallClockIn } from "./post-time";
import {
  cropChoicesFor,
  fitFor,
  ONE_SHAPE_CHOICES,
  shapeFor,
  shapeLabel,
  type Fit,
  type MediaShape,
} from "./media-fit";

export interface ComposeAccount {
  id: string;
  platform: string;
  username: string | null;
  /** T64: the board pins go to; null = the account's first board. */
  pinterestBoard?: { id: string; name: string } | null;
}

/**
 * A post to start from (Posts Round 3): Edit fills the window in with the planned post, Duplicate
 * with a copy of any post (no time). Files are the post's own, reused on the server.
 */
export interface ComposeInitial {
  postId: string;
  text: string;
  media: {
    url: string;
    kind: "image" | "video";
    width: number | null;
    height: number | null;
    seconds: number | null;
  } | null;
  accountIds: string[];
  /** Per-platform choices, without files (crops come in `crops`). */
  options: PostOptions;
  /** Each platform's own crop of the photo. */
  crops: Partial<Record<string, { url: string; width: number; height: number }>>;
  youtubeTitle: string;
  /** Edit: the planned day and time (wall clock in the viewer's zone). */
  when: { day: string; time: string } | null;
}

export type ComposeMode = "new" | "edit" | "duplicate";

const OUTCOME: Record<NonNullable<ComposeState["outcome"]>, string> = {
  published: "Posted. It shows as published as soon as each platform confirms.",
  scheduled: "Scheduled. It's on the calendar.",
  waiting: "Saved. It goes out as soon as posting is possible again.",
  failed: "Saved, but it couldn't be posted. It's marked on the calendar.",
  updated: "Saved. The post is updated.",
};

/** "Sun 7:00 AM" for the Schedule button, so the owner sees exactly what will happen. */
function whenLabel(date: string, time: string): string {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return "";
  const weekday = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    weekday: "short",
    timeZone: "UTC",
  });
  return `${weekday} ${clock12(time)}`;
}

/** "Fri, Nov 27 · 9:00 AM" for the time field in the footer. */
function fieldLabel(date: string, time: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  return `${day} · ${clock12(time)}`;
}

/** "Mon 9:00 AM" for a queue slot, in the viewer's zone. */
function slotLabel(iso: string, timeZone: string): string {
  const { day, time } = wallClockIn(iso, timeZone);
  return whenLabel(day, time);
}

/** "4:5" for a crop's label ("Square" is 1:1). */
const ratioName = (w: number, h: number) => {
  const l = shapeLabel(w, h);
  return l === "Square" ? "1:1" : l.replace(/ (tall|wide)$/, "");
};

/**
 * What one post may carry to the server (next.config `serverActions.bodySizeLimit` is 6 MB),
 * with room for the text and options.
 */
const POST_BODY_MAX_BYTES = 5.5 * 1024 * 1024;

export interface ComposeFormProps {
  accounts: ComposeAccount[];
  /** T74a: the name the preview shows. */
  brandName?: string;
  /** T74a: accounts that stopped connecting, shown as "Reconnect to post here". */
  disconnected?: { platform: string; username: string | null }[];
  day?: string | null;
  time?: string | null;
  /** T75: the brand's next free posting time (ISO), or null when it has no posting times. */
  nextSlot?: string | null;
  /** Round 3: new, edit (Save changes) or duplicate (a new post from a copy). */
  mode?: ComposeMode;
  initial?: ComposeInitial | null;
  /** The window's title line and where × goes. */
  title: string;
  subtitle?: string;
  closeHref: string;
  /** After Save changes or a duplicate: the calendar with the post open (`&post=…&done=…`). */
  doneHref: string;
  /** The viewer's zone: times are picked and shown in it. */
  timeZone: string;
  /** Best-time chips for the picker, or null while Waggle learns them. */
  chips: BestChip[] | null;
  /** Days that already have a post (dots in the picker). */
  busyDays: string[];
}

/**
 * Compose a post: text, an optional photo or video (T63), accounts, now or on a day and time
 * (PRD F3, design v2), in the big window (Posts Round 3). `day` (YYYY-MM-DD) comes from clicking a
 * day on the calendar and preselects Schedule; `time` (HH:MM) from an Analytics best time.
 */
export function ComposeForm(props: ComposeFormProps) {
  const mode = props.mode ?? "new";
  const [state, action, pending] = useActionState<ComposeState, FormData>(
    mode === "edit" ? saveEditedPost : composePost,
    {},
  );
  const router = useRouter();
  // Edit and Duplicate land on the post itself, which says what happened (no toasts).
  useEffect(() => {
    if (!state.savedAt || mode === "new") return;
    const id = mode === "edit" ? props.initial?.postId : state.postId;
    if (id)
      router.push(`${props.doneHref}&post=${id}&done=${mode === "edit" ? "edited" : "copied"}`, {
        scroll: false,
      });
  }, [state.savedAt, state.postId, mode, props.initial?.postId, props.doneHref, router]);
  // A saved post changes savedAt, which remounts the fields: text, counter and time reset.
  return (
    <ComposeFields
      key={state.savedAt}
      {...props}
      mode={mode}
      // Once a new post is saved, the next one starts empty.
      initial={state.savedAt && mode === "new" ? null : (props.initial ?? null)}
      state={state}
      action={action}
      pending={pending}
    />
  );
}

function ComposeFields({
  accounts,
  day = null,
  time: initialTime = null,
  nextSlot = null,
  brandName = "",
  disconnected = [],
  mode,
  initial,
  title,
  subtitle,
  closeHref,
  timeZone,
  chips,
  busyDays,
  state,
  action,
  pending,
}: ComposeFormProps & {
  mode: ComposeMode;
  initial: ComposeInitial | null;
  state: ComposeState;
  action: (formData: FormData) => void;
  pending: boolean;
}) {
  const editing = mode === "edit";
  const today = dayKeyIn(new Date(), timeZone);
  const [when, setWhen] = useState<"now" | "queue" | "later">(editing || day ? "later" : "now");
  const [date, setDate] = useState(
    () => initial?.when?.day ?? day ?? dayKeyIn(new Date(Date.now() + 24 * 3_600_000), timeZone),
  );
  const [time, setTime] = useState(initial?.when?.time ?? initialTime ?? "09:00");
  const [picking, setPicking] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [text, setText] = useState(initial?.text ?? "");
  const length = text.length;
  // Per-platform choices (T75), here so each platform's own text is checked against its limit.
  const [options, setOptions] = useState<PostOptions>(initial?.options ?? {});
  const startImage = initial?.media?.kind === "image" ? initial.media : null;
  const startVideo = initial?.media?.kind === "video" ? initial.media : null;
  const fileName = (url: string) => decodeURIComponent(url.split("/").pop()?.split("?")[0] ?? "");
  const [photo, setPhoto] = useState<string | null>(
    startImage ? fileName(startImage.url) || "Photo" : null,
  );
  const [photoSize, setPhotoSize] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [dropError, setDropError] = useState<string | null>(null);
  const pickVideo = useRef<((file: File) => void) | null>(null);
  // T74a: a local link to the picked photo, for the preview only.
  const [photoUrl, setPhotoUrl] = useState<string | null>(startImage?.url ?? null);
  // T84c: a photo picked from OneDrive, already copied into media storage.
  const [drivePhoto, setDrivePhoto] = useState<{ url: string; size: number } | null>(null);
  const [video, setVideo] = useState<VideoState>(
    startVideo
      ? {
          step: "ready",
          name: fileName(startVideo.url) || "Video",
          size: 0,
          url: startVideo.url,
          seconds: startVideo.seconds,
          width: startVideo.width,
          height: startVideo.height,
        }
      : { step: "none" },
  );
  // Posts Round 2 ("How it fits"): the photo's size and type, each platform's own crop, one crop
  // for all, and which crop is open.
  const [photoDims, setPhotoDims] = useState<{ width: number; height: number } | null>(
    startImage?.width && startImage.height
      ? { width: startImage.width, height: startImage.height }
      : null,
  );
  const [photoMime, setPhotoMime] = useState<string | null>(null);
  const [crops, setCrops] = useState<Partial<Record<string, MadeCrop>>>({});
  // Round 3: the crops the post already has (kept on the server unless changed or removed).
  const [keptCrops, setKeptCrops] = useState<ComposeInitial["crops"]>(initial?.crops ?? {});
  const [allCrop, setAllCrop] = useState<MadeCrop | null>(null);
  const [cropping, setCropping] = useState<{ target: string; ratio?: number } | null>(null);
  const photoRun = useRef(0);
  // T64: boards chosen here (saved on the account), and whose picker is open.
  const [boards, setBoards] = useState<Record<string, { id: string; name: string }>>({});
  const [boardFor, setBoardFor] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>(() =>
    initial
      ? accounts.filter((a) => initial.accountIds.includes(a.id)).map((a) => a.id)
      : accounts.map((a) => a.id),
  );
  // A started post's photo size, read once (older posts kept none).
  useEffect(() => {
    if (!startImage || (startImage.width && startImage.height)) return;
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth && img.naturalHeight) {
        setPhotoDims((d) => d ?? { width: img.naturalWidth, height: img.naturalHeight });
      }
    };
    img.src = startImage.url;
  }, [startImage]);
  const pinterest = accounts.filter((a) => a.platform === "pinterest" && picked.includes(a.id));
  const hasVideo = video.step === "ready" || video.step === "uploading";
  const hasMedia = !!photo || hasVideo;
  // Round 3: the post's own file is still the one in use (never sent again from the browser).
  const currentUrl = hasVideo
    ? video.step === "ready"
      ? video.url
      : null
    : allCrop
      ? null
      : (drivePhoto?.url ?? photoUrl);
  const keepMedia = !!initial?.media && currentUrl === initial.media.url;
  /** A new photo starts with no crops; its size is read by the browser for "How it fits". */
  const startPhoto = (url: string | null, mime: string | null) => {
    for (const c of [...Object.values(crops), allCrop]) if (c) URL.revokeObjectURL(c.url);
    setCrops({});
    setKeptCrops({});
    setAllCrop(null);
    setCropping(null);
    setPhotoMime(mime);
    setPhotoDims(null);
    const id = ++photoRun.current;
    if (!url) return;
    const img = new Image();
    img.onload = () => {
      if (id === photoRun.current && img.naturalWidth && img.naturalHeight) {
        setPhotoDims({ width: img.naturalWidth, height: img.naturalHeight });
      }
    };
    img.src = url;
  };
  /** A photo from the device (or null to clear it), from the picker, Replace, Remove or a drop. */
  const choosePhoto = (file: File | null) => {
    setDropError(null);
    setDirty(true);
    if (!file) {
      const input = document.getElementById("post-image") as HTMLInputElement | null;
      if (input) input.value = "";
    }
    setPhoto(file?.name ?? null);
    setPhotoSize(file?.size ?? null);
    setDrivePhoto(null);
    const url = file ? URL.createObjectURL(file) : null;
    setPhotoUrl((old) => {
      if (old?.startsWith("blob:")) URL.revokeObjectURL(old);
      return url;
    });
    startPhoto(url, file?.type ?? null);
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
  // "How it fits": each picked platform's file (its own crop, the crop for all, or the original).
  const sharedShape: MediaShape | null =
    hasVideo && video.width && video.height
      ? { kind: "video", width: video.width, height: video.height, seconds: video.seconds }
      : photo && !hasVideo
        ? allCrop
          ? { kind: "image", width: allCrop.width, height: allCrop.height }
          : photoDims
            ? { kind: "image", ...photoDims }
            : null
        : null;
  const cropSizes = Object.fromEntries([
    ...Object.entries(keptCrops).flatMap(([p, c]) =>
      c ? [[p, { width: c.width, height: c.height }]] : [],
    ),
    ...Object.entries(crops).flatMap(([p, c]) =>
      c ? [[p, { width: c.width, height: c.height }]] : [],
    ),
  ]);
  const fits: Partial<Record<string, Fit | null>> = Object.fromEntries(
    pickedPlatforms.map((p) => {
      const shape = shapeFor(p, sharedShape, cropSizes);
      return [p, shape ? fitFor(p, shape, options[p]?.as) : null];
    }),
  );
  const refused = pickedPlatforms.filter((p) => fits[p]?.level === "refused");
  const mediaFor = (p: string): PlatformMedia | null => {
    if (hasVideo) return { src: null, shape: sharedShape };
    if (!photo) return null;
    const own = crops[p] ?? keptCrops[p];
    if (own) {
      return { src: own.url, shape: { kind: "image", width: own.width, height: own.height } };
    }
    return { src: allCrop?.url ?? photoUrl, shape: sharedShape };
  };
  // What the post carries to the server: the photo (or the crop for all) and the crops in use.
  const usedCrops = pickedPlatforms.flatMap((p) => {
    const c = crops[p];
    return c ? [[p, c] as const] : [];
  });
  const usedKept = keepMedia ? pickedPlatforms.filter((p) => keptCrops[p] && !crops[p]) : [];
  const shownCrops = Object.fromEntries([
    ...Object.entries(keptCrops).flatMap(([p, c]) =>
      c ? [[p, { label: ratioName(c.width, c.height) }]] : [],
    ),
    ...Object.entries(crops).flatMap(([p, c]) => (c ? [[p, c]] : [])),
  ]);
  const bodyBytes =
    (allCrop ? allCrop.file.size : drivePhoto || keepMedia ? 0 : (photoSize ?? 0)) +
    usedCrops.reduce((sum, [, c]) => sum + c.file.size, 0);
  const tooBig = usedCrops.length > 0 && bodyBytes > POST_BODY_MAX_BYTES;
  const cropTarget = cropping?.target ?? null;
  const cropChoices =
    cropTarget === "all"
      ? ONE_SHAPE_CHOICES
      : cropTarget
        ? cropChoicesFor(cropTarget, options[cropTarget]?.as)
        : [];
  const editingCrop = cropTarget === "all" ? allCrop : cropTarget ? crops[cropTarget] : null;
  const cropStart =
    editingCrop && (cropping?.ratio === undefined || cropping.ratio === editingCrop.ratio)
      ? { ratio: editingCrop.ratio, zoom: editingCrop.zoom, cx: editingCrop.cx, cy: editingCrop.cy }
      : { ratio: cropping?.ratio ?? cropChoices[0]?.ratio ?? 1 };

  const serverProblems = state.problems ?? [];
  // Zernio's notes: before saving they sit in "Before it goes out"; once saved, by the outcome.
  const serverWarnings = state.savedAt ? [] : (state.warnings ?? []);
  // The caption's counter: the shortest limit among platforms that use the caption.
  const followers = pickedPlatforms.filter((p) => ownText(options[p], text) === null);
  const limit = textLimitFor(followers, POST_TEXT_MAX);
  const imageMb =
    Math.round(imageMaxBytesFor(pickedPlatforms, POST_IMAGE_MAX_BYTES) / 100_000) / 10;
  // Day and time are wall clock in the viewer's zone; sent as an absolute ISO time.
  const at = date && time ? fromWallClock(date, time, timeZone) : null;
  const scheduledFor = at && !Number.isNaN(at.getTime()) ? at.toISOString() : "";
  const fieldError = (field: ComposeState["field"]) =>
    state.field === field && state.error ? (
      <p role="alert" className="text-danger text-sm">
        {state.error}
      </p>
    ) : null;

  const issues =
    checks.filter((c) => c.level !== "ok").length + serverProblems.length + serverWarnings.length;
  const blockedCount =
    checks.filter((c) => c.level === "blocked").length + serverProblems.length + refused.length;
  const beforeSummary = issues
    ? issues === 1
      ? "1 to check"
      : `${issues} to check`
    : `All good · ${picked.length} account${picked.length === 1 ? "" : "s"}`;
  const showBefore =
    checks.some((c) => c.level !== "ok") ||
    serverProblems.length > 0 ||
    serverWarnings.length > 0 ||
    pinterest.length > 0;
  const submitLabel = pending
    ? "Saving…"
    : editing
      ? "Save changes"
      : when === "now"
        ? "Post now"
        : when === "queue" && nextSlot
          ? `Add to queue · ${slotLabel(nextSlot, timeZone)}`
          : `Schedule${whenLabel(date, time) ? ` for ${whenLabel(date, time)}` : ""}`;

  return (
    <ComposeModal
      title={title}
      subtitle={subtitle}
      closeHref={closeHref}
      dirty={dirty}
      holdEscape={!!cropping || picking || !!boardFor}
    >
      <form
        action={action}
        onChange={() => setDirty(true)}
        // Submitted by hand so React doesn't reset the fields: a refused post keeps everything the
        // owner typed and attached (a saved one remounts the form through savedAt instead).
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          // Posts Round 2: the crop for all replaces the photo; each platform's own crop goes as
          // its own file; the sizes let the server check how it fits too.
          if (allCrop) {
            data.set("image", allCrop.file);
            data.delete("imageUrl");
            data.delete("imageSize");
          }
          for (const [p, c] of usedCrops) data.set(`crop_${p}`, c.file);
          if (sharedShape) {
            data.set(
              "mediaShape",
              JSON.stringify({
                width: sharedShape.width,
                height: sharedShape.height,
                crops: Object.fromEntries(
                  usedCrops.map(([p, c]) => [p, { width: c.width, height: c.height }]),
                ),
              }),
            );
          }
          startTransition(() => action(data));
        }}
        className="flex min-h-0 flex-1 flex-col"
      >
        {editing && initial && <input type="hidden" name="postId" value={initial.postId} />}
        {mode === "duplicate" && initial && (
          <input type="hidden" name="fromPostId" value={initial.postId} />
        )}
        {keepMedia && <input type="hidden" name="keepMedia" value="1" />}
        {usedKept.length > 0 && (
          <input type="hidden" name="keepCrops" value={JSON.stringify(usedKept)} />
        )}
        <input type="hidden" name="when" value={when} />
        {when === "later" && <input type="hidden" name="scheduledFor" value={scheduledFor} />}

        <div className="min-h-0 flex-1 overflow-y-auto lg:grid lg:grid-cols-[44fr_56fr] lg:overflow-hidden">
          <div className="flex min-w-0 flex-col gap-4 p-5 lg:overflow-y-auto">
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
                {limit < POST_TEXT_MAX && followers.length > 1
                  ? " (the shortest of your picks)"
                  : ""}
              </p>
              {fieldError("content")}
            </div>

            {/* Photo or video (Posts media, approved 16 Nov): one drop zone; once something is
                added it becomes that file. A post carries a photo or a video, not both. */}
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
                        dragging
                          ? "border-honey bg-honey-tint"
                          : "border-line-strong bg-honey-tint/40",
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
                        Photo
                        {photoDims ? ` · ${shapeLabel(photoDims.width, photoDims.height)}` : ""}
                        {photoSize ? ` · ${sizeLabel(photoSize)}` : ""} ·{" "}
                        {keepMedia
                          ? "from this post"
                          : drivePhoto
                            ? "from OneDrive"
                            : "from this device"}
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
                    hasMedia
                      ? "flex flex-col gap-2"
                      : "flex flex-wrap items-center justify-center gap-2"
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
                      onChange={(v) => {
                        setDirty(true);
                        setVideo(v);
                      }}
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
                        setDirty(true);
                        if (pick.use === "image") {
                          const file = document.getElementById(
                            "post-image",
                          ) as HTMLInputElement | null;
                          if (file) file.value = "";
                          setPhoto(pick.name);
                          setPhotoSize(pick.size);
                          setDrivePhoto({ url: pick.url, size: pick.size });
                          setPhotoUrl(pick.url);
                          startPhoto(pick.url, null);
                        } else {
                          setVideo({
                            step: "ready",
                            name: pick.name,
                            size: pick.size,
                            seconds: null,
                            width: null,
                            height: null,
                            url: pick.url,
                          });
                          // Its length and shape, read from the copied file for "How it fits".
                          void readVideoMeta(pick.url).then((meta) =>
                            setVideo((v) =>
                              v.step === "ready" && v.url === pick.url ? { ...v, ...meta } : v,
                            ),
                          );
                        }
                      }}
                    />
                  )}
                </div>
                {!hasMedia && (
                  <>
                    <span className="text-ink-3 text-xs">
                      Photo: JPG, PNG or WebP, up to {imageMb} MB · Video: MP4, MOV or WebM · One or
                      the other, not both
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

            {sharedShape && (
              <FitRow
                platforms={pickedPlatforms}
                accountCount={picked.length}
                fits={fits}
                options={options}
                mediaFor={mediaFor}
                shared={sharedShape}
                crops={shownCrops}
                allCrop={allCrop}
                onCrop={(p) => setCropping({ target: p })}
                onRemoveCrop={(p) => {
                  setDirty(true);
                  setKeptCrops((k) =>
                    Object.fromEntries(Object.entries(k).filter(([key]) => key !== p)),
                  );
                  setCrops((c) => {
                    const old = c[p];
                    if (old) URL.revokeObjectURL(old.url);
                    return Object.fromEntries(Object.entries(c).filter(([k]) => k !== p));
                  });
                }}
                onStory={(p) => setOptions((o) => ({ ...o, [p]: { ...o[p], as: "story" } }))}
                onLeaveOut={(p) =>
                  setPicked((ids) =>
                    ids.filter((id) => accounts.find((a) => a.id === id)?.platform !== p),
                  )
                }
                onAllShape={(choice) => {
                  if (choice) {
                    setCropping({ target: "all", ratio: choice.ratio });
                    return;
                  }
                  if (allCrop) URL.revokeObjectURL(allCrop.url);
                  setAllCrop(null);
                }}
              />
            )}
            {tooBig && (
              <p role="alert" className="text-danger text-sm">
                The photo and its crops are too big to send together. Remove a crop, or use a
                smaller photo.
              </p>
            )}
            {cropping && photoUrl && photoDims && (
              <CropSheet
                key={`${cropping.target}-${cropping.ratio ?? ""}`}
                title={
                  cropping.target === "all"
                    ? "One shape for all"
                    : `Crop for ${platformLabel(cropping.target)}`
                }
                note={
                  cropping.target === "all"
                    ? "The crop is made here and posted to every account in place of the original. Original puts it back."
                    : `The crop is made here and posted only to ${platformLabel(cropping.target)}. The original still goes to the others.`
                }
                src={photoUrl}
                width={photoDims.width}
                height={photoDims.height}
                mime={photoMime}
                choices={cropChoices}
                start={cropStart}
                onCancel={() => setCropping(null)}
                onUse={(made) => {
                  const target = cropping.target;
                  setCropping(null);
                  setDirty(true);
                  if (target === "all") {
                    for (const c of [...Object.values(crops), allCrop])
                      if (c) URL.revokeObjectURL(c.url);
                    setCrops({});
                    setKeptCrops({});
                    setAllCrop(made);
                    return;
                  }
                  setKeptCrops((k) =>
                    Object.fromEntries(Object.entries(k).filter(([key]) => key !== target)),
                  );
                  setCrops((c) => {
                    const old = c[target];
                    if (old) URL.revokeObjectURL(old.url);
                    return { ...c, [target]: made };
                  });
                }}
              />
            )}

            <fieldset className="border-line flex flex-col gap-2 border-t pt-3">
              <legend className="float-left mb-1 text-sm font-semibold">Post to</legend>
              {accounts.length === 0 && (
                <p className="text-ink-3 text-sm">Connect an account in Settings first.</p>
              )}
              {/* Account tiles (approved 16 Nov, option A): tap to pick; picked is honey with a
                  check, unpicked goes grey. The checkbox stays (hidden) for the form and screen
                  readers. */}
              <div className="clear-left grid grid-cols-1 gap-2 sm:grid-cols-2">
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
                        <span className="text-ink-3 truncate text-xs">
                          @{a.username ?? "account"}
                        </span>
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

            <Fold
              title="Options"
              summary={
                Object.entries(options).some(([p, o]) => o?.text && pickedPlatforms.includes(p))
                  ? `${Object.entries(options)
                      .filter(([p, o]) => o?.text && pickedPlatforms.includes(p))
                      .map(([p]) => platformLabel(p))
                      .join(", ")} has its own text`
                  : "Extras for each app, all optional"
              }
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
                    defaultValue={initial?.youtubeTitle ?? ""}
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

            {showBefore && (
              <section
                id="before-it-goes-out"
                aria-label="Before it goes out"
                tabIndex={-1}
                className="border-line flex flex-col gap-2.5 border-t pt-3"
              >
                <h3 className="text-sm font-semibold">Before it goes out</h3>
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
                    <li
                      key={`${p.platform}-${i}`}
                      role="alert"
                      className="flex items-start gap-2.5"
                    >
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
            )}
          </div>

          <div className="border-line bg-subtle/50 flex min-w-0 flex-col gap-3 border-t p-5 lg:overflow-y-auto lg:border-t-0 lg:border-l">
            <PreviewRow
              platforms={pickedPlatforms}
              brandName={brandName}
              text={text}
              options={options}
              mediaFor={mediaFor}
            />
          </div>
        </div>

        <footer className="border-line bg-surface relative flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-t px-5 py-3 pb-[max(12px,env(safe-area-inset-bottom))]">
          <fieldset className="flex flex-wrap items-center gap-2">
            <legend className="sr-only">When</legend>
            <span className="text-sm font-semibold" aria-hidden>
              When
            </span>
            {!editing && (
              <div className="segmented" role="radiogroup" aria-label="When">
                {(["now", "queue", "later"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    role="radio"
                    aria-checked={when === v}
                    data-active={when === v || undefined}
                    disabled={v === "queue" && !nextSlot}
                    title={v === "queue" && !nextSlot ? "Set posting times to use this" : undefined}
                    onClick={() => {
                      setWhen(v);
                      setPicking(v === "later");
                    }}
                    className="disabled:opacity-50"
                  >
                    {v === "now" ? "Now" : v === "queue" ? "Next free slot" : "Pick a time"}
                  </button>
                ))}
              </div>
            )}
            {when === "later" && (
              <button
                type="button"
                aria-haspopup="dialog"
                aria-expanded={picking}
                onClick={() => setPicking((p) => !p)}
                className="field inline-flex min-h-10 w-auto items-center gap-2 tabular-nums"
              >
                {fieldLabel(date, time)}
                <ChevronDown className="text-ink-3 size-4" aria-hidden />
              </button>
            )}
            {when === "queue" && nextSlot && (
              <span className="meta">
                {slotLabel(nextSlot, timeZone)} ·{" "}
                <a href="/posts/queue" className="link-inline">
                  Change posting times
                </a>
              </span>
            )}
            {!nextSlot && !editing && when !== "later" && (
              <span className="meta">
                <a href="/posts/queue" className="link-inline">
                  Set posting times
                </a>{" "}
                to post at your usual times with one tap.
              </span>
            )}
            {fieldError("when")}
          </fieldset>
          {picking && (
            <PickerShell
              placement="popover"
              onDismiss={() => setPicking(false)}
              label="Pick a time"
            >
              <DateTimePicker
                start={{ day: date, time }}
                today={today}
                timeZone={timeZone}
                chips={chips}
                busyDays={busyDays}
                verb="Use"
                title="Pick a time"
                onCancel={() => setPicking(false)}
                onPick={(d, t) => {
                  setDate(d);
                  setTime(t);
                  setWhen("later");
                  setPicking(false);
                  setDirty(true);
                }}
              />
            </PickerShell>
          )}
          {pickedPlatforms.length > 0 && (
            <a
              href="#before-it-goes-out"
              onClick={(e) => {
                const el = document.getElementById("before-it-goes-out");
                if (!el) return e.preventDefault();
              }}
              className={cn(
                "text-sm",
                blockedCount ? "text-danger" : issues ? "text-honey-text" : "text-ink-2",
              )}
            >
              <span className="font-semibold">Before it goes out</span> {beforeSummary}
            </a>
          )}
          <div className="ml-auto flex flex-wrap items-center justify-end gap-3">
            {state.outcome && (
              <p role="status" className="text-sm">
                {OUTCOME[state.outcome]}
              </p>
            )}
            {state.savedAt && state.warnings?.length ? (
              <ul className="text-ink-2 flex w-full flex-col gap-1 text-sm">
                {state.warnings.map((w, i) => (
                  <li key={`saved-warn-${w.platform}-${i}`}>
                    <b className="text-ink font-semibold">{platformLabel(w.platform)}</b>:{" "}
                    {w.message}
                  </li>
                ))}
              </ul>
            ) : null}
            {state.error && !state.field && (
              <p role="alert" className="text-danger text-sm">
                {state.error}
              </p>
            )}
            <Button
              type="submit"
              variant="primary"
              disabled={
                pending ||
                video.step === "uploading" ||
                picked.length === 0 ||
                checks.some((c) => c.level === "blocked") ||
                refused.length > 0 ||
                tooBig
              }
            >
              {submitLabel}
            </Button>
          </div>
        </footer>
      </form>
    </ComposeModal>
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
