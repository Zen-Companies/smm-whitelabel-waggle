"use client";

import Link from "next/link";
import { useFormStatus } from "react-dom";
import { Clock, Lock, MessageCircle, Pause, Play, Plus, Star } from "lucide-react";
import {
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from "react";
import { cn } from "cn";
import { PlatformMark } from "@/components/app/platform-mark";
// Straight to the server action module, not the accounts barrel (it re-exports server-only code).
import { connectAccount } from "@/features/accounts/actions";
// Straight to the pure modules, not the catch-up barrel (it re-exports server-only code).
import { phaseProgress } from "@/features/catch-up/first-connect-copy";
import type { CatchUpProgress } from "@/features/catch-up/reveal-data";
import type { StripDay } from "./day-strip";
import { DayStripView } from "./day-strip-view";
import type { SetupScreen } from "./flow";
import { ConnectSubmit } from "./connect-pending";
import { ReadingPart, useReading } from "./reading-part";
import { skipSetupAnswers } from "./actions";
import { PRIMARY, ScreenButton, ScreenTitle } from "./setup-frame";
import {
  answerableLine,
  bandDelays,
  currentScene,
  lockedSpamLine,
  resultsFooter,
  RESULTS_FOOTER_COPY,
  resultTiles,
  showsLocked,
  startStory,
  storyScenes,
  storyStep,
  TICK_MS,
  type Scene,
  type StoryFacts,
  type TileKind,
} from "./story";

// Step 2 (board "Replica update", approved 23 Nov): the reading plays while Waggle reads (with
// pause and Skip), then the 30-day strip and one Results card: red for the DMs Meta locked (its
// 24-hour rule one tap away), green for what can still be answered, the places Waggle didn't check,
// and one question whenever there's something to answer: Yes goes on to step 3's chat; Skip for
// now finishes setup with safe defaults (skipSetupAnswers) and the replies wait in the Inbox.

/** A place Waggle didn't check: connect it here, or (Free full) open the Solo pop-up. */
export interface MorePlace {
  platform: string;
  label: string;
  /** Free with its account used: where the chip goes (the pop-up on this page). */
  upgradeHref: string | null;
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
  /** Of the locked DMs, those that looked like spam (a small line in the red band). */
  lockedSpam: number;
  closeToday: number;
  dmsOpen: number;
  commentsOpen: number;
  reviewsOpen: number;
  /** Replies Waggle wrote that wait for the owner's OK. */
  replies: number;
  /** Customers Waggle couldn't answer on its own. */
  needYou: number;
  more: MorePlace[];
  days: StripDay[];
  /** ISO time the page was rendered. */
  now: string;
  /** Where "Yes, answer them now" goes: step 3's chat. */
  into3: SetupScreen;
  /** Open on the results (an old ?screen=wanted|replies link). */
  atResults: boolean;
}

const REDUCE = "(prefers-reduced-motion: reduce)";
const subscribeMotion = (cb: () => void) => {
  const m = window.matchMedia(REDUCE);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};
/** Chips before "+N more". */
const CHIPS_SHOWN = 3;

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

  const scenes = useMemo(() => storyScenes(storyFactsOf(props, reading)), [props, reading]);
  const [state, dispatch] = useReducer(storyStep, undefined, () =>
    startStory(storyScenes(storyFactsOf(props, reading)), props.atResults),
  );
  const shown: Scene = reduced ? "results" : currentScene(scenes, state.at);
  const running = shown !== "results" && !state.paused;

  useEffect(() => {
    if (!running) return;
    const id = setInterval(
      () => dispatch({ type: "tick", ms: TICK_MS, scenes, holding: reading }),
      TICK_MS,
    );
    return () => clearInterval(id);
  }, [running, scenes, reading]);

  const strip =
    reading && p ? (
      <ReadingPart initial={p} handle={props.handle} days={days} now={props.now} />
    ) : (
      <DayStripView days={days} now={props.now} />
    );

  return (
    <div className="flex flex-1 flex-col gap-3.5">
      {shown === "reading" ? (
        <>
          <div className="flex items-center gap-1.5">
            <span className="bg-line h-1 flex-1 overflow-hidden rounded-full" aria-hidden>
              <span
                className="bg-ink block h-full transition-[width] duration-100 ease-linear"
                style={{ width: `${reading && p ? phaseProgress(p.phase) : 100}%` }}
              />
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
          <div className="part-in flex flex-col gap-3.5" aria-live="polite">
            <ScreenTitle
              title={reading ? "Reading your last 30 days…" : "Waggle read your last 30 days"}
              sub={reading ? "About two minutes." : undefined}
            />
            {strip}
          </div>
        </>
      ) : (
        <div className="part-in flex flex-col gap-3.5">
          <Results props={props} strip={strip} reading={reading} />
        </div>
      )}
    </div>
  );
}

