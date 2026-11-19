"use client";

import { useEffect, useState } from "react";
import { sendingCopy } from "./first-approval";
import type { SendingProgress } from "./send-spacing";

/** How often the card asks for the latest count while replies go out. */
const POLL_MS = 5_000;

/**
 * "Sending 3 of 20…" (first connect board, 20 Nov): in place where the owner approves, while
 * several of the brand's replies wait their turn. Refreshes itself; gone when they're all out.
 */
export function SendingProgressCard({
  initial,
  platform,
  load,
}: {
  initial: SendingProgress | null;
  platform: string;
  load: () => Promise<SendingProgress | null>;
}) {
  const [progress, setProgress] = useState(initial);
  // A new approval re-renders the page with a fresh count.
  const [seen, setSeen] = useState(initial);
  if (initial !== seen) {
    setSeen(initial);
    setProgress(initial);
  }

  const active = progress !== null;
  useEffect(() => {
    if (!active) return;
    let stopped = false;
    const t = setInterval(() => {
      load()
        .then((next) => {
          if (!stopped) setProgress(next);
        })
        .catch(() => undefined);
    }, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(t);
    };
  }, [active, load]);

  if (!progress) return null;
  const copy = sendingCopy(progress, platform);
  const pct = Math.round((progress.sent / progress.total) * 100);
  return (
    <section className="card flex flex-col gap-2.5 px-5 py-4" role="status" aria-live="polite">
      <b className="font-display text-lg font-semibold">{copy.title}</b>
      <span
        className="bg-subtle h-2 overflow-hidden rounded-full"
        role="progressbar"
        aria-label="Replies sent"
        aria-valuenow={progress.sent}
        aria-valuemin={0}
        aria-valuemax={progress.total}
      >
        <span className="bg-honey block h-full" style={{ width: `${Math.max(pct, 4)}%` }} />
      </span>
      <p className="text-ink-2 text-sm">{copy.line}</p>
    </section>
  );
}
