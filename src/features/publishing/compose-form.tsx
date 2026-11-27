"use client";

import { Camera, Check, ChevronDown, Film } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { cn } from "cn";
import { EmptyCell } from "@/components/app/empty-spot";
import { StateLabel } from "@/components/app/state-mark";
import { PlatformMark } from "@/components/app/platform-mark";
import { Button } from "@/components/ui/button";
import { platformLabel } from "@/lib/social/platforms";
import { composePost, saveEditedPost, uploadPostPhoto, type ComposeState } from "./actions";
import type { BestChip } from "./best-chips";
import {
  CAROUSEL_MAX,
  carouselRules,
  moveItem,
  platformSet,
  setLabel,
  type PlatformSet,
} from "./carousel";
import { PhotoChooser } from "./photo-chooser";
import { ComposeModal } from "./compose-modal";
import { DateTimePicker, PickerShell } from "./date-time-picker";
import {
  POST_IMAGE_MAX_BYTES,
  POST_IMAGE_TYPES,
  POST_TEXT_MAX,
  POST_VIDEO_TYPES,
  YOUTUBE_TITLE_MAX,
} from "./limits";
import {
  checkPlatform,
  imageMaxBytesFor,
  needsConsent,
  textLimitFor,
  type RuleCheck,
} from "./post-rules";
import { BoardPicker } from "./board-picker";
import { PostOptionsFields } from "./post-options-fields";
import { ownText, textFor, type PostOptions } from "./post-options";
import { readVideoMeta, uploadVideoFile } from "./video-field";
import { OneDrivePicker } from "./onedrive-picker";
import { PreviewRow, type PlatformMedia } from "./post-preview";
import { CropSheet, type MadeCrop } from "./crop-sheet";
import { FitRow } from "./fit-row";
import { WriteWithWaggle } from "./write-with-waggle";
import { RepeatFields } from "./repeat-fields";
import { repeatChoiceProblem, type RepeatEnds, type RepeatEvery } from "./repeat-rule";
import { GoogleFields } from "./google-fields";
import { googleProblems } from "./google-post";
import { MediaStrip, type StripItem } from "./media-strip";
import { clock12, dayKeyIn, fromWallClock, wallClockIn } from "./post-time";
import {
  cropChoicesFor,
  fitFor,
  ONE_SHAPE_CHOICES,
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
  /** Round 4: every photo and video, in order (the first is the cover). */
  media: {
    url: string;
    kind: "image" | "video";
    width: number | null;
    height: number | null;
    seconds: number | null;
  }[];
  accountIds: string[];
  /** Per-platform choices, without files (crops come in `crops`). */
  options: PostOptions;
  /** Each platform's own crops, by the photo's place in `media`. */
  crops: Partial<
    Record<string, Partial<Record<number, { url: string; width: number; height: number }>>>
  >;
  youtubeTitle: string;
  /** Edit: the planned day and time (wall clock in the viewer's zone). */
  when: { day: string; time: string } | null;
  /** Round 5, Edit: the post repeats ("Every week on Friday at 9:00 AM"); asks how far an edit goes. */
  repeat?: { label: string } | null;
}

export type ComposeMode = "new" | "edit" | "duplicate";

const OUTCOME: Record<NonNullable<ComposeState["outcome"]>, string> = {
  published: "Posted. It shows as published as soon as each platform confirms.",
  scheduled: "Scheduled. It's on the calendar.",
  waiting: "Saved. It goes out as soon as posting is possible again.",
  failed: "Saved, but it couldn't be posted. It's marked on the calendar.",
  updated: "Saved. The post is updated.",
  repeating: "Scheduled, and it repeats. Each next one is planned once the last goes out.",
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

/** One of the post's files in the composer (Posts Round 4: a post carries up to 20). */
interface Item extends StripItem {
  /** The link in media storage once uploaded (or the post's own file). */
  url: string | null;
  size: number | null;
  mime: string | null;
  width: number | null;
  height: number | null;
  origin: "post" | "device" | "onedrive";
}

/** A platform's crop of one photo: made here (a file to upload) or one the post already had. */
type Crop = {
  src: string;
  width: number;
  height: number;
  label: string;
  /** Set once uploaded (or for a crop the post already had). */
  url: string | null;
  made: MadeCrop | null;
};

let itemSeq = 0;
const newKey = () => `f${(itemSeq += 1)}`;

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
  /** Round 4: the business phone from Business info (Google's Call now), or null. */
  businessPhone?: string | null;
}