function Results({
  props,
  strip,
  reading,
}: {
  props: Step2StoryProps;
  strip: ReactNode;
  reading: boolean;
}) {
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
        <Chips props={props} />
        <AskRow
          into3={props.into3}
          footer={resultsFooter(storyFactsOf(props, reading))}
          className="card"
        />
      </>
    );
  }

  const f = storyFactsOf(props, reading);
  const locked = showsLocked(f);
  const tiles = resultTiles(f);
  const delay = bandDelays(locked);
  const footer = resultsFooter(f);
  const chips = props.more.length > 0;

  return (
    <>
      <div className="flex flex-col gap-1">
        <span className="font-display text-honey-text text-[13px] font-bold tracking-[0.12em] uppercase">
          Results
        </span>
        <h1 className="font-display text-[22px] leading-tight font-semibold md:text-[26px]">
          {props.firstName}, here’s what you missed in the last 30 days
        </h1>
        <p className="text-ink-2 text-[14px]">
          On {props.brandName}’s {props.platform}.
        </p>
      </div>
      {strip}
      {props.dmAccessMissing && (
        <p className="text-ink-3 text-sm">
          Waggle couldn’t read your {props.platform} messages, only comments.
        </p>
      )}

      <div className="border-line bg-surface flex flex-col overflow-hidden rounded-2xl border">
        {locked && (
          <LockedBand n={props.locked} spam={props.lockedSpam} platform={props.platform} />
        )}

        {tiles.length > 0 && (
          <div
            className="part-in bg-success-soft flex flex-col gap-3 p-4 sm:p-5"
            style={{ animationDelay: `${delay.green}ms` }}
          >
            <p className="text-success text-[15px] font-semibold">{answerableLine(f)}</p>
            <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              {tiles.map((t) => (
                <ResultTile
                  key={t.kind}
                  kind={t.kind}
                  platform={props.progress?.platform ?? null}
                  platformLabel={props.platform}
                  n={t.n}
                  text={t.text}
                  note={t.note}
                />
              ))}
            </ul>
          </div>
        )}

        {chips && (
          <div
            className="part-in border-line border-t p-4 sm:p-5"
            style={{ animationDelay: `${delay.chips}ms` }}
          >
            <Chips props={props} bare />
          </div>
        )}

        <AskRow
          into3={props.into3}
          footer={footer}
          className={cn("part-in", (tiles.length > 0 || chips) && "border-line border-t")}
          delay={delay.ask}
        />
      </div>
    </>
  );
}

/**
 * The Results footer, always shown: "Want to answer them now?" or, with nothing to answer, "Set up
 * how Waggle answers new messages?". Yes opens step 3's chat; Skip for now finishes setup with the safe
 * defaults and opens the Inbox, where Waggle's replies wait unsent.
 */
