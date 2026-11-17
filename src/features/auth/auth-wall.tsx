"use client";

import { useState } from "react";
import { Pause, Play, Volume2, VolumeX } from "lucide-react";
import { cn } from "cn";

// The wall beside sign in and sign up (client redesign "0 · Sign in" and "0b · Sign up"). Sign in
// is for people who already use Waggle: tips that make it work better. Sign up is for people
// deciding whether to trust it: the cost of slow replies, then proof they stay in control. Stats
// verified 13 Nov (Sprout Social Index 2025; Meta and Kantar 2025). Three columns drift slowly in
// turn (two on smaller desktops); hovering or Pause motion stops them, and reduced motion keeps
// them still. The two AI presenter clips play muted; one tap turns a clip's sound on.

type Card = {
  kick: string;
  num?: string;
  title: string;
  sub: string;
  steps?: string[];
  src?: string;
  tone?: "honey" | "ink";
};

const SIGN_IN: Card[] = [
  {
    kick: "Tip",
    title: "Approve replies from your phone",
    sub: "Replies waiting for your OK show on Today. One tap each, even between appointments.",
    tone: "honey",
  },
  {
    kick: "Tip",
    title: "Teach it your top 5 answers",
    sub: "The more answers Waggle has, the less lands on you:",
    steps: ["Hours and location", "Prices, or a starting price", "How to book"],
  },
  {
    kick: "Keep it safe",
    title: "Some questions should always come to you",
    sub: "Keep these on Ask me first:",
    steps: ["Refunds and complaints", "Custom prices", "Health or legal questions"],
    tone: "ink",
  },
  {
    kick: "Good to know",
    num: "24 h",
    title: "to reply on Instagram and Messenger",
    sub: "Meta lets a business reply freely for 24 hours after the customer last messaged. Clear Today before it closes.",
    tone: "honey",
  },
  {
    kick: "Why it matters",
    num: "3 in 4",
    title: "customers expect a reply within 24 hours",
    sub: "Every reply you approve today keeps a buyer from moving on.",
    src: "Sprout Social Index, 2025",
  },
  {
    kick: "Going away?",
    title: "One button pauses every reply",
    sub: "Vacation or a busy week: pause Waggle in Teach Waggle, and everything waits for you.",
    tone: "ink",
  },
];

const SIGN_UP: Card[] = [
  {
    kick: "The cost of waiting",
    num: "73%",
    title: "say they will buy from a competitor if a business does not answer on social",
    sub: "A slow reply is not neutral. It sends the customer to the next business.",
    src: "Sprout Social Index, 2025",
    tone: "honey",
  },
  {
    kick: "How Waggle works",
    title: "Set up in three steps",
    sub: "You write the answers. You set the rules. Waggle gets them out fast.",
    steps: [
      "Connect where customers message you",
      "Write your top answers",
      "Choose Ask me first or Reply on its own",
    ],
  },
  {
    kick: "The cost of waiting",
    num: "3 in 4",
    title: "expect a reply within 24 hours",
    sub: "The first business to answer usually gets the booking.",
    src: "Sprout Social Index, 2025",
    tone: "ink",
  },
  {
    kick: "You stay in charge",
    num: "0",
    title: "made-up prices",
    sub: "If the answer isn't in what you wrote, Waggle asks you first instead of guessing.",
    tone: "honey",
  },
  {
    kick: "Where customers are",
    num: "7 in 10",
    title: "would rather message a business than call it",
    sub: "Your DMs are the new phone line.",
    src: "Meta and Kantar, 2025 (Meta-commissioned)",
  },
  {
    kick: "You stay in charge",
    title: "These always come to you",
    sub: "Waggle never answers them on its own:",
    steps: ["Complaints and refunds", "Custom prices", "Health or legal questions"],
    tone: "ink",
  },
];

type Video = { src: string; poster: string; label: string };
const VIDEOS = {
  realtor: {
    src: "/auth/realtor.mp4",
    poster: "/auth/realtor.jpg",
    label: "A realtor talks about buyers who message after hours",
  },
  contractor: {
    src: "/auth/contractor.mp4",
    poster: "/auth/contractor.jpg",
    label: "A contractor in his truck talks about losing jobs to whoever answers first",
  },
} satisfies Record<string, Video>;
type Tile = Card | keyof typeof VIDEOS;

/** Which tiles go in which column, top to bottom (design "0 · Sign in" / "0b · Sign up"). */
function columnsFor(kind: "signin" | "signup"): Tile[][] {
  const c = kind === "signin" ? SIGN_IN : SIGN_UP;
  return kind === "signin"
    ? [
        ["realtor", c[0], c[1]],
        [c[2], "contractor", c[3]],
        [c[4], c[5]],
      ]
    : [
        [c[0], "realtor", c[3]],
        [c[1], c[2], "contractor"],
        [c[4], c[5]],
      ];
}

