"use client";

import { X } from "lucide-react";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { DAYS } from "./queue";
import { saveQueue, type QueueFormState } from "./queue-actions";

const SUGGESTED = ["09:00", "12:00", "18:00"];

function slotLabel(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
}

/**
 * Posts → Queue (T75, design "Posts · Queue: posting times"): times per day of the week, in one
 * time zone. "Next free slot" in the composer takes the soonest one that's still open.
 */
export function QueueForm({
  initialGrid,
  timezone,
  nextSlots,
}: {
  /** Times per day, index = dayOfWeek (0 = Sunday). */
  initialGrid: string[][];
  timezone: string | null;
  nextSlots: string[];
}) {
  const [state, action, pending] = useActionState<QueueFormState, FormData>(saveQueue, {});
  const [grid, setGrid] = useState(initialGrid);
  const [tz] = useState(() => timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [adding, setAdding] = useState<Record<number, string>>({});
  const next = state.nextSlots ?? nextSlots;
  const add = (day: number, time: string) => {
    if (!/^\d{2}:\d{2}$/.test(time)) return;
    setGrid((g) => g.map((t, i) => (i === day && !t.includes(time) ? [...t, time].sort() : t)));
  };
  const remove = (day: number, time: string) =>
    setGrid((g) => g.map((t, i) => (i === day ? t.filter((x) => x !== time) : t)));
  const empty = grid.every((t) => t.length === 0);

  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="timezone" value={tz} />
      {grid.map((times, day) => (
        <input key={day} type="hidden" name={`day-${day}`} value={times.join(",")} />
      ))}
      <ul className="card divide-line flex flex-col divide-y">
        {DAYS.map(({ dayOfWeek, label }) => (
          <li key={dayOfWeek} className="flex flex-wrap items-center gap-2 px-4 py-3">
            <span className="w-12 text-sm font-semibold">{label}</span>
            {grid[dayOfWeek].map((t) => (
              <span
                key={t}
                className="bg-subtle inline-flex min-h-8 items-center gap-1 rounded-full pr-1 pl-3 text-sm tabular-nums"
              >
                {t}
                <button
                  type="button"
                  aria-label={`Remove ${label} ${t}`}
                  onClick={() => remove(dayOfWeek, t)}
                  className="hover:bg-line inline-flex size-6 items-center justify-center rounded-full"
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              </span>
            ))}
            <span className="ml-auto flex items-center gap-1.5">
              <label htmlFor={`add-${dayOfWeek}`} className="sr-only">
                Add a time on {label}
              </label>
              <input
                id={`add-${dayOfWeek}`}
                type="time"
                value={adding[dayOfWeek] ?? ""}
                onChange={(e) => setAdding((a) => ({ ...a, [dayOfWeek]: e.target.value }))}
                className="field h-9 w-32 py-1"
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  add(dayOfWeek, adding[dayOfWeek] ?? "");
                  setAdding((a) => ({ ...a, [dayOfWeek]: "" }));
                }}
              >
                Add
              </Button>
            </span>
          </li>
        ))}
      </ul>
      {empty && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-ink-2">Start with weekday times:</span>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() =>
              setGrid((g) => g.map((t, day) => (day >= 1 && day <= 5 ? [...SUGGESTED] : t)))
            }
          >
            9 AM, 12 PM, 6 PM, Mon–Fri
          </Button>
        </div>
      )}
      <p className="meta">Times are in {tz}.</p>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Saving…" : "Save posting times"}
        </Button>
        {state.error && (
          <p role="alert" className="text-danger text-sm">
            {state.error}
          </p>
        )}
        {state.savedAt && !state.error && (
          <p role="status" className="text-sm">
            Saved.
          </p>
        )}
      </div>
      {next.length > 0 && (
        <section aria-labelledby="next-free" className="flex flex-col gap-1.5">
          <h2 id="next-free" className="text-sm font-semibold">
            Next free times
          </h2>
          <ul className="text-ink-2 flex flex-col gap-1 text-sm">
            {next.slice(0, 3).map((s) => (
              <li key={s}>{slotLabel(s)}</li>
            ))}
          </ul>
        </section>
      )}
    </form>
  );
}
