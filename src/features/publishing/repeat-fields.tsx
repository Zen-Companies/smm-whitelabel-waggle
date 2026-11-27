"use client";

import {
  endsLabel,
  nextLine,
  previewSlots,
  REPEAT_MAX_COUNT,
  repeatChoiceProblem,
  repeatLabel,
  ruleFromFirst,
  type RepeatEnds,
  type RepeatEvery,
} from "./repeat-rule";

// Repeat in the composer's When (Posts Round 5, board section 2, approved 27 Nov): every day,
// week or month at the first post's weekday and time; until I stop it, until a date, or after N
// times; and "Next: Fri 28 Nov · Fri 5 Dec · Fri 12 Dec…" in the composer's zone. The same text
// and files go out each time.

export interface RepeatValue {
  every: RepeatEvery;
  ends: RepeatEnds;
  endDate: string;
  count: number;
}

const EVERY: { key: RepeatEvery; label: string }[] = [
  { key: "day", label: "Day" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
];

const ENDS: { key: RepeatEnds; label: string }[] = [
  { key: "never", label: "Until I stop it" },
  { key: "on", label: "Until a date" },
  { key: "after", label: "After a number of times" },
];

export function RepeatFields({
  value,
  onChange,
  first,
  timeZone,
}: {
  value: RepeatValue;
  onChange: (next: RepeatValue) => void;
  /** The first post's time, once picked. */
  first: Date | null;
  timeZone: string;
}) {
  const choice = {
    every: value.every,
    ends: value.ends,
    endDate: value.endDate || null,
    count: value.count,
  };
  const rule = first ? ruleFromFirst(choice, first, timeZone) : null;
  const problem = first ? repeatChoiceProblem(choice, first, timeZone) : null;
  const preview = rule && first && !problem ? previewSlots(rule, first) : null;
  return (
    <div className="border-honey-border bg-honey-tint/60 flex w-full flex-col gap-2.5 rounded-xl border px-3.5 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">Every</span>
        <div className="segmented" role="radiogroup" aria-label="Repeat every">
          {EVERY.map((e) => (
            <button
              key={e.key}
              type="button"
              role="radio"
              aria-checked={value.every === e.key}
              data-active={value.every === e.key || undefined}
              onClick={() => onChange({ ...value, every: e.key })}
            >
              {e.label}
            </button>
          ))}
        </div>
        {rule && <span className="text-sm">{repeatLabel(rule)}</span>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="repeat-ends" className="sr-only">
          Ends
        </label>
        <select
          id="repeat-ends"
          value={value.ends}
          onChange={(e) => onChange({ ...value, ends: e.target.value as RepeatEnds })}
          className="field min-h-10 w-auto"
        >
          {ENDS.map((e) => (
            <option key={e.key} value={e.key}>
              {e.label}
            </option>
          ))}
        </select>
        {value.ends === "on" && (
          <>
            <label htmlFor="repeat-end-date" className="sr-only">
              Last day
            </label>
            <input
              id="repeat-end-date"
              type="date"
              value={value.endDate}
              onChange={(e) => onChange({ ...value, endDate: e.target.value })}
              className="field min-h-10 w-auto"
            />
          </>
        )}
        {value.ends === "after" && (
          <span className="flex items-center gap-2 text-sm">
            <label htmlFor="repeat-count" className="sr-only">
              Times in all
            </label>
            <input
              id="repeat-count"
              type="number"
              inputMode="numeric"
              min={2}
              max={REPEAT_MAX_COUNT}
              value={value.count}
              onChange={(e) =>
                onChange({ ...value, count: Math.max(0, Math.round(Number(e.target.value) || 0)) })
              }
              className="field min-h-10 w-20"
            />
            times in all
          </span>
        )}
      </div>
      {problem ? (
        <p role="alert" className="text-danger text-sm">
          {problem}
        </p>
      ) : preview ? (
        <p className="text-sm tabular-nums">
          <span className="font-medium">{nextLine(preview.slots, preview.more, timeZone)}</span>
          {rule && rule.ends !== "never" && (
            <span className="text-ink-3"> · {endsLabel(rule)}</span>
          )}
        </p>
      ) : (
        <p className="meta">Pick when the first one goes out.</p>
      )}
      <p className="meta">
        The same text and photos go out each time. Stop it any time from the post.
      </p>
    </div>
  );
}