function WallCard({ card }: { card: Card }) {
  const ink = card.tone === "ink";
  const honey = card.tone === "honey";
  return (
    <article
      className={cn(
        "flex-none rounded-[22px] border p-[22px] shadow-[0_10px_30px_rgba(60,40,0,0.06)]",
        honey && "border-honey bg-honey text-[#17140f]",
        ink && "border-ink bg-ink text-surface",
        !card.tone && "border-line bg-surface",
      )}
    >
      <p
        className={cn(
          "mb-3 text-[11px] font-bold tracking-[0.7px] uppercase",
          honey ? "text-[#4a3000]" : ink ? "text-honey" : "text-honey-text",
        )}
      >
        {card.kick}
      </p>
      {card.num && (
        <p
          className={cn(
            "font-display text-[40px] leading-none font-extrabold tracking-[-1.5px]",
            ink && "text-honey",
          )}
        >
          {card.num}
        </p>
      )}
      <h3 className="font-display mt-2 mb-1.5 text-[17px] leading-snug font-semibold">
        {card.title}
      </h3>
      <p className={cn("text-sm", honey ? "text-[#3a2a00]" : ink ? "opacity-80" : "text-ink-2")}>
        {card.sub}
      </p>
      {card.steps && (
        <ol className="mt-3 flex flex-col gap-2 text-sm">
          {card.steps.map((s, i) => (
            <li key={s} className="flex items-start gap-2.5">
              <b
                className={cn(
                  "inline-flex size-[22px] flex-none items-center justify-center rounded-full text-xs",
                  honey
                    ? "bg-ink text-honey"
                    : ink
                      ? "bg-honey text-[#17140f]"
                      : "bg-honey-tint text-honey-text",
                )}
              >
                {i + 1}
              </b>
              {s}
            </li>
          ))}
        </ol>
      )}
      {card.src && (
        <p
          className={cn(
            "mt-3.5 text-xs",
            honey ? "text-[#4a3000]" : ink ? "opacity-70" : "text-ink-3",
          )}
        >
          {card.src}
        </p>
      )}
    </article>
  );
}

function VideoTile({
  video,
  soundOn,
  onSound,
  copy,
}: {
  video: Video;
  soundOn: boolean;
  onSound: (el: HTMLVideoElement | null) => void;
  copy: boolean;
}) {
  return (
    <figure
      aria-hidden={copy || undefined}
      className="border-line relative m-0 aspect-[4/5] flex-none overflow-hidden rounded-[22px] border"
    >
      <video
        src={video.src}
        poster={video.poster}
        muted
        autoPlay
        loop
        playsInline
        preload="metadata"
        aria-label={copy ? undefined : video.label}
        className="block size-full object-cover"
      />
      <span className="absolute top-3 left-3 rounded-full bg-[rgba(23,20,15,0.72)] px-2.5 py-1 text-[11px] font-semibold text-[#faf8f3] backdrop-blur-sm">
        AI presenter
      </span>
      {!copy && (
        <button
          type="button"
          onClick={(e) => onSound(e.currentTarget.parentElement?.querySelector("video") ?? null)}
          aria-label={soundOn ? "Turn sound off" : "Turn sound on"}
          aria-pressed={soundOn}
          className="absolute right-3 bottom-3 flex size-11 items-center justify-center rounded-full bg-[rgba(23,20,15,0.6)] text-[#faf8f3] backdrop-blur-sm hover:bg-[rgba(23,20,15,0.8)]"
        >
          {soundOn ? <Volume2 className="size-[18px]" /> : <VolumeX className="size-[18px]" />}
        </button>
      )}
    </figure>
  );
}

export function AuthWall({ kind }: { kind: "signin" | "signup" }) {
  const [paused, setPaused] = useState(false);
  const [sound, setSound] = useState<string | null>(null);
  const cols = columnsFor(kind);

  return (
    <aside
      aria-label={kind === "signin" ? "Tips" : "Why Waggle"}
      className="relative flex h-full justify-center"
    >
      <div
        data-paused={paused}
        className="auth-wall grid h-full w-full max-w-[940px] grid-cols-2 gap-5 px-8 xl:grid-cols-3"
      >
        {cols.map((list, i) => {
          // Each column holds its tiles twice over (three times for short columns, so a half is
          // always taller than the screen); it drifts by exactly one half, so the loop is seamless.
          const reps = list.length < 3 ? 3 : 2;
          const half = Array.from({ length: reps }, () => list).flat();
          return (
            <div
              key={i}
              className={cn(
                "auth-col flex flex-col gap-5",
                i % 2 === 1 && "auth-col-rev",
                i === 2 && "max-xl:hidden",
              )}
              style={{ animationDuration: `${(100 + i * 18) * reps}s` }}
            >
              {[...half, ...half].map((tile, j) => {
                const copy = j >= list.length;
                const key = `${i}-${j}`;
                if (typeof tile === "string") {
                  const id = `${i}-${tile}`;
                  return (
                    <VideoTile
                      key={key}
                      video={VIDEOS[tile]}
                      copy={copy}
                      soundOn={sound === id}
                      onSound={(el) => {
                        document
                          .querySelectorAll<HTMLVideoElement>(".auth-wall video")
                          .forEach((v) => {
                            v.muted = true;
                          });
                        if (sound !== id && el) {
                          el.muted = false;
                          void el.play().catch(() => {});
                        }
                        setSound(sound === id ? null : id);
                      }}
                    />
                  );
                }
                return (
                  <div key={key} aria-hidden={copy || undefined} className="contents">
                    <WallCard card={tile} />
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      <button
        type="button"
        onClick={() => setPaused((p) => !p)}
        aria-pressed={paused}
        className="border-line bg-surface text-ink-2 absolute bottom-5 left-6 z-10 inline-flex min-h-10 items-center gap-2 rounded-full border px-3.5 text-[13px] font-semibold"
      >
        {paused ? (
          <Play className="size-4" aria-hidden />
        ) : (
          <Pause className="size-4" aria-hidden />
        )}
        {paused ? "Play motion" : "Pause motion"}
      </button>
    </aside>
  );
}
