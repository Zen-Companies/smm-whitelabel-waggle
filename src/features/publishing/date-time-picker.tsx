"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import type { BestChip } from "./best-chips";
import {
  dayName,
  from12h,
  isPastDay,
  monthGrid,
  monthOf,
  monthTitle,
  pickLabel,
  shiftMonthKey,
  stepTime,
  to12h,
} from "./picker";
import { fromWallClock, zoneLine } from "./post-time";

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const MINUTES = [0, 15, 30, 45];
const MIN_AHEAD_MS = 5 * 60_000;

/** Days as "YYYY-MM-DD" moved by whole days (keyboard on the month). */
function addDays(day: string, by: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + by));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
}

export interface PickerProps {
  /** Where it starts (wall clock in `timeZone`). */
  start: { day: string; time: string };
  /** Today in `timeZone`. */
  today: string;
  timeZone: string;
  /** "Your posts do best at:" chips, or null while Waggle is still learning. */
  chips: BestChip[] | null;
  /** Days that already have a post (a small honey dot). */
  busyDays?: readonly string[];
  /** The main button's verb: "Move to", "Use", "Reschedule to". */
  verb: string;
  onPick: (day: string, time: string) => void;
  onCancel: () => void;
  pending?: boolean;
  error?: string | null;
  /** A heading on top (the phone sheet says what the picker is for). */
  title?: string;
}

/**
 * Waggle's own date and time picker (Posts Round 3, approved 25 Nov): the month with today ringed
 * in honey, the picked day an ink pill, past days greyed, a dot under days that already have a
 * post; the best-time chips; the time in 15-minute steps with AM/PM; "Times in <zone>"; Cancel
 * and a button naming the result. Escape cancels. Arrow keys move through the days.
 */
