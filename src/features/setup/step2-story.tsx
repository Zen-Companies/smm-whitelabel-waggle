"use client";

import Link from "next/link";
import { Pause, Play } from "lucide-react";
import {
  useEffect,
  useMemo,
  useReducer,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { cn } from "cn";
import { BeeBody } from "@/components/app/bee";
// Straight to the pure modules, not the catch-up barrel (it re-exports server-only code).
import { phaseProgress } from "@/features/catch-up/first-connect-copy";
import type { CatchUpProgress } from "@/features/catch-up/reveal-data";
import { plural } from "./copy";
import type { StripDay } from "./day-strip";
import { DayStripView } from "./day-strip-view";
import type { SetupScreen } from "./flow";
import { Combs } from "./combs";
import { writingLine } from "./reading";
import { ReadingPart, useReading } from "./reading-part";
import { Avatar } from "./setup-parts";
import { PRIMARY, QUIET, ScreenButton, ScreenTitle } from "./setup-frame";
import {
  careNumbers,
  currentScene,
  showsLocked,
  startStory,
  storyBars,
  storyScenes,
  storyStep,
  TICK_MS,
  type Scene,
  type StoryFacts,
} from "./story";

// Step 2 plays like a story, then shows everything (board approved 23 Nov). Progress bars on top
// with pause/play and Skip; each scene stays about 5 s, and the first one (the reading) holds until
// Waggle has read. Then the summary stays, with one choice and Watch again. Reduced motion, Skip or
// an old link open the summary at once.

export interface StoryChat {
  key: string;
  name: string;
  dm: boolean;
  /** "DM · closes in 5 h", "comment · 6 days". */
  meta: string;
  /** A DM whose window is running (the meta goes red). */
  urgent: boolean;
  text: string;
}

export interface Step2StoryProps {
  firstName: string;
  brandName: string;
  platform: string;
  /** "@sunnyside", else the platform. */
  handle: string;
  progress: CatchUpProgress | null;
  readBefore: string | null;
  pastDms: boolean;
  dmAccessMissing: boolean;
  locked: number;
  closeToday: number;
  dmsOpen: number;
  commentsOpen: number;
  /** "What they wanted"; muted is "Not about your business" (grey, always last). */
  topics: { label: string; count: number; muted?: boolean }[];
  chats: StoryChat[];
  drafted: number;
  needYou: number;
  writing: { done: number; of: number };
  outOfReplies: boolean;
  nothingToAnswer: boolean;
  quiet: boolean;
  days: StripDay[];
  /** ISO time the page was rendered. */
  now: string;
  /** Where "Yes, let's do it" goes: step 3's first screen ("how" when there's nothing to check). */
  into3: SetupScreen;
  /** Open on the summary (an old ?screen=wanted|replies link). */
  atSummary: boolean;
}

const REDUCE = "(prefers-reduced-motion: reduce)";
const subscribeMotion = (cb: () => void) => {
  const m = window.matchMedia(REDUCE);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};

export function Step2Story(props: Step2StoryProps) {
  const live = useReading();
  const p = live?.progress ?? props.progress;
  const days = live?.days ?? props.days;
  const reading = !!p && p.phase !== "ready";
  const reduced = useSyncExternalStore(
    subscribeMotion,
    () => window.matchMedia(REDUCE).matches,
    () => false,
  );

  // The reading scene plays only if Waggle was reading when the story started.
  const [withReading, setWithReading] = useState(reading);
  const scenes = useMemo(() => storyScenes(storyFactsOf(props, withReading)), [props, withReading]);
  const [state, dispatch] = useReducer(storyStep, undefined, () =>
    startStory(scenes, props.atSummary),
  );
  const shown: Scene = reduced && !state.replayed ? "summary" : currentScene(scenes, state.at);
  const running = shown !== "summary" && !state.paused;

  useEffect(() => {
    if (!running) return;
    const id = setInterval(
      () => dispatch({ type: "tick", ms: TICK_MS, scenes, holding: reading }),
      TICK_MS,
    );
    return () => clearInterval(id);
  }, [running, scenes, reading]);

  const replay = () => {
    setWithReading(reading);
    dispatch({ type: "replay", scenes: storyScenes(storyFactsOf(props, reading)) });
  };
  const bars = storyBars(
    scenes,
    { ...state, at: shown },
    reading && p ? phaseProgress(p.phase) / 100 : 1,
  );
  const canReplay = storyScenes(storyFactsOf(props, reading)).length > 1;

  return (
    <div className="flex flex-1 flex-col gap-3.5">
      {shown !== "summary" && (
        <div className="flex items-center gap-1.5">
          <div className="flex flex-1 gap-1" aria-hidden>
            {bars.map((b, i) => (
              <span key={i} className="bg-line h-1 flex-1 overflow-hidden rounded-full">
                <span
                  className="bg-ink block h-full transition-[width] duration-100 ease-linear"
                  style={{ width: `${Math.round(b * 100)}%` }}
                />
              </span>
            ))}
          </div>
          <span className="sr-only">
            Part {bars.findIndex((b) => b < 1) + 1 || bars.length} of {bars.length}
          </span>
          <button
            type="button"
            className="text-ink-3 hover:text-ink inline-flex size-9 items-center justify-center"
            aria-label={state.paused ? "Play" : "Pause"}
            onClick={() => dispatch({ type: "toggle" })}
          >
            {state.paused ? (
              <Play className="size-3.5" aria-hidden />
            ) : (
              <Pause className="size-3.5" aria-hidden />
            )}
          </button>
          <button
            type="button"
            className="text-ink-3 hover:text-ink min-h-9 px-1 text-[13px] font-medium"
            onClick={() => dispatch({ type: "skip" })}
          >
            Skip
          </button>
        </div>
      )}
      <div
        key={shown}
        className="part-in flex flex-col gap-3.5"
        aria-live="polite"
        // Reading a day on the strip (or anything in a scene) pauses the story.
        onPointerDownCapture={() => shown !== "summary" && dispatch({ type: "pause" })}
        onFocusCapture={() => shown !== "summary" && dispatch({ type: "pause" })}
      >
        <SceneBody scene={shown} props={props} p={p} days={days} reading={reading} />
      </div>
      {shown === "summary" && canReplay && (
        <button type="button" className={cn(QUIET, "self-start underline")} onClick={replay}>
          Watch again
        </button>
      )}
    </div>
  );
}

function SceneBody({
  scene,
  props,
  p,
  days,
  reading,
}: {
  scene: Scene;
  props: Step2StoryProps;
  p: CatchUpProgress | null;
  days: StripDay[];
  reading: boolean;
}) {
  const strip =
    reading && p ? (
      <ReadingPart initial={p} handle={props.handle} days={days} now={props.now} />
    ) : (
      <DayStripView days={days} now={props.now} />
    );
  switch (scene) {
    case "reading":
      return (
        <>
          <ScreenTitle
            title={reading ? "Reading your last 30 days…" : "Waggle read your last 30 days"}
            sub={reading ? "About two minutes." : undefined}
          />
          {strip}
        </>
      );
    case "days":
      return (
        <>
          <ScreenTitle
            title={`${props.firstName}, here’s your last 30 days`}
            sub={`${props.brandName}’s ${props.platform}`}
          />
          {strip}
          <span className="text-ink-3 text-[12.5px]">Tap a day to see it.</span>
        </>
      );
    case "locked":
      return (
        <>
          <BeeLine>First, the ones Waggle can’t save.</BeeLine>
          <LockedCard n={props.locked} />
        </>
      );
    case "answerable":
      return (
        <>
          <BeeLine>These you can still answer.</BeeLine>
          <AnswerableCards props={props} />
        </>
      );
    case "wanted":
      return (
        <>
          <ScreenTitle title="What they wanted" />
          <TopicChips topics={props.topics} />
          {props.chats.length > 0 && (
            <ul className="card divide-line flex flex-col divide-y">
              {props.chats.map((c) => (
                <ChatRow key={c.key} chat={c} />
              ))}
            </ul>
          )}
        </>
      );
    case "summary":
      return <Summary props={props} strip={strip} reading={reading} />;
  }
}

function Summary({
  props,
  strip,
  reading,
}: {
  props: Step2StoryProps;
  strip: ReactNode;
  reading: boolean;
}) {
  const nothing = props.into3 === "how";
  const buttons = nothing ? (
    <ScreenButton to="how" className={PRIMARY}>
      Next: how replies go out
    </ScreenButton>
  ) : (
    <div className="flex flex-wrap items-center gap-2">
      <ScreenButton to={props.into3} className={PRIMARY}>
        Yes, let’s do it
      </ScreenButton>
      <ScreenButton
        to="how"
        className="border-line bg-surface hover:border-honey inline-flex min-h-11 items-center justify-center rounded-xl border px-4 text-sm font-semibold"
      >
        Skip for now
      </ScreenButton>
    </div>
  );

  if (props.readBefore || !props.progress) {
    return (
      <>
        <ScreenTitle
          title={
            props.readBefore
              ? "Waggle already read this account’s last 30 days"
              : `${props.firstName}, here’s your last 30 days`
          }
          sub={
            props.readBefore
              ? `${props.readBefore} was connected before, so its past messages aren’t read again. New messages land in your Inbox from now on.`
              : `Waggle reads the last 30 days on Instagram and Facebook. New ${props.platform} messages land in your Inbox from now on.`
          }
        />
        {buttons}
      </>
    );
  }

  const locked = showsLocked(storyFactsOf(props, reading));
  const care = careNumbers(
    props.pastDms ? [props.closeToday, props.commentsOpen] : [props.dmsOpen, props.commentsOpen],
  );
  const writing = props.writing.of > 0 && props.writing.done < props.writing.of;
  return (
    <>
      <ScreenTitle
        title={`${props.firstName}, here’s what you missed`}
        sub={`${props.brandName}’s ${props.platform}, last 30 days`}
      />
      {strip}
      {locked && !reading && props.locked === 0 ? (
        <BigCard
          tone="green"
          n={0}
          title="DMs got locked."
          sub="Nobody’s chat ran past 24 hours. Nice."
        />
      ) : locked && props.locked > 0 ? (
        <LockedCard n={props.locked} summary />
      ) : null}
      <AnswerableCards props={props} summary />
      {props.dmAccessMissing && (
        <p className="text-ink-3 text-sm">
          Waggle couldn’t read your {props.platform} messages, only comments.
        </p>
      )}
      {props.topics.length > 0 && (
        <div className="card flex flex-col gap-1 px-3 py-2.5">
          <b className="text-[13px] font-semibold">What they wanted</b>
          <span className="text-ink-2 text-[13px]">
            {props.topics
              .slice(0, 3)
              .map((t) => t.label)
              .join(" · ")}
          </span>
        </div>
      )}
      {writing ? (
        <div
          className="card flex flex-wrap items-center gap-2.5 px-3 py-2.5 text-[13px]"
          role="status"
        >
          <BeeIcon />
          <b className="font-semibold">{writingLine(props.writing)}</b>
          <Combs on={props.writing.done} of={props.writing.of} size={14} />
        </div>
      ) : props.drafted + props.needYou > 0 ? (
        <div className="card flex flex-wrap items-center gap-2.5 px-3 py-2.5 text-[13px]">
          <Combs on={props.drafted} of={props.drafted + props.needYou} size={14} />
          <span>
            <b className="font-semibold">
              Waggle wrote {plural(props.drafted, "reply", "replies")}
            </b>
            {care && props.drafted > 0 && <> for {care}</>}
            {props.needYou > 0 && (
              <>
                {" · "}
                {props.needYou} {props.needYou === 1 ? "needs" : "need"} you
              </>
            )}
          </span>
        </div>
      ) : null}
      {props.outOfReplies && props.needYou > 0 && (
        <div className="border-honey-border bg-honey-tint flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-3 py-2.5">
          <BeeIcon size={24} />
          <span className="min-w-[200px] flex-1 text-[13px]">
            <b className="font-semibold">Out of AI replies this month.</b>{" "}
            {plural(props.needYou, "message waits", "messages wait")} for you.
          </span>
          <Link
            href="/setup?screen=replies&upgrade=replies"
            scroll={false}
            className="bg-ink text-surface hover:bg-ink-2 inline-flex min-h-10 items-center rounded-xl px-3.5 text-sm font-semibold no-underline"
          >
            Add replies
          </Link>
        </div>
      )}
      {props.quiet && !reading ? (
        <p className="text-ink-2 text-[13.5px]">
          A quiet month. Waggle answers new messages from now on.
        </p>
      ) : props.nothingToAnswer && !reading ? (
        <p className="flex items-center gap-2.5 text-[13.5px]">
          <BeeIcon size={28} />
          <span>
            <b className="font-semibold">Nothing to answer from the last 30 days.</b>{" "}
            <span className="text-ink-2">Waggle answers new messages from now on.</span>
          </span>
        </p>
      ) : !nothing ? (
        <b className="text-[14px] font-semibold">
          {care
            ? `With Waggle, we can take care of ${care} now. Want to work on them?`
            : "Want to work on them now?"}
        </b>
      ) : null}
      {buttons}
    </>
  );
}

/** What decides which scenes play, from the page's numbers. */
const storyFactsOf = (props: Step2StoryProps, reading: boolean): StoryFacts => ({
  reading,
  read: !!props.progress,
  readBefore: !!props.readBefore,
  pastDms: props.pastDms,
  dmAccessMissing: props.dmAccessMissing,
  locked: props.locked,
  dmsOpen: props.pastDms ? props.closeToday : props.dmsOpen,
  commentsOpen: props.commentsOpen,
  wanted: props.topics.length + props.chats.length > 0,
});

function BeeIcon({ size = 30 }: { size?: number }) {
  return (
    <span aria-hidden className="bee-bob inline-block shrink-0">
      <svg width={size} height={Math.round((size * 16) / 24)} viewBox="0 0 24 16">
        <BeeBody />
      </svg>
    </span>
  );
}

/** The bee and what it says, as the scene's heading. */
function BeeLine({ children }: { children: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <BeeIcon />
      <h1 className="text-ink-2 text-[14px] font-medium">{children}</h1>
    </div>
  );
}

const TONE = {
  red: { box: "border-danger-border bg-danger-soft", n: "text-danger" },
  honey: { box: "border-honey-border bg-honey-tint", n: "text-honey-text" },
  green: { box: "border-success/30 bg-success-soft", n: "text-success" },
} as const;

function BigCard({
  tone,
  n,
  title,
  sub,
  note,
}: {
  tone: keyof typeof TONE;
  n: number;
  title: string;
  sub: string;
  note?: string;
}) {
  return (
    <div
      className={cn("flex min-w-0 flex-1 flex-col gap-1 rounded-2xl border p-3", TONE[tone].box)}
    >
      <b
        className={cn(
          "font-display text-[36px] leading-none font-semibold tabular-nums",
          TONE[tone].n,
        )}
      >
        {n}
      </b>
      <span className="text-[13px]">
        <b className="font-semibold">{title}</b> {sub}
      </span>
      {note && <span className="text-ink-2 text-[12px]">{note}</span>}
    </div>
  );
}

function LockedCard({ n, summary = false }: { n: number; summary?: boolean }) {
  return (
    <BigCard
      tone="red"
      n={n}
      title={n === 1 ? "DM you can’t answer any more." : "DMs you can’t answer any more."}
      sub={
        summary
          ? "Locked by Meta’s 24-hour rule."
          : `${n === 1 ? "It’s" : "They’re"} locked by Meta’s 24-hour rule.`
      }
      note="Instagram and Facebook only let a business reply within 24 hours."
    />
  );
}

function AnswerableCards({
  props,
  summary = false,
}: {
  props: Step2StoryProps;
  summary?: boolean;
}) {
  const dms = props.pastDms ? props.closeToday : props.dmsOpen;
  if (dms + props.commentsOpen === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {dms > 0 &&
        (props.pastDms ? (
          <BigCard
            tone="honey"
            n={dms}
            title={dms === 1 ? "DM closes today." : "DMs close today."}
            sub={
              summary
                ? `Answer ${dms === 1 ? "it" : "them"} first.`
                : `Answer ${dms === 1 ? "it" : "them"} before Meta locks ${dms === 1 ? "it" : "them"}.`
            }
          />
        ) : (
          <BigCard tone="honey" n={dms} title={dms === 1 ? "DM" : "DMs"} sub="with no reply." />
        ))}
      {props.commentsOpen > 0 && (
        <BigCard
          tone="green"
          n={props.commentsOpen}
          title={props.commentsOpen === 1 ? "comment" : "comments"}
          sub="with no reply."
        />
      )}
    </div>
  );
}

function TopicChips({ topics }: { topics: { label: string; count: number; muted?: boolean }[] }) {
  if (topics.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="What they asked about">
      {topics.map((t) => (
        <li
          key={t.label}
          className={cn(
            "border-line rounded-full border px-2.5 py-1 text-[12.5px]",
            t.muted ? "text-ink-3 bg-transparent" : "bg-surface text-ink-2",
          )}
        >
          {t.label} · <b className="font-semibold">{t.count}</b>
        </li>
      ))}
    </ul>
  );
}

function ChatRow({ chat }: { chat: StoryChat }) {
  return (
    <li className="flex items-start gap-2.5 px-3 py-2.5">
      <Avatar name={chat.name} size={28} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex flex-wrap items-baseline justify-between gap-x-2 text-[12.5px]">
          <b className="min-w-0 font-semibold break-words">{chat.name}</b>
          <span className={cn("whitespace-nowrap", chat.urgent ? "text-danger" : "text-ink-3")}>
            {chat.meta}
          </span>
        </span>
        <span className="bg-subtle max-w-[92%] self-start rounded-[14px] rounded-bl-[4px] px-2.5 py-1.5 text-[13px] break-words">
          {chat.text}
        </span>
      </div>
    </li>
  );
}