/**
 * Compose a post: text, photos and videos (T63; Round 4: up to 20, a carousel), accounts, now or
 * on a day and time (PRD F3, design v2), in the big window (Posts Round 3). `day` (YYYY-MM-DD)
 * comes from clicking a day on the calendar and preselects Schedule; `time` (HH:MM) from an
 * Analytics best time.
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
  businessPhone = null,
  state,
  action,
  pending: actionPending,
}: ComposeFormProps & {
  mode: ComposeMode;
  initial: ComposeInitial | null;
  state: ComposeState;
  action: (formData: FormData) => void;
  pending: boolean;
}) {
  const editing = mode === "edit";
  const today = dayKeyIn(new Date(), timeZone);
  const [when, setWhen] = useState<"now" | "queue" | "later" | "repeat">(
    editing || day ? "later" : "now",
  );
  // Round 5: how a repeat goes on (its first time is the picked day and time).
  const [repeat, setRepeat] = useState<{
    every: RepeatEvery;
    ends: RepeatEnds;
    endDate: string;
    count: number;
  }>({ every: "week", ends: "never", endDate: "", count: 4 });
  const [repeatScope, setRepeatScope] = useState<"one" | "following">("one");
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
  const fileName = (url: string) => decodeURIComponent(url.split("/").pop()?.split("?")[0] ?? "");
  // Round 4: the post's files in order, each uploaded as soon as it's added.
  const [items, setItems] = useState<Item[]>(() =>
    (initial?.media ?? []).map((m) => ({
      key: newKey(),
      kind: m.kind,
      src: m.kind === "image" ? m.url : null,
      name: fileName(m.url) || (m.kind === "video" ? "Video" : "Photo"),
      status: "ready",
      progress: 100,
      error: null,
      seconds: m.seconds,
      url: m.url,
      size: null,
      mime: null,
      width: m.width,
      height: m.height,
      origin: "post",
    })),
  );
  const live = useRef(new Set(items.map((i) => i.key)));
  const [dragging, setDragging] = useState(false);
  const [dropError, setDropError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const pending = actionPending || sending;
  // Posts Round 2 ("How it fits") and 4: each platform's own crop of each photo (by the file's
  // key), one crop for all (a single photo only), and which crop is open.
  const [crops, setCrops] = useState<Partial<Record<string, Record<string, Crop>>>>(() =>
    Object.fromEntries(
      Object.entries(initial?.crops ?? {}).map(([p, byIndex]) => [
        p,
        Object.fromEntries(
          Object.entries(byIndex ?? {}).flatMap(([i, c]) => {
            const key = items[Number(i)]?.key;
            return key && c
              ? [
                  [
                    key,
                    {
                      src: c.url,
                      width: c.width,
                      height: c.height,
                      label: ratioName(c.width, c.height),
                      url: c.url,
                      made: null,
                    } satisfies Crop,
                  ],
                ]
              : [];
          }),
        ),
      ]),
    ),
  );
  const [allCrop, setAllCrop] = useState<MadeCrop | null>(null);
  const [cropping, setCropping] = useState<{
    target: string;
    ratio?: number;
    /** The photo open in the sheet (its key), for a platform's set. */
    at?: string;
    /** Crops made with Next photo, kept until Use these crops. */
    made?: Record<string, MadeCrop>;
  } | null>(null);
  // T64: boards chosen here (saved on the account), and whose picker is open.
  const [boards, setBoards] = useState<Record<string, { id: string; name: string }>>({});
  const [boardFor, setBoardFor] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>(() =>
    initial
      ? accounts.filter((a) => initial.accountIds.includes(a.id)).map((a) => a.id)
      : accounts.map((a) => a.id),
  );
  // A started post's photo sizes, read once (older posts kept none).
  useEffect(() => {
    for (const it of items) {
      if (it.kind !== "image" || !it.src || (it.width && it.height)) continue;
      const img = new Image();
      img.onload = () => {
        if (!img.naturalWidth || !img.naturalHeight) return;
        setItems((list) =>
          list.map((x) =>
            x.key === it.key && !(x.width && x.height)
              ? { ...x, width: img.naturalWidth, height: img.naturalHeight }
              : x,
          ),
        );
      };
      img.src = it.src;
    }
    // Only for the files the window opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pinterest = accounts.filter((a) => a.platform === "pinterest" && picked.includes(a.id));
  const hasVideo = items.some((i) => i.kind === "video");
  const hasMedia = items.length > 0;
  const photoCount = items.filter((i) => i.kind === "image").length;
  const uploading = items.some((i) => i.status === "uploading");
  const failedFiles = items.some((i) => i.status === "error");
  // What each ticked platform will do with this post (design v3 "Before it goes out").
  const pickedPlatforms = [
    ...new Set(accounts.filter((a) => picked.includes(a.id)).map((a) => a.platform)),
  ];
  const imageMax = imageMaxBytesFor(pickedPlatforms, POST_IMAGE_MAX_BYTES);
  const imageMb = Math.round(imageMax / 100_000) / 10;
  // Round 4: which of the files each platform takes (trimmed with a note; blocked only when none).
  const kinds = items.map((i) => i.kind);
  const sets: Record<string, PlatformSet> = Object.fromEntries(
    pickedPlatforms.map((p) => [p, platformSet(p, kinds, options[p]?.as, options[p]?.pick)]),
  );
  // Round 5: Facebook takes 10 photos; with more, the owner chooses which ("10 of 14 · Choose").
  const [choosingFor, setChoosingFor] = useState<string | null>(null);
  const choosable = (p: string) =>
    p === "facebook" &&
    (options[p]?.as ?? "post") === "post" &&
    photoCount > carouselRules(p).photos;
  const chooseLabels: Partial<Record<string, string>> = Object.fromEntries(
    pickedPlatforms
      .filter(choosable)
      .map((p) => [
        p,
        `${sets[p].indices.filter((i) => items[i].kind === "image").length} of ${photoCount} · Choose`,
      ]),
  );
  /** A choice of photos is by place: moving or removing one starts it over. */
  const dropPicks = () =>
    setOptions((o) =>
      Object.fromEntries(
        Object.entries(o).map(([p, v]) => [
          p,
          v && Object.fromEntries(Object.entries(v).filter(([k]) => k !== "pick")),
        ]),
      ),
    );
  const single = items.length === 1 && items[0].kind === "image";
  /** One file's shape as one platform gets it: its crop there, the crop for all, or the file. */
  const shapeOf = (p: string, i: number): MediaShape | null => {
    const it = items[i];
    const crop = it.kind === "image" ? crops[p]?.[it.key] : undefined;
    if (crop) return { kind: "image", width: crop.width, height: crop.height };
    if (allCrop && single) return { kind: "image", width: allCrop.width, height: allCrop.height };
    return it.width && it.height
      ? { kind: it.kind, width: it.width, height: it.height, seconds: it.seconds }
      : null;
  };
  const srcOf = (p: string, i: number): string | null => {
    const it = items[i];
    if (it.kind !== "image") return null;
    return crops[p]?.[it.key]?.src ?? (allCrop && single ? allCrop.url : it.src);
  };
  const checks: RuleCheck[] = pickedPlatforms.map((p) => {
    const set = sets[p];
    if (set.blocked) return { platform: p, level: "blocked", message: set.blocked };
    const sent = set.indices.map((i) => items[i]);
    const videos = sent.filter((i) => i.kind === "video");
    return checkPlatform(p, {
      // The text that really goes there: its own when the owner wrote one, else the caption.
      textLength: textFor(p, options, text).length,
      images: sent.length - videos.length,
      videos: videos.length,
      videoSeconds: videos[0]?.seconds ?? null,
    });
  });
  // "How it fits": every file each platform takes, in its own shape there; and what it leaves out.
  const fitOf = (p: string): Fit | null => {
    const set = sets[p];
    if (!items.length || set.blocked) return null;
    const as = options[p]?.as;
    const each = set.indices.flatMap((i) => {
      const shape = shapeOf(p, i);
      const fit = shape ? fitFor(p, shape, as) : null;
      return fit ? [{ i, fit }] : [];
    });
    const refused = each.find((f) => f.fit.level === "refused");
    const name = (i: number) => (items.length > 1 ? `Photo ${i + 1}: ` : "");
    if (refused) return { ...refused.fit, message: `${name(refused.i)}${refused.fit.message}` };
    const crop = each.some((f) => f.fit.fixes.includes("crop")) ? (["crop"] as const) : [];
    if (set.note) return { platform: p, level: "trims", message: set.note, fixes: [...crop] };
    const trims = each.find((f) => f.fit.level === "trims");
    if (trims) return { ...trims.fit, message: `${name(trims.i)}${trims.fit.message}` };
    if (!each.length)
      return items.length > 1
        ? { platform: p, level: "fits", message: "Fits as is", fixes: [] }
        : null;
    return each[0].fit.message !== "Fits as is" && items.length === 1
      ? each[0].fit
      : { platform: p, level: "fits", message: "Fits as is", fixes: [] };
  };
  const fits: Partial<Record<string, Fit | null>> = Object.fromEntries(
    pickedPlatforms.map((p) => [p, fitOf(p)]),
  );
  const details: Partial<Record<string, string>> =
    items.length > 1
      ? Object.fromEntries(
          pickedPlatforms.map((p) => {
            const sent = sets[p].indices.map((i) => items[i].kind);
            const how = sent.length < 2 ? "" : p === "facebook" ? ", shown as a grid" : ", swipe";
            return [p, sent.length ? `${setLabel(sent)}${how}` : "Nothing goes"];
          }),
        )
      : {};
  const refused = pickedPlatforms.filter((p) => fits[p]?.level === "refused");
  const mediaFor = (p: string): PlatformMedia | null => {
    const set = sets[p];
    if (!set || !set.indices.length) return null;
    const files = set.indices.map((i) => ({ src: srcOf(p, i), shape: shapeOf(p, i) }));
    return { ...files[0], ...(files.length > 1 ? { set: files } : {}) };
  };
  // The crops in use, per platform (only on photos that platform takes).
  const usedCrops = (p: string): [number, Crop][] =>
    sets[p]
      ? sets[p].indices.flatMap((i) => {
          const c = items[i].kind === "image" ? crops[p]?.[items[i].key] : undefined;
          return c ? [[i, c] as [number, Crop]] : [];
        })
      : [];
  const shownCrops = Object.fromEntries(
    pickedPlatforms.flatMap((p) => {
      const used = usedCrops(p);
      if (!used.length) return [];
      const photos = sets[p].indices.filter((i) => items[i].kind === "image").length;
      const label =
        photos > 1 ? `${used[0][1].label} · ${used.length} of ${photos} photos` : used[0][1].label;
      return [[p, { label }]];
    }),
  );
  // Too big for a platform picked after the photo was added (Bluesky takes 1 MB).
  const oversized = items.findIndex((i) => i.kind === "image" && (i.size ?? 0) > imageMax);
  // Google's offer, event and button (Round 4).
  const googleIssues = pickedPlatforms.includes("googlebusiness")
    ? googleProblems(options.googlebusiness?.google, businessPhone)
    : [];
  const googleAccount = accounts.find(
    (a) => a.platform === "googlebusiness" && picked.includes(a.id),
  );

  // The crop sheet: one platform's photos one after another (Next photo), or the crop for all.
  const cropTarget = cropping?.target ?? null;
  const cropPhotos =
    cropTarget && cropTarget !== "all"
      ? (sets[cropTarget]?.indices ?? []).filter((i) => items[i].kind === "image" && items[i].src)
      : single
        ? [0]
        : [];
  const cropAt = cropping?.at
    ? Math.max(
        0,
        cropPhotos.findIndex((i) => items[i].key === cropping.at),
      )
    : 0;
  const cropIndex = cropPhotos[cropAt];
  const cropItem = cropIndex !== undefined ? items[cropIndex] : undefined;
  const baseChoices =
    cropTarget === "all"
      ? ONE_SHAPE_CHOICES
      : cropTarget
        ? cropChoicesFor(cropTarget, options[cropTarget]?.as)
        : [];
  // Instagram shows every photo of a carousel in one shape: after the first, it's shared.
  const sharedRatio =
    cropTarget === "instagram" && cropPhotos.length > 1
      ? (Object.values(cropping?.made ?? {})[0]?.ratio ??
        Object.values(crops.instagram ?? {})
          .map((c) => c.made?.ratio ?? c.width / c.height)
          .at(0))
      : undefined;
  const cropChoices =
    sharedRatio !== undefined
      ? (() => {
          const near = baseChoices.find((c) => Math.abs(c.ratio / sharedRatio - 1) < 0.03);
          return near ? [near] : baseChoices;
        })()
      : baseChoices;
  const editingCrop: MadeCrop | null =
    cropTarget === "all"
      ? allCrop
      : cropTarget && cropItem
        ? (cropping?.made?.[cropItem.key] ?? crops[cropTarget]?.[cropItem.key]?.made ?? null)
        : null;
  const cropStart =
    editingCrop && (cropping?.ratio === undefined || cropping.ratio === editingCrop.ratio)
      ? { ratio: editingCrop.ratio, zoom: editingCrop.zoom, cx: editingCrop.cx, cy: editingCrop.cy }
      : { ratio: cropping?.ratio ?? cropChoices[0]?.ratio ?? 1 };
  /** Opens the crop for the photo tapped in the strip: the first picked app that crops it. */
  const cropTapped = (index: number) => {
    const order = [
      ...pickedPlatforms.filter((p) => fits[p] && fits[p]?.level !== "fits"),
      ...pickedPlatforms,
    ];
    const target = order.find(
      (p) => sets[p]?.indices.includes(index) && cropChoicesFor(p, options[p]?.as).length > 0,
    );
    if (target) setCropping({ target, at: items[index].key });
  };

  /** Adds files from the picker, a drop or OneDrive: photos upload at once, videos too. */
  const addFiles = (files: File[]) => {
    setDropError(null);
    setDirty(true);
    const room = CAROUSEL_MAX - items.length;
    const usable = files.filter(
      (f) =>
        (POST_IMAGE_TYPES as readonly string[]).includes(f.type) ||
        (POST_VIDEO_TYPES as readonly string[]).includes(f.type) ||
        f.type.startsWith("video/"),
    );
    if (usable.length < files.length) {
      setDropError(
        "Some files can't be posted. Use JPG, PNG or WebP photos, or MP4, MOV or WebM videos.",
      );
    }
    if (usable.length > room) {
      setDropError(
        `A post takes up to ${CAROUSEL_MAX} photos and videos. The first ${room} were added.`,
      );
    }
    for (const file of usable.slice(0, Math.max(0, room))) {
      const key = newKey();
      live.current.add(key);
      const image = (POST_IMAGE_TYPES as readonly string[]).includes(file.type);
      const src = image ? URL.createObjectURL(file) : null;
      const item: Item = {
        key,
        kind: image ? "image" : "video",
        src,
        name: file.name,
        status: "uploading",
        progress: 0,
        error: null,
        seconds: null,
        url: null,
        size: file.size,
        mime: file.type,
        width: null,
        height: null,
        origin: "device",
      };
      setItems((list) => [...list, item]);
      const patch = (p: Partial<Item>) =>
        setItems((list) => list.map((x) => (x.key === key ? { ...x, ...p } : x)));
      if (image && src) {
        const img = new Image();
        img.onload = () =>
          patch({ width: img.naturalWidth || null, height: img.naturalHeight || null });
        img.src = src;
        void (async () => {
          const fd = new FormData();
          fd.set("file", file);
          for (const p of pickedPlatforms) fd.append("platforms", p);
          const r = await uploadPostPhoto(fd).catch(() => ({
            error: "The image couldn't be uploaded. Try again.",
          }));
          if (!live.current.has(key)) return;
          patch(
            "error" in r
              ? { status: "error", error: r.error }
              : { status: "ready", url: r.url, progress: 100 },
          );
        })();
      } else {
        void (async () => {
          const r = await uploadVideoFile(
            file,
            (progress) => patch({ progress }),
            () => live.current.has(key),
          );
          if (!live.current.has(key)) return;
          patch(
            "error" in r
              ? { status: "error", error: r.error || "The video couldn't be uploaded. Try again." }
              : {
                  status: "ready",
                  url: r.url,
                  progress: 100,
                  seconds: r.seconds,
                  width: r.width,
                  height: r.height,
                },
          );
        })();
      }
    }
  };
  const removeItem = (key: string) => {
    setDirty(true);
    live.current.delete(key);
    setItems((list) => {
      const gone = list.find((x) => x.key === key);
      if (gone?.src?.startsWith("blob:")) URL.revokeObjectURL(gone.src);
      return list.filter((x) => x.key !== key);
    });
    setCrops((c) =>
      Object.fromEntries(
        Object.entries(c).map(([p, byKey]) => [
          p,
          Object.fromEntries(Object.entries(byKey ?? {}).filter(([k]) => k !== key)),
        ]),
      ),
    );
    if (allCrop) {
      URL.revokeObjectURL(allCrop.url);
      setAllCrop(null);
    }
    setCropping(null);
    dropPicks();
    setChoosingFor(null);
  };
  const removeCropsFor = (p: string) => {
    setDirty(true);
    setCrops((c) => {
      for (const crop of Object.values(c[p] ?? {})) {
        if (crop.made) URL.revokeObjectURL(crop.made.url);
      }
      return Object.fromEntries(Object.entries(c).filter(([k]) => k !== p));
    });
  };

  const serverProblems = state.problems ?? [];
  // Zernio's notes: before saving they sit in "Before it goes out"; once saved, by the outcome.
  const serverWarnings = state.savedAt ? [] : (state.warnings ?? []);
  // The caption's counter: the shortest limit among platforms that use the caption.
  const followers = pickedPlatforms.filter((p) => ownText(options[p], text) === null);
  const limit = textLimitFor(followers, POST_TEXT_MAX);
  // Day and time are wall clock in the viewer's zone; sent as an absolute ISO time.
  const at = date && time ? fromWallClock(date, time, timeZone) : null;
  const scheduledFor = at && !Number.isNaN(at.getTime()) ? at.toISOString() : "";
  const repeatProblem =
    when === "repeat"
      ? at && !Number.isNaN(at.getTime())
        ? repeatChoiceProblem(
            {
              every: repeat.every,
              ends: repeat.ends,
              endDate: repeat.endDate || null,
              count: repeat.count,
            },
            at,
            timeZone,
          )
        : "Pick when the first one goes out."
      : null;
  const fieldError = (field: ComposeState["field"]) =>
    state.field === field && state.error ? (
      <p role="alert" className="text-danger text-sm">
        {state.error}
      </p>
    ) : null;

  const issues =
    checks.filter((c) => c.level !== "ok").length +
    serverProblems.length +
    serverWarnings.length +
    googleIssues.length;
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
    googleIssues.length > 0 ||
    pinterest.length > 0;
  const submitLabel = pending
    ? "Saving…"
    : editing
      ? "Save changes"
      : when === "now"
        ? "Post now"
        : when === "queue" && nextSlot
          ? `Add to queue · ${slotLabel(nextSlot, timeZone)}`
          : when === "repeat"
            ? `Schedule · repeats every ${repeat.every}`
            : `Schedule${whenLabel(date, time) ? ` for ${whenLabel(date, time)}` : ""}`;

  /** Uploads one photo or crop; the link, or the reason it didn't go. */
  const upload = async (file: File): Promise<string> => {
    const fd = new FormData();
    fd.set("file", file);
    for (const p of pickedPlatforms) fd.append("platforms", p);
    const r = await uploadPostPhoto(fd);
    if ("error" in r) throw new Error(r.error);
    return r.url;
  };

  /** Shows Google's fields under Options and puts the cursor in the first one to fix. */
  const showGoogleField = () => {
    const fold = document.getElementById("compose-options") as HTMLDetailsElement | null;
    if (fold) fold.open = true;
    const field = googleIssues[0]?.field;
    const id =
      field === "buttonUrl"
        ? "google-button-url"
        : field === "redeemUrl"
          ? "google-redeem"
          : field === "start" ||
              field === "end" ||
              field === "title" ||
              field === "coupon" ||
              field === "terms"
            ? `google-${field === "coupon" ? "coupon" : field === "terms" ? "terms" : field}`
            : "google-options";
    requestAnimationFrame(() => {
      const el = document.getElementById(id);
      el?.scrollIntoView({ block: "center" });
      el?.focus();
    });
  };

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
          setSendError(null);
          setSending(true);
          void (async () => {
            try {
              // Round 4: every file is already uploaded; crops made here go up now, one by one
              // (each request stays small), and the form carries only links and sizes.
              const list = items.map((it) => ({
                url: it.url as string,
                type: it.kind,
                ...(it.width && it.height ? { width: it.width, height: it.height } : {}),
                ...(it.seconds ? { seconds: it.seconds } : {}),
              }));
              if (allCrop && single) {
                list[0] = {
                  url: await upload(allCrop.file),
                  type: "image",
                  width: allCrop.width,
                  height: allCrop.height,
                };
              }
              const cropsOut: Record<
                string,
                Record<number, { url: string; width: number; height: number }>
              > = {};
              for (const p of pickedPlatforms) {
                for (const [i, c] of usedCrops(p)) {
                  let url = c.url;
                  if (!url && c.made) {
                    url = await upload(c.made.file);
                    const done = url;
                    // Kept, so trying again doesn't upload it twice.
                    setCrops((all) => {
                      const mine = all[p]?.[items[i].key];
                      return mine
                        ? { ...all, [p]: { ...all[p], [items[i].key]: { ...mine, url: done } } }
                        : all;
                    });
                  }
                  if (url)
                    cropsOut[p] = {
                      ...cropsOut[p],
                      [i]: { url, width: c.width, height: c.height },
                    };
                }
              }
              data.set("items", JSON.stringify(list));
              data.set("crops", JSON.stringify(cropsOut));
              startTransition(() => action(data));
            } catch (error) {
              setSendError(
                error instanceof Error && error.message
                  ? error.message
                  : "A crop couldn't be uploaded. Try again.",
              );
            } finally {
              setSending(false);
            }
          })();
        }}
        className="flex min-h-0 flex-1 flex-col"
      >
        {editing && initial && <input type="hidden" name="postId" value={initial.postId} />}
        {mode === "duplicate" && initial && (
          <input type="hidden" name="fromPostId" value={initial.postId} />
        )}
        <input type="hidden" name="when" value={when === "repeat" ? "later" : when} />
        {(when === "later" || when === "repeat") && (
          <input type="hidden" name="scheduledFor" value={scheduledFor} />
        )}
        <input type="hidden" name="timeZone" value={timeZone} />
        {when === "repeat" && (
          <input
            type="hidden"
            name="repeat"
            value={JSON.stringify({
              every: repeat.every,
              ends: repeat.ends,
              endDate: repeat.ends === "on" ? repeat.endDate || null : null,
              count: repeat.ends === "after" ? repeat.count : null,
            })}
          />
        )}
        {editing && initial?.repeat && (
          <input type="hidden" name="repeatScope" value={repeatScope} />
        )}

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
              {/* Posts Round 5: Waggle drafts the caption from the business info. */}
              <WriteWithWaggle
                text={text}
                maxLength={limit}
                onUse={(caption) => {
                  setText(caption);
                  setDirty(true);
                }}
              />
            </div>

            {/* Photos and videos (Posts media, approved 16 Nov; Round 4: up to 20, a strip). The
                inputs stay mounted; they never go with the form (files upload on their own). */}
            <div className="flex flex-col gap-2">
              <input
                id="post-files"
                type="file"
                multiple
                accept={[...POST_IMAGE_TYPES, ...POST_VIDEO_TYPES].join(",")}
                onChange={(e) => {
                  addFiles([...(e.target.files ?? [])]);
                  e.target.value = "";
                }}
                className="sr-only"
                tabIndex={-1}
              />
              <input
                id="post-image"
                type="file"
                multiple
                accept={POST_IMAGE_TYPES.join(",")}
                onChange={(e) => {
                  addFiles([...(e.target.files ?? [])]);
                  e.target.value = "";
                }}
                className="sr-only"
              />
              <input
                id="post-video"
                type="file"
                multiple
                accept={POST_VIDEO_TYPES.join(",")}
                onChange={(e) => {
                  addFiles([...(e.target.files ?? [])]);
                  e.target.value = "";
                }}
                className="sr-only"
              />
              {hasMedia ? (
                <MediaStrip
                  items={items}
                  addFor="post-files"
                  disabled={pending}
                  onRemove={removeItem}
                  onMove={(from, to) => {
                    setDirty(true);
                    setItems((list) => moveItem(list, from, to));
                    dropPicks();
                    setChoosingFor(null);
                    if (allCrop) {
                      URL.revokeObjectURL(allCrop.url);
                      setAllCrop(null);
                    }
                  }}
                  onTap={cropTapped}
                  onDropFiles={addFiles}
                />
              ) : (
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    addFiles([...(e.dataTransfer.files ?? [])]);
                  }}
                  className={cn(
                    "flex flex-col items-center gap-2.5 rounded-2xl border-[1.5px] border-dashed px-3.5 py-5 text-center transition-colors",
                    dragging ? "border-honey bg-honey-tint" : "border-line-strong bg-honey-tint/40",
                  )}
                >
                  <EmptyCell size={34} />
                  <b className="text-[15px] font-semibold">Add photos or videos</b>
                  <span className="text-ink-2 text-[13px]">
                    Drop them here, or pick. Several make a carousel.
                  </span>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <label
                      htmlFor="post-image"
                      className="border-line-strong bg-surface hover:bg-subtle inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border px-3.5 text-sm font-semibold"
                    >
                      <Camera className="size-[18px]" strokeWidth={1.8} aria-hidden />
                      Photos
                    </label>
                    <label
                      htmlFor="post-video"
                      className="border-line-strong bg-surface hover:bg-subtle inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border px-3.5 text-sm font-semibold"
                    >
                      <Film className="size-[18px]" strokeWidth={1.8} aria-hidden />
                      Video
                    </label>
                    <OneDrivePicker
                      disabled={pending}
                      showSoon={false}
                      allow={{ image: true, video: true }}
                      onPick={(pick) => {
                        setDirty(true);
                        const key = newKey();
                        live.current.add(key);
                        const item: Item = {
                          key,
                          kind: pick.use,
                          src: pick.use === "image" ? pick.url : null,
                          name: pick.name,
                          status: "ready",
                          progress: 100,
                          error: null,
                          seconds: null,
                          url: pick.url,
                          size: pick.size,
                          mime: null,
                          width: null,
                          height: null,
                          origin: "onedrive",
                        };
                        setItems((list) => [...list, item].slice(0, CAROUSEL_MAX));
                        const patch = (p: Partial<Item>) =>
                          setItems((list) => list.map((x) => (x.key === key ? { ...x, ...p } : x)));
                        if (pick.use === "image") {
                          const img = new Image();
                          img.onload = () =>
                            patch({
                              width: img.naturalWidth || null,
                              height: img.naturalHeight || null,
                            });
                          img.src = pick.url;
                        } else {
                          // Its length and shape, read from the copied file for "How it fits".
                          void readVideoMeta(pick.url).then((meta) => patch(meta));
                        }
                      }}
                    />
                  </div>
                  <span className="text-ink-3 text-xs">
                    Photos: JPG, PNG or WebP, up to {imageMb} MB · Videos: MP4, MOV or WebM · Up to{" "}
                    {CAROUSEL_MAX} in one post
                  </span>
                  <StateLabel state="soon" className="text-[13px]">
                    Google Drive, coming soon
                  </StateLabel>
                </div>
              )}
              {uploading && (
                <span className="meta">
                  Schedule stays off until the uploads finish. Keep this page open; a large video
                  can take a minute.
                </span>
              )}
              {oversized >= 0 && (
                <p role="alert" className="text-danger text-sm">
                  Photo {oversized + 1} is over {imageMb} MB, the most one of your picked apps
                  takes. Remove it, or use a smaller photo.
                </p>
              )}
              {dropError && (
                <p role="alert" className="text-danger text-sm">
                  {dropError}
                </p>
              )}
              {fieldError("image")}
            </div>

            {hasMedia && (
              <FitRow
                platforms={pickedPlatforms}
                accountCount={picked.length}
                summary={items.length > 1 ? setLabel(kinds) : null}
                fits={fits}
                details={details}
                options={options}
                mediaFor={mediaFor}
                photo={photoCount > 0}
                oneShapeForAll={single}
                crops={shownCrops}
                allCrop={allCrop}
                onCrop={(p) => setCropping({ target: p })}
                onRemoveCrop={removeCropsFor}
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
                choose={chooseLabels}
                onChoose={(p) => setChoosingFor(p)}
              />
            )}
            {choosingFor && chooseLabels[choosingFor] && (
              <PhotoChooser
                platform={choosingFor}
                photos={items.flatMap((it, index) =>
                  it.kind === "image" ? [{ index, src: it.src }] : [],
                )}
                chosen={sets[choosingFor].indices.filter((i) => items[i].kind === "image")}
                max={carouselRules(choosingFor).photos}
                onCancel={() => setChoosingFor(null)}
                onDone={(pick) => {
                  setOptions((o) => ({ ...o, [choosingFor]: { ...o[choosingFor], pick } }));
                  setChoosingFor(null);
                  setDirty(true);
                }}
              />
            )}
            {cropping && cropItem?.src && cropItem.width && cropItem.height && (
              <CropSheet
                key={`${cropping.target}-${cropItem.key}-${cropping.ratio ?? ""}`}
                title={
                  cropping.target === "all"
                    ? "One shape for all"
                    : `Crop for ${platformLabel(cropping.target)}`
                }
                note={
                  cropping.target === "all"
                    ? "The crop is made here and posted to every account in place of the original. Original puts it back."
                    : cropPhotos.length > 1 && cropping.target === "instagram"
                      ? "Instagram shows every photo of a carousel in one shape, so the shape is shared and only the position and zoom change per photo."
                      : `The crop is made here and posted only to ${platformLabel(cropping.target)}. The original still goes to the others.`
                }
                src={cropItem.src}
                width={cropItem.width}
                height={cropItem.height}
                mime={cropItem.mime}
                choices={cropChoices}
                start={cropStart}
                set={
                  cropping.target !== "all" && cropPhotos.length > 1
                    ? {
                        thumbs: cropPhotos.map((i) => ({
                          key: items[i].key,
                          src: items[i].src ?? "",
                          done:
                            !!cropping.made?.[items[i].key] ||
                            !!crops[cropping.target]?.[items[i].key],
                        })),
                        index: cropAt,
                        onNext: (made) => {
                          const next = cropPhotos[cropAt + 1];
                          setCropping(
                            (c) =>
                              c && {
                                ...c,
                                ratio: undefined,
                                at: next !== undefined ? items[next].key : c.at,
                                made: { ...c.made, [cropItem.key]: made },
                              },
                          );
                        },
                      }
                    : undefined
                }
                onCancel={() => {
                  for (const m of Object.values(cropping.made ?? {})) URL.revokeObjectURL(m.url);
                  setCropping(null);
                }}
                onUse={(made) => {
                  const target = cropping.target;
                  const all = { ...cropping.made, [cropItem.key]: made };
                  setCropping(null);
                  setDirty(true);
                  if (target === "all") {
                    for (const byKey of Object.values(crops))
                      for (const c of Object.values(byKey ?? {}))
                        if (c.made) URL.revokeObjectURL(c.made.url);
                    if (allCrop) URL.revokeObjectURL(allCrop.url);
                    setCrops({});
                    setAllCrop(made);
                    return;
                  }
                  setCrops((c) => {
                    const mine = { ...c[target] };
                    for (const [key, m] of Object.entries(all)) {
                      const old = mine[key];
                      if (old?.made) URL.revokeObjectURL(old.made.url);
                      mine[key] = {
                        src: m.url,
                        width: m.width,
                        height: m.height,
                        label: m.label,
                        url: null,
                        made: m,
                      };
                    }
                    return { ...c, [target]: mine };
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
              id="compose-options"
              title="Options"
              summary={
                Object.entries(options).some(([p, o]) => o?.text && pickedPlatforms.includes(p))
                  ? `${Object.entries(options)
                      .filter(([p, o]) => o?.text && pickedPlatforms.includes(p))
                      .map(([p]) => platformLabel(p))
                      .join(", ")} has its own text`
                  : googleIssues.length
                    ? `Google Business: ${googleIssues.length} to check`
                    : "Extras for each app, all optional"
              }
              open={state.field === "youtubeTitle"}
            >
              {googleAccount && (
                <GoogleFields
                  google={options.googlebusiness?.google}
                  onChange={(google) =>
                    setOptions((o) => ({ ...o, googlebusiness: { ...o.googlebusiness, google } }))
                  }
                  phone={businessPhone}
                  today={today}
                  timeZone={timeZone}
                  username={googleAccount.username}
                />
              )}
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
                hasMedia={hasMedia}
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
                  {googleIssues.map((g) => (
                    <li key={`google-${g.field}`} className="flex items-start gap-2.5">
                      <PlatformMark platform="googlebusiness" size={22} />
                      <span className="text-honey-text">
                        <b className="font-semibold">Google Business</b>: {g.message}{" "}
                        <button type="button" onClick={showGoogleField} className="action-link">
                          Show me
                        </button>
                      </span>
                    </li>
                  ))}
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
              <div className="segmented max-w-full flex-wrap" role="radiogroup" aria-label="When">
                {(["now", "queue", "later", "repeat"] as const).map((v) => (
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
                      setPicking(v === "later" || v === "repeat");
                    }}
                    className="disabled:opacity-50"
                  >
                    {v === "now"
                      ? "Now"
                      : v === "queue"
                        ? "Next free slot"
                        : v === "later"
                          ? "Pick a time"
                          : "↻ Repeat"}
                  </button>
                ))}
              </div>
            )}
            {(when === "later" || when === "repeat") && (
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
            {!nextSlot && !editing && when !== "later" && when !== "repeat" && (
              <span className="meta">
                <a href="/posts/queue" className="link-inline">
                  Set posting times
                </a>{" "}
                to post at your usual times with one tap.
              </span>
            )}
            {fieldError("when")}
          </fieldset>
          {when === "repeat" && (
            <RepeatFields
              value={repeat}
              onChange={(next) => {
                setRepeat(next);
                setDirty(true);
              }}
              first={at && !Number.isNaN(at.getTime()) ? at : null}
              timeZone={timeZone}
            />
          )}
          {editing && initial?.repeat && (
            <fieldset className="flex w-full flex-wrap items-center gap-2">
              <legend className="sr-only">Change which posts</legend>
              <span className="text-ink-2 text-sm">
                <span aria-hidden>↻ </span>
                {initial.repeat.label}. Change
              </span>
              <div className="segmented max-w-full flex-wrap" role="radiogroup" aria-label="Change which posts">
                {(["one", "following"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    role="radio"
                    aria-checked={repeatScope === v}
                    data-active={repeatScope === v || undefined}
                    onClick={() => setRepeatScope(v)}
                  >
                    {v === "one" ? "Just this one" : "This and the ones after"}
                  </button>
                ))}
              </div>
            </fieldset>
          )}
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
                  setWhen((w) => (w === "repeat" ? "repeat" : "later"));
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
            {sendError && (
              <p role="alert" className="text-danger text-sm">
                {sendError}
              </p>
            )}
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
                uploading ||
                failedFiles ||
                oversized >= 0 ||
                picked.length === 0 ||
                !!repeatProblem ||
                checks.some((c) => c.level === "blocked") ||
                refused.length > 0 ||
                googleIssues.length > 0
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
  id,
  title,
  summary,
  open = false,
  children,
}: {
  id?: string;
  title: string;
  summary: string;
  open?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details id={id} open={open || undefined} className="group border-line border-t">
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
