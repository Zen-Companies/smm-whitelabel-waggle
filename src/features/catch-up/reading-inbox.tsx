"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { platformLabel } from "@/lib/social/platforms";
import { atHandle, phaseLine, phaseProgress, readingCounters } from "./first-connect-copy";
import { parseProgress, POLL_MS } from "./progress-schema";
import type { CatchUpProgress } from "./reveal-data";

const PROGRESS_URL = "/api/catch-up/progress";

/**
 * "Reading your inbox…" (board "Live", approved 20 Nov): counters that move while Waggle reads,
 * asked for every 2 seconds (no Realtime). The owner can keep going. A missing or broken answer
 * keeps the last counters; polling stops once the catch-up is ready.
 */
export function ReadingInbox({
  initial,
  next,
  refreshWhenReady = false,
}: {
  initial: CatchUpProgress;
  /** "Next: your top answers" in setup. Left out on the reveal page. */
  next?: { href: string; label: string };
  /** The reveal page: show the reveal itself once ready. */
  refreshWhenReady?: boolean;
}) {
  const router = useRouter();
  const [p, setP] = useState(initial);
  const [commentsOnly, setCommentsOnly] = useState(false);
  const [checking, setChecking] = useState(false);
  const [stillOff, setStillOff] = useState(false);
  const refreshed = useRef(false);

  const poll = useCallback(async (): Promise<CatchUpProgress | null> => {
    try {
      const res = await fetch(PROGRESS_URL, { cache: "no-store" });
      if (!res.ok) return null;
      const next = parseProgress(await res.json());
      if (next && next.catchUpId === initial.catchUpId) {
        setP(next);
        return next;
      }
    } catch {
      // Offline or the route isn't there yet: keep the last counters.
    }
    return null;
  }, [initial.catchUpId]);

  useEffect(() => {
    if (p.phase === "ready") return;
    const id = setInterval(() => void poll(), POLL_MS);
    return () => clearInterval(id);
  }, [p.phase, poll]);

  useEffect(() => {
    if (refreshWhenReady && p.phase === "ready" && !refreshed.current) {
      refreshed.current = true;
      router.refresh();
    }
  }, [p.phase, refreshWhenReady, router]);

  const platform = platformLabel(p.platform);
  const handle = atHandle(p.handle, platform);
  const ready = p.phase === "ready";
  const counters = readingCounters(p);
  const showDmFix = p.dmAccessMissing && !commentsOnly;

  return (
    <section className="flex flex-col gap-5" aria-labelledby="reading-title">
      <div>
        <h1 id="reading-title" className="page-title">
          {ready ? "Waggle read your inbox" : "Reading your inbox…"}
        </h1>
        <p className="text-ink-2 mt-1">
          {handle} is connected.{" "}
          {ready
            ? "Waggle read the last 30 days."
            : "Waggle is reading the last 30 days. This takes about two minutes, and you can keep going."}{" "}
          Not the right account?{" "}
          <Link href="/settings/accounts" className="link-inline">
            Switch
          </Link>
        </p>
      </div>

      {showDmFix && (
        <div className="border-honey-border bg-honey-tint rounded-xl border p-5">
          <h2 className="section-title">Waggle can see comments, but not messages</h2>
          <p className="text-ink-2 mt-1 text-sm">
            {platform} is set to keep messages away from apps. To let Waggle read them:
          </p>
          <ol className="text-ink-2 mt-2 list-decimal space-y-1 pl-5 text-sm">
            <li>In {platform}, open Settings → Messages and story replies → Message controls.</li>
            <li>Turn on Allow access to messages.</li>
            <li>Come back and tap Check again.</li>
          </ol>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="primary"
              disabled={checking}
              data-busy={checking || undefined}
              onClick={async () => {
                setChecking(true);
                const next = await poll();
                setChecking(false);
                setStillOff(next ? next.dmAccessMissing : true);
              }}
            >
              {checking ? "Checking…" : "Check again"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setCommentsOnly(true)}>
              Carry on with comments only
            </Button>
          </div>
          {stillOff && !checking && (
            <p role="status" className="text-ink-2 mt-3 text-sm">
              Still off. It can take a minute after you turn it on.
            </p>
          )}
        </div>
      )}

      <div className="card p-5">
        <ul className="grid gap-4 sm:grid-cols-3" aria-live="polite">
          {counters.map((c) => (
            <li key={c.key} className="flex flex-col gap-0.5">
              <b className="font-display text-[34px] leading-none font-semibold tabular-nums">
                {c.value}
              </b>
              <span className="text-ink-2 text-sm">{c.label}</span>
              {c.note && <span className="meta">{c.note}</span>}
            </li>
          ))}
        </ul>
        <div
          className="bg-subtle mt-5 h-2 overflow-hidden rounded-full"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={phaseProgress(p.phase)}
          aria-label="How far Waggle has read"
        >
          <div
            className="bg-honey h-full rounded-full transition-[width] duration-150"
            style={{ width: `${phaseProgress(p.phase)}%` }}
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <span className="meta">{phaseLine(p.phase, p.platform)}</span>
          {next && (
            <Link href={next.href} className={buttonVariants({ variant: "primary" })}>
              {next.label}
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
