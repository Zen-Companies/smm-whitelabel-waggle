"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { z } from "zod";
// Straight to the pure modules, not the catch-up barrel: it re-exports server-only code, which a
// client component can't import (Turbopack).
import { phaseLine, phaseProgress } from "@/features/catch-up/first-connect-copy";
import { parseProgress, POLL_MS } from "@/features/catch-up/progress-schema";
import type { CatchUpProgress } from "@/features/catch-up";
import { STRIP_DAYS, type StripDay } from "./day-strip";
import { DayStripView } from "./day-strip-view";
import { readingHealth, readingTiles, STARTING_READ_MS, type ReadingHealth } from "./reading";
import { QUIET, ScreenTitle, Tile } from "./setup-frame";

const PROGRESS_URL = "/api/catch-up/progress";
const STRIP_URL = "/api/setup/strip";
/** While reading, the page's parts 2 and 3 are fetched again this often (they fill in live). */
const REFRESH_MS = 10_000;
const count = z.number().int().min(0);
const stripSchema = z.object({
  days: z.array(z.object({ dms: count, comments: count, noReply: count })).length(STRIP_DAYS),
});

export interface Reading {
  progress: CatchUpProgress | null;
  days: StripDay[];
  health: ReadingHealth;
  checkAgain: () => void;
}

const ReadingContext = createContext<Reading | null>(null);

/** The live reading from the ReadingProvider around step 2, or null outside it. */
export const useReading = (): Reading | null => useContext(ReadingContext);

/**
 * Step 2's reading, for the whole page (board "Setup, start to finish", approved 23 Nov): it sits
 * around the parts, so the reading keeps going while the owner opens "What they wanted" and
 * "Waggle's replies". It asks for the counters every 2 s, fetches the page again every 10 s (and
 * when the phase moves) so the other parts fill in, and once more when it's done. If nothing moves
 * for a long time or the asks keep failing, it stops and says so, with Check again.
 */
export function ReadingProvider({
  initial,
  days: initialDays,
  children,
}: {
  initial: CatchUpProgress | null;
  days: StripDay[];
  children: ReactNode;
}) {
  const router = useRouter();
  const [progress, setProgress] = useState(initial);
  const [days, setDays] = useState(initialDays);
  const [health, setHealth] = useState<ReadingHealth>("ok");
  const [round, setRound] = useState(0);
  const catchUpId = initial?.catchUpId ?? null;
  const phase = progress?.phase ?? null;
  const polling = catchUpId !== null && phase !== "ready" && health === "ok";

  useEffect(() => {
    if (!polling) return;
    let failures = 0;
    let lastChangeAt = Date.now();
    let lastSeen = "";
    let lastRefresh = Date.now();
    const id = setInterval(async () => {
      try {
        const res = await fetch(PROGRESS_URL, { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const next = parseProgress(await res.json());
        failures = 0;
        if (next && next.catchUpId === catchUpId) {
          const seen = JSON.stringify(next);
          if (seen !== lastSeen) {
            lastSeen = seen;
            lastChangeAt = Date.now();
          }
          setProgress(next);
        }
        const strip = await fetch(STRIP_URL, { cache: "no-store" });
        if (strip.status === 200) {
          const parsed = stripSchema.safeParse(await strip.json());
          if (parsed.success) setDays(parsed.data.days);
        }
        if (Date.now() - lastRefresh >= REFRESH_MS) {
          lastRefresh = Date.now();
          router.refresh();
        }
      } catch {
        failures += 1;
      }
      const h = readingHealth({ failures, lastChangeAt, now: Date.now() });
      if (h !== "ok") setHealth(h);
    }, POLL_MS);
    return () => clearInterval(id);
  }, [polling, catchUpId, router, round]);

  // A new phase (sorted, written, done): the other parts are fetched again at once.
  const lastPhase = useRef(phase);
  useEffect(() => {
    if (phase === lastPhase.current) return;
    lastPhase.current = phase;
    router.refresh();
  }, [phase, router]);

  const checkAgain = useCallback(() => {
    setHealth("ok");
    setRound((r) => r + 1);
    router.refresh();
  }, [router]);

  return (
    <ReadingContext.Provider value={{ progress, days, health, checkAgain }}>
      {children}
    </ReadingContext.Provider>
  );
}

/**
 * Step 2's reading scene while Waggle reads: the 30-day strip with the bee and the counters, all
 * plain, counting up in place. The numbers come from the ReadingProvider around the page.
 */
export function ReadingPart({
  initial,
  handle,
  days: initialDays,
  now,
}: {
  initial: CatchUpProgress;
  handle: string;
  days: StripDay[];
  /** ISO time the page was rendered (the strip's dates). */
  now: string;
}) {
  const reading = useContext(ReadingContext);
  const p = reading?.progress ?? initial;
  const days = reading?.days ?? initialDays;
  const health = reading?.health ?? "ok";
  return (
    <div className="flex flex-col gap-3">
      <p className="text-ink-2 text-[13.5px]">
        {handle} is connected. Not the right account?{" "}
        <Link href="/settings/accounts" className="link-inline">
          Switch
        </Link>
      </p>
      <DayStripView
        days={days}
        now={now}
        progress={health === "ok" && p.phase !== "ready" ? phaseProgress(p.phase) : undefined}
      />
      <div className="flex gap-2" aria-live="polite">
        {readingTiles(p).map((c) => (
          <Tile key={c.key} value={c.value} label={c.label} note={c.note} tone={c.tone} />
        ))}
      </div>
      {health === "ok" ? (
        <span className="text-ink-3 text-[12.5px]">{phaseLine(p.phase, p.platform)}</span>
      ) : (
        <div
          role="status"
          className="border-line bg-surface flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-3 py-2.5 text-[13px]"
        >
          <span className="min-w-[200px] flex-1">
            <b className="font-semibold">
              {health === "offline"
                ? "Waggle can’t check how the reading is going"
                : "This is taking longer than usual"}
            </b>
            <br />
            <span className="text-ink-2">
              {health === "offline"
                ? "Your connection may have dropped. Nothing is lost."
                : "Waggle keeps reading in the background. You can keep going."}
            </span>
          </span>
          <button type="button" className={QUIET} onClick={() => reading?.checkAgain()}>
            Check again
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Step 2 in the moment between the account's connect and its read starting (the webhook saves the
 * account, then starts the catch-up): shows reading, and fetches the page again every 2 s until
 * the read shows up (then the story opens with its reading scene). Stops after a couple of minutes
 * (the server then stops calling it "starting").
 */
export function StartingRead({
  handle,
  days,
  now,
}: {
  handle: string;
  days: StripDay[];
  /** ISO time the page was rendered. */
  now: string;
}) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), POLL_MS);
    const stop = setTimeout(() => clearInterval(id), STARTING_READ_MS);
    return () => {
      clearInterval(id);
      clearTimeout(stop);
    };
  }, [router]);
  return (
    <>
      <ScreenTitle title="Reading your last 30 days…" sub="About two minutes." />
      <div className="flex flex-col gap-3" role="status" aria-live="polite">
        <p className="text-ink-2 text-[13.5px]">
          {handle} is connected. Not the right account?{" "}
          <Link href="/settings/accounts" className="link-inline">
            Switch
          </Link>
        </p>
        <DayStripView days={days} now={now} progress={0} />
        <span className="text-ink-3 text-[12.5px]">Starting to read…</span>
      </div>
    </>
  );
}
