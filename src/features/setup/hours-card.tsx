"use client";

import { useState } from "react";
import { cn } from "cn";
import { Switch } from "@/components/app/switch";
import {
  DAY_KEYS,
  DAY_LABEL,
  dayName,
  formatHours,
  fromHHMM,
  openDaysOf,
  toHHMM,
  weekOf,
  type OpenDay,
  type Week,
} from "./chat-hours";
import { Said } from "./fix-editors";
import { PRIMARY, QUIET } from "./setup-frame";

// The week editor (user change, 23 Nov, as the replica's): seven rows, Mon to Sun, each a real
// switch (open or closed) with from and to times when open. What customers will see is written
// under it, from the week (never from the AI). Copied from the replica's HoursForm (24 Nov):
// "From what you said" over it when typing opened it; no "Same every day" (the replica has none).

const timeInput =
  "bg-subtle focus:ring-honey w-[72px] rounded-lg px-1 py-1 text-center text-[13px] tabular-nums outline-none focus:ring-2 sm:w-[88px] sm:text-sm";

export function HoursCard({
  days,
  hint = "",
  busy,
  onSave,
  onCancel,
}: {
  /** What the owner typed, when that opened the editor. */
  hint?: string;
  /** The prefill: the open days (the rest closed). */
  days: OpenDay[];
  busy: boolean;
  onSave: (days: OpenDay[]) => void;
  /** No Cancel where "Skip for now" is the way out (the missing hours). */
  onCancel?: () => void;
}) {
  const [base] = useState<Week>(() => weekOf(days));
  const [week, setWeek] = useState<Week>(base);
  const set = (i: number, d: Partial<Week[number]>) =>
    setWeek((w) => w.map((x, n) => (n === i ? { ...x, ...d } : x)));
  const anyOpen = week.some((d) => d.open);
  return (
    <div className="flex flex-col gap-2">
      <Said hint={hint} />
      <div className="card flex flex-col gap-2 px-2.5 py-2.5 sm:px-3">
        <ul className="flex flex-col" aria-label="Opening hours">
          {DAY_KEYS.map((key, i) => {
            const d = week[i];
            const changed = JSON.stringify(d) !== JSON.stringify(base[i]);
            return (
              <li
                key={key}
                className={cn(
                  "flex min-h-11 items-center gap-1.5 rounded-lg px-1.5 sm:gap-2.5",
                  changed && "bg-honey-tint",
                )}
              >
                <span className="w-8 shrink-0 text-[13.5px] font-medium">{DAY_LABEL[key]}</span>
                <Switch
                  type="button"
                  on={d.open}
                  label={`Open on ${dayName(key)}`}
                  disabled={busy}
                  onClick={() => set(i, { open: !d.open })}
                />
                <span className="ml-auto flex items-center gap-1">
                  {d.open ? (
                    <>
                      <input
                        type="time"
                        value={toHHMM(d.from)}
                        disabled={busy}
                        onChange={(e) => {
                          const m = fromHHMM(e.target.value);
                          if (m !== null) set(i, { from: m });
                        }}
                        aria-label={`${dayName(key)} opens at`}
                        className={timeInput}
                      />
                      <span aria-hidden className="text-ink-3">
                        –
                      </span>
                      <input
                        type="time"
                        value={toHHMM(d.to)}
                        disabled={busy}
                        onChange={(e) => {
                          const m = fromHHMM(e.target.value);
                          if (m !== null) set(i, { to: m });
                        }}
                        aria-label={`${dayName(key)} closes at`}
                        className={timeInput}
                      />
                    </>
                  ) : (
                    <span className="text-ink-3 text-[13px]">Closed</span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
      <p className="text-ink-2 px-1 text-[13px]" aria-live="polite">
        Customers will see <b className="text-ink font-semibold">{formatHours(week)}</b>
      </p>
      <span className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className={PRIMARY}
          disabled={busy || !anyOpen}
          data-busy={busy || undefined}
          onClick={() => onSave(openDaysOf(week))}
        >
          {busy ? "Saving…" : "Save hours"}
        </button>
        {onCancel && (
          <button type="button" className={QUIET} disabled={busy} onClick={onCancel}>
            Cancel
          </button>
        )}
      </span>
      {!anyOpen && <p className="text-ink-3 px-1 text-xs">Turn on at least one day to save.</p>}
    </div>
  );
}