export function DateTimePicker({
  start,
  today,
  timeZone,
  chips,
  busyDays = [],
  verb,
  onPick,
  onCancel,
  pending = false,
  error = null,
  title,
}: PickerProps) {
  const [day, setDay] = useState(start.day < today ? today : start.day);
  const [time, setTime] = useState(stepTime(start.time, 0));
  const [month, setMonth] = useState(monthOf(start.day < today ? today : start.day));
  const [focusDay, setFocusDay] = useState(day);
  const grid = useRef<HTMLDivElement>(null);
  const moved = useRef(false);
  const busy = new Set(busyDays);
  const { hour, minute, pm } = to12h(time);
  const [now] = useState(() => Date.now());
  const tooSoon = fromWallClock(day, time, timeZone).getTime() < now + MIN_AHEAD_MS;

  useEffect(() => {
    // Keyboard focus follows the arrow keys (not on first render: the picked day is focused).
    if (!moved.current) return;
    grid.current?.querySelector<HTMLButtonElement>(`[data-day="${focusDay}"]`)?.focus();
  }, [focusDay, month]);

  useEffect(() => {
    grid.current?.querySelector<HTMLButtonElement>(`[data-day="${day}"]`)?.focus();
    // Only when the picker opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const go = (next: string) => {
    if (isPastDay(next, today)) return;
    moved.current = true;
    setFocusDay(next);
    if (monthOf(next) !== month) setMonth(monthOf(next));
  };

  return (
    <div
      className="flex flex-col gap-3"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          // Closes the picker only, not the window under it.
          e.stopPropagation();
          onCancel();
        }
      }}
    >
      {title && <h3 className="section-title">{title}</h3>}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          aria-label="Previous month"
          disabled={month <= monthOf(today)}
          onClick={() => setMonth(shiftMonthKey(month, -1))}
          className="border-line-strong bg-surface flex size-9 items-center justify-center rounded-md border disabled:opacity-40"
        >
          <ChevronLeft className="size-4" strokeWidth={1.75} aria-hidden />
        </button>
        <span className="font-heading text-lg font-semibold" aria-live="polite">
          {monthTitle(month)}
        </span>
        <button
          type="button"
          aria-label="Next month"
          onClick={() => setMonth(shiftMonthKey(month, 1))}
          className="border-line-strong bg-surface flex size-9 items-center justify-center rounded-md border"
        >
          <ChevronRight className="size-4" strokeWidth={1.75} aria-hidden />
        </button>
      </div>
      <div
        ref={grid}
        role="grid"
        aria-label={monthTitle(month)}
        className="flex flex-col gap-1"
        onKeyDown={(e) => {
          const by = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
          if (by === undefined) return;
          e.preventDefault();
          go(addDays(focusDay, by));
        }}
      >
        <div role="row" className="text-ink-3 grid grid-cols-7 text-center text-xs font-medium">
          {WEEKDAYS.map((w) => (
            <span key={w} role="columnheader">
              {w}
            </span>
          ))}
        </div>
        {monthGrid(month).map((week, i) => (
          <div role="row" key={i} className="grid grid-cols-7 gap-1">
            {week.map((d, j) =>
              d ? (
                <span role="gridcell" key={d} className="flex justify-center">
                  <button
                    type="button"
                    data-day={d}
                    tabIndex={d === focusDay ? 0 : -1}
                    disabled={isPastDay(d, today)}
                    aria-pressed={d === day}
                    aria-current={d === today ? "date" : undefined}
                    aria-label={`${dayName(d)}${busy.has(d) ? ", has a post" : ""}`}
                    onClick={() => {
                      setDay(d);
                      setFocusDay(d);
                    }}
                    className={cn(
                      "relative flex size-9 items-center justify-center rounded-full text-sm tabular-nums transition-colors",
                      d === day
                        ? "bg-ink text-surface font-semibold"
                        : d === today
                          ? "ring-honey font-semibold ring-2 ring-inset"
                          : "hover:bg-subtle",
                      "disabled:text-ink-4 disabled:hover:bg-transparent",
                    )}
                  >
                    {Number(d.slice(8))}
                    {busy.has(d) && (
                      <span
                        aria-hidden
                        className={cn(
                          "absolute bottom-1 size-1 rounded-full",
                          d === day ? "bg-honey" : "bg-honey-text",
                        )}
                      />
                    )}
                  </button>
                </span>
              ) : (
                <span role="gridcell" key={`blank-${j}`} />
              ),
            )}
          </div>
        ))}
      </div>

      {chips ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-ink-2 text-sm">Your posts do best at:</span>
          {chips.map((c) => {
            const on = c.day === day && c.time === time;
            return (
              <button
                key={`${c.day}-${c.time}`}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  setDay(c.day);
                  setFocusDay(c.day);
                  setMonth(monthOf(c.day));
                  setTime(c.time);
                }}
                className={cn(
                  "inline-flex min-h-8 items-center rounded-full border px-3 text-xs font-semibold",
                  on
                    ? "border-honey bg-honey-tint text-ink"
                    : "border-line-strong bg-surface hover:bg-subtle",
                )}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="meta">Waggle learns your best times after a few posts.</p>
      )}

      <fieldset className="flex flex-wrap items-center gap-2">
        <legend className="sr-only">Time</legend>
        <span className="text-sm font-medium" aria-hidden>
          Time
        </span>
        <label className="sr-only" htmlFor="picker-hour">
          Hour
        </label>
        <select
          id="picker-hour"
          value={hour}
          onChange={(e) => setTime(from12h(Number(e.target.value), minute, pm))}
          className="field w-[4.5rem] tabular-nums"
        >
          {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>
        <span aria-hidden>:</span>
        <label className="sr-only" htmlFor="picker-minute">
          Minutes
        </label>
        <select
          id="picker-minute"
          value={minute}
          onChange={(e) => setTime(from12h(hour, Number(e.target.value), pm))}
          className="field w-[4.5rem] tabular-nums"
        >
          {MINUTES.map((m) => (
            <option key={m} value={m}>
              {String(m).padStart(2, "0")}
            </option>
          ))}
        </select>
        <div className="segmented" role="radiogroup" aria-label="Morning or afternoon">
          {(["AM", "PM"] as const).map((half) => (
            <button
              key={half}
              type="button"
              role="radio"
              aria-checked={(half === "PM") === pm}
              data-active={(half === "PM") === pm || undefined}
              onClick={() => setTime(from12h(hour, minute, half === "PM"))}
            >
              {half}
            </button>
          ))}
        </div>
        <span className="meta">15-minute steps</span>
      </fieldset>
      <p className="meta">{zoneLine(timeZone)}</p>
      {(error || tooSoon) && (
        <p role="alert" className="text-danger text-sm">
          {error ?? "That time has already passed. Pick a later one."}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button type="button" variant="quiet" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="primary"
          disabled={pending || tooSoon}
          onClick={() => onPick(day, time)}
        >
          {pending ? "Saving…" : pickLabel(verb, day, time)}
        </Button>
      </div>
    </div>
  );
}

/**
 * Where the picker sits: in place (the post panel) or above its field (the composer footer) on a
 * computer, and as a sheet from the bottom on a phone.
 */
export function PickerShell({
  placement,
  onDismiss,
  children,
  label,
}: {
  placement: "inline" | "popover";
  onDismiss: () => void;
  children: React.ReactNode;
  label: string;
}) {
  return (
    <>
      <div
        aria-hidden
        onClick={onDismiss}
        className={cn(
          "bg-ink/30 fixed inset-0 z-[84] sm:hidden",
          placement === "popover" && "sm:block sm:bg-transparent",
        )}
      />
      <div
        role="dialog"
        aria-label={label}
        className={cn(
          "bg-surface border-line z-[85] border p-4 shadow-[0_12px_32px_rgba(23,20,15,0.14)]",
          "max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:max-h-[92dvh] max-sm:overflow-y-auto max-sm:rounded-t-[24px] max-sm:pb-[max(16px,env(safe-area-inset-bottom))]",
          placement === "popover"
            ? "sm:absolute sm:right-0 sm:bottom-full sm:mb-2 sm:w-[360px] sm:rounded-[18px]"
            : "sm:relative sm:rounded-[18px]",
        )}
      >
        {children}
      </div>
    </>
  );
}