function AskRow({
  into3,
  footer,
  className,
  delay,
}: {
  into3: SetupScreen;
  footer: ReturnType<typeof resultsFooter>;
  className?: string;
  delay?: number;
}) {
  const copy = RESULTS_FOOTER_COPY[footer];
  return (
    <div
      className={cn("flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5", className)}
      style={delay === undefined ? undefined : { animationDelay: `${delay}ms` }}
    >
      <span className="flex min-w-[200px] flex-1 flex-col">
        <b className="font-semibold">{copy.title}</b>
        <span className="text-ink-2 text-sm">{copy.sub}</span>
      </span>
      <span className="flex flex-wrap gap-2">
        <ScreenButton to={into3} className={PRIMARY}>
          {copy.yes}
        </ScreenButton>
        <form action={skipSetupAnswers} className="contents">
          <SkipButton />
        </form>
      </span>
    </div>
  );
}

/** What decides what the results show, from the page's numbers. */
const storyFactsOf = (props: Step2StoryProps, reading: boolean): StoryFacts => ({
  reading,
  read: !!props.progress,
  readBefore: !!props.readBefore,
  pastDms: props.pastDms,
  dmAccessMissing: props.dmAccessMissing,
  locked: props.locked,
  dmsOpen: props.pastDms ? props.closeToday : props.dmsOpen,
  commentsOpen: props.commentsOpen,
  reviewsOpen: props.reviewsOpen,
  replies: props.replies,
  needYou: props.needYou,
});

function LockedBand({ n, spam, platform }: { n: number; spam: number; platform: string }) {
  const rule = useRef<HTMLDialogElement>(null);
  const spamLine = lockedSpamLine(n, spam);
  return (
    <div className="part-in bg-danger-soft border-danger-border flex flex-wrap items-start gap-4 border-b p-4 sm:p-5">
      <span className="flex flex-col items-start gap-1.5">
        <b className="text-danger font-display text-[44px] leading-none font-bold tabular-nums">
          {n}
        </b>
        <span className="text-danger flex items-center gap-1 text-xs font-semibold tracking-wide uppercase">
          <Lock className="size-3.5" aria-hidden /> Locked
        </span>
      </span>
      <span className="flex min-w-[200px] flex-1 flex-col gap-1">
        <b className="text-danger text-[17px] leading-snug font-semibold">
          {n === 1
            ? "A DM you missed. You can’t answer it anymore."
            : "DMs you missed. You can’t answer them anymore."}
        </b>
        <span className="text-ink-2 text-sm leading-relaxed">
          {n === 1 ? "This customer" : "These customers"} on {platform} waited more than 24 hours,
          so {n === 1 ? "it’s" : "they’re"} locked by Meta.{" "}
          <button
            type="button"
            className="link-inline cursor-pointer"
            onClick={() => rule.current?.showModal()}
          >
            Meta’s 24-hour rule*
          </button>
        </span>
        {spamLine && <span className="text-ink-3 text-xs">{spamLine}</span>}
      </span>
      <MetaRule ref={rule} />
    </div>
  );
}

/** Meta's 24-hour rule, in place: Esc, Got it or a tap outside closes it. */
function MetaRule({ ref }: { ref: RefObject<HTMLDialogElement | null> }) {
  const close = () => ref.current?.close();
  return (
    <dialog
      ref={ref}
      aria-labelledby="meta-rule-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      className="bg-surface border-line text-ink m-auto w-[calc(100%-32px)] max-w-[440px] rounded-[18px] border p-0 shadow-[0_12px_32px_rgba(23,20,15,0.14)] backdrop:bg-[rgba(23,20,15,0.3)]"
    >
      <div className="flex flex-col gap-3 p-6">
        <h2 id="meta-rule-title" className="font-display text-[22px] leading-tight font-semibold">
          Meta’s 24-hour rule
        </h2>
        <p className="text-ink-2 text-[15px]">
          On Instagram and Facebook, a business can answer a DM only within 24 hours of the
          customer’s last message. After that, Meta locks the chat and your reply can’t be sent,
          unless the customer writes again.
        </p>
        <p className="text-ink-2 text-[15px]">
          That’s why these DMs are lost: they waited longer than a day. With Waggle, customers get
          an answer in minutes, so a DM doesn’t get locked again.
        </p>
        <div>
          <button type="button" className={PRIMARY} onClick={close} autoFocus>
            Got it
          </button>
        </div>
      </div>
    </dialog>
  );
}

