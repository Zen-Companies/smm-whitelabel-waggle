"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { buttonVariants } from "@/components/ui/button";
import type { BestTimeSlot } from "@/lib/social/analytics-types";
import { nextOccurrence, slotLabel, toLocalSlot, WEEKDAY_NAMES, hourLabel } from "./best-time";

// Times shown in the viewer's own time zone, which only the browser knows. The server render
// shows a placeholder; the browser fills it in (no hydration mismatch).

const noop = () => () => {};
const useIsClient = () =>
  useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );

/** "2:10 PM" today, "Nov 4, 2:10 PM" otherwise. */
export function LocalClock({ iso }: { iso: string }) {
  const client = useIsClient();
  if (!client) return <span>…</span>;
  const d = new Date(iso);
  const today = d.toDateString() === new Date().toDateString();
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return (
    <time dateTime={iso}>
      {today
        ? time
        : `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}, ${time}`}
    </time>
  );
}

/** "Sat Oct 26, 8:00 AM" */
export function LocalDateTime({ iso }: { iso: string }) {
  const client = useIsClient();
  if (!client) return <span>…</span>;
  const d = new Date(iso);
  return (
    <time dateTime={iso}>
      {d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })},{" "}
      {d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
    </time>
  );
}

/** "Saturday around 8 AM", for "What stood out". */
export function LocalSlotText({ slot }: { slot: BestTimeSlot }) {
  const client = useIsClient();
  if (!client) return <b className="font-semibold">…</b>;
  const local = toLocalSlot(slot, new Date().getTimezoneOffset());
  return (
    <b className="font-semibold">
      {WEEKDAY_NAMES[local.dayOfWeek]} around {hourLabel(local.hour, local.minute)}
    </b>
  );
}

/**
 * Best times to post, in local time, and a button that opens the Posts composer on the next
 * such day and time.
 */
export function BestTimes({ slots }: { slots: BestTimeSlot[] }) {
  const client = useIsClient();
  if (slots.length === 0) return null;
  const offset = client ? new Date().getTimezoneOffset() : 0;
  const local = slots.map((s) => toLocalSlot(s, offset));
  const next = client ? nextOccurrence(local[0], new Date()) : null;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span>
          <b className="font-semibold">Best times to post:</b>{" "}
          {client ? local.map(slotLabel).join(" · ") : "…"}
        </span>
        <span className="meta">From how your past posts did. Shown in your time zone.</span>
      </div>
      {next && (
        <Link
          href={`/posts?month=${next.day.slice(0, 7)}&day=${next.day}&time=${next.time}`}
          className={buttonVariants({ variant: "secondary" })}
        >
          Schedule a post for {slotLabel(local[0])}
        </Link>
      )}
    </div>
  );
}
