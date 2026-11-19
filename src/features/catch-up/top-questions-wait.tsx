"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { GENERIC_AFTER_MS, questionsWaitView, refreshKey, WAIT_POLL_MS } from "./busy-rules";
import { parseProgress } from "./progress-schema";

const PROGRESS_URL = "/api/catch-up/progress";

/** Three honey dots, still with reduced motion. */
function Dots() {
  return (
    <span className="flex items-center gap-1" aria-hidden>
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="bg-honey size-1.5 animate-pulse rounded-full motion-reduce:animate-none"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
  );
}

/** Asks every 3 seconds; refreshes the page once the questions are in (or there won't be any). */
function useRefreshWhenReady() {
  const router = useRouter();
  const done = useRef(false);
  useEffect(() => {
    const id = setInterval(async () => {
      if (done.current) return;
      try {
        const res = await fetch(PROGRESS_URL, { cache: "no-store" });
        if (res.status !== 200) return;
        const p = parseProgress(await res.json());
        if (p && refreshKey(p)) {
          done.current = true;
          clearInterval(id);
          router.refresh();
        }
      } catch {
        // Offline or a bad answer: ask again next time.
      }
    }, WAIT_POLL_MS);
    return () => clearInterval(id);
  }, [router]);
}

/**
 * Setup step 3 on a busy account (decided 20 Nov): Waggle is still reading, so the customers' own
 * questions aren't in yet. The first minute shows only this card; after that the usual questions
 * (`children`) show below with a note. Either way the page refreshes once they're ready.
 */
export function TopQuestionsWait({
  children,
  skip,
}: {
  children: ReactNode;
  /** "Skip for now", shown while the questions are hidden. */
  skip: ReactNode;
}) {
  useRefreshWhenReady();
  const [elapsedMs, setElapsedMs] = useState(0);
  useEffect(() => {
    const id = setTimeout(() => setElapsedMs(GENERIC_AFTER_MS), GENERIC_AFTER_MS);
    return () => clearTimeout(id);
  }, []);
  const view = questionsWaitView({ waiting: true, ready: false, elapsedMs });

  return (
    <>
      <div role="status" className="card flex items-start gap-3 p-5">
        <span className="mt-2">
          <Dots />
        </span>
        <span className="flex flex-col gap-0.5">
          <b className="font-semibold">Waggle is still reading your inbox.</b>
          <span className="text-ink-2 text-sm">
            Your customers’ questions show up here in a minute.
          </span>
        </span>
      </div>
      {view === "waiting" && <div className="flex justify-end">{skip}</div>}
      {view === "waiting-with-questions" && (
        <>
          <p className="text-ink-2 text-sm">
            Waggle is still reading a busy inbox. You can answer these now; your customers’ own
            questions will appear here when they’re ready.
          </p>
          {children}
        </>
      )}
    </>
  );
}

/** Setup step 4 on a busy account: one quiet line while the practice uses sample questions. */
export function PracticeWait() {
  useRefreshWhenReady();
  return (
    <p role="status" className="text-ink-2 flex items-center gap-2 text-sm">
      <Dots />
      Waggle is still reading your inbox — practising with sample questions for now.
    </p>
  );
}