const TILE_ICON: Record<TileKind, ReactNode> = {
  dms: <Clock aria-hidden />,
  comments: <MessageCircle aria-hidden />,
  reviews: <Star aria-hidden />,
};

function ResultTile({
  kind,
  platform,
  platformLabel,
  n,
  text,
  note,
}: {
  kind: TileKind;
  platform: string | null;
  platformLabel: string;
  n: number;
  text: string;
  note: string | null;
}) {
  return (
    <li className="border-success/25 bg-surface flex items-center gap-3 rounded-xl border p-3">
      <span className="relative shrink-0">
        {platform ? (
          <PlatformMark platform={platform} size={32} />
        ) : (
          <span className="bg-success-soft text-success inline-flex size-8 items-center justify-center rounded-lg [&_svg]:size-4">
            {TILE_ICON[kind]}
          </span>
        )}
        {platform && (
          <span className="bg-success-soft text-success ring-surface absolute -right-1.5 -bottom-1.5 inline-flex size-[18px] items-center justify-center rounded-full ring-2 [&_svg]:size-2.5">
            {TILE_ICON[kind]}
          </span>
        )}
      </span>
      <span className="flex min-w-0 flex-col">
        <b className="text-success text-[26px] leading-none font-semibold tabular-nums">{n}</b>
        <span className="text-ink-2 text-sm leading-snug">
          {text}
          <span className="sr-only"> on {platformLabel}</span>
        </span>
        {note && <span className="text-success text-xs font-medium">{note}</span>}
      </span>
    </li>
  );
}

const CHIP =
  "border-line-strong bg-surface text-ink hover:border-ink inline-flex min-h-10 items-center gap-2 rounded-full border py-1.5 pr-3 pl-1.5 text-sm font-semibold no-underline";

function ChipFace({ platform, label }: { platform: string; label: string }) {
  return (
    <>
      <PlatformMark platform={platform} size={26} />
      {label}
      <Plus className="text-ink-3 size-4" aria-hidden />
    </>
  );
}

/**
 * "Waggle only checked Instagram. Customers may be waiting here too:" one chip per place, each
 * connecting it here; with Free full, the Solo pop-up on this page. "+N more" opens step 1.
 */
function Chips({ props, bare = false }: { props: Step2StoryProps; bare?: boolean }) {
  if (props.more.length === 0) return null;
  const shown = props.more.slice(0, CHIPS_SHOWN);
  const rest = props.more.length - shown.length;
  return (
    <div className={cn("flex flex-col gap-2.5", !bare && "card px-3.5 py-3")}>
      <p className="text-ink-2 text-sm">
        <b className="text-ink font-semibold">Waggle only checked {props.platform}.</b> Customers
        may be waiting here too:
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {shown.map((m) =>
          m.upgradeHref ? (
            <Link
              key={m.platform}
              href={m.upgradeHref}
              scroll={false}
              className={CHIP}
              aria-label={`Connect ${m.label}`}
            >
              <ChipFace platform={m.platform} label={m.label} />
            </Link>
          ) : (
            <form key={m.platform} action={connectAccount} className="contents">
              <input type="hidden" name="platform" value={m.platform} />
              <input type="hidden" name="back" value="/setup" />
              <ConnectSubmit platform={m.label} className={CHIP}>
                <ChipFace platform={m.platform} label={m.label} />
              </ConnectSubmit>
            </form>
          ),
        )}
        {rest > 0 && (
          <Link
            href="/welcome?all=1"
            className="text-ink-2 hover:text-ink inline-flex min-h-10 items-center px-1.5 text-sm font-semibold"
          >
            +{rest} more
          </Link>
        )}
      </div>
    </div>
  );
}

function SkipButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="border-line bg-surface hover:border-honey inline-flex min-h-11 items-center justify-center rounded-xl border px-4 text-sm font-semibold"
    >
      {pending ? "Loading…" : "Skip for now"}
    </button>
  );
}
