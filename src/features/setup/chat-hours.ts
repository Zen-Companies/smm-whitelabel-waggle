import { z } from "zod";

// Opening hours as a week (user change, 23 Nov, matching the replica's hours editor): step 3's
// chat edits hours day by day, never as free text. The AI may only prefill the week with
// structured days (zod-checked below); the owner saves it with "Save hours". The fact keeps one
// normalized line ("Mon–Sat 8am–6pm, Sun closed") that this file reads back. Pure, tested.

export const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type DayKey = (typeof DAY_KEYS)[number];
export const DAY_LABEL: Record<DayKey, string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};
const DAY_NAME: Record<DayKey, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};
export const dayName = (d: DayKey): string => DAY_NAME[d];

/** "08:00": 24-hour time, as a time input gives it. */
export const HHMM = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

/** One open day, as the AI returns it and the thread saves it. Days not listed are closed. */
export const openDaySchema = z.object({
  day: z.enum(DAY_KEYS),
  open: z.string().regex(HHMM),
  close: z.string().regex(HHMM),
});
export type OpenDay = z.infer<typeof openDaySchema>;

/** A week's open days: each day once, opening and closing not the same time. */
export const openDaysSchema = z
  .array(openDaySchema)
  .max(7)
  .refine((days) => new Set(days.map((d) => d.day)).size === days.length, "a day twice")
  .refine((days) => days.every((d) => d.open !== d.close), "opens and closes at once");

/** The editor's week: every day, minutes after midnight. */
export type DayHours = { open: boolean; from: number; to: number };
export type Week = DayHours[];

const NINE = 9 * 60;
const FIVE = 17 * 60;
export const closedWeek = (): Week => DAY_KEYS.map(() => ({ open: false, from: NINE, to: FIVE }));

export const toHHMM = (m: number): string =>
  `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export function fromHHMM(v: string): number | null {
  if (!HHMM.test(v)) return null;
  const [h, m] = v.split(":").map(Number);
  return h * 60 + m;
}

/** Pure: open days (from the AI or the thread) as the editor's week. */
export function weekOf(days: readonly OpenDay[]): Week {
  const week = closedWeek();
  for (const d of days) {
    const from = fromHHMM(d.open);
    const to = fromHHMM(d.close);
    if (from === null || to === null) continue;
    week[DAY_KEYS.indexOf(d.day)] = { open: true, from, to };
  }
  return week;
}

/** Pure: the editor's week as its open days. */
export function openDaysOf(week: Week): OpenDay[] {
  return week.flatMap((d, i) =>
    d.open ? [{ day: DAY_KEYS[i], open: toHHMM(d.from), close: toHHMM(d.to) }] : [],
  );
}

/** Pure: every day open with the first open day's hours (else 9am–5pm): "Same every day". */
export function sameEveryDay(week: Week): Week {
  const first = week.find((d) => d.open) ?? { open: true, from: NINE, to: FIVE };
  return week.map(() => ({ open: true, from: first.from, to: first.to }));
}

export function formatTime(m: number): string {
  const h = Math.floor(m / 60) % 24;
  const min = m % 60;
  const ap = h < 12 ? "am" : "pm";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${min ? `:${String(min).padStart(2, "0")}` : ""}${ap}`;
}

/** Pure: "Mon–Sat 8am–6pm, Sun closed", days with the same hours grouped. */
export function formatHours(week: Week): string {
  const key = (d: DayHours) => (d.open ? `${d.from}-${d.to}` : "closed");
  const parts: string[] = [];
  let i = 0;
  while (i < 7) {
    let j = i;
    while (j + 1 < 7 && key(week[j + 1]) === key(week[i])) j += 1;
    const a = DAY_LABEL[DAY_KEYS[i]];
    const days = i === j ? a : `${a}–${DAY_LABEL[DAY_KEYS[j]]}`;
    const d = week[i];
    parts.push(d.open ? `${days} ${formatTime(d.from)}–${formatTime(d.to)}` : `${days} closed`);
    i = j + 1;
  }
  return parts.join(", ");
}

// ---- reading a saved line back (our own format, and the common ones found on profiles) ---------

const DAY_RE: [RegExp, number][] = [
  [/^mon/, 0],
  [/^tue/, 1],
  [/^wed/, 2],
  [/^thu/, 3],
  [/^fri/, 4],
  [/^sat/, 5],
  [/^sun/, 6],
];

function dayIndex(w: string): number | null {
  for (const [re, n] of DAY_RE) if (re.test(w)) return n;
  return null;
}

/** "7am", "6:30pm", "18:00", or a bare hour (a closing time leans pm). */
export function parseTime(s: string, closing = false): number | null {
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i.exec(s.trim());
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  const ap = m[3]?.toLowerCase();
  if (h > 23 || min > 59) return null;
  if (ap === "pm" && h < 12) h += 12;
  else if (ap === "am" && h === 12) h = 0;
  else if (!ap && h <= 12 && (closing ? h < 12 : h < 6)) h += 12;
  return h * 60 + min;
}

/** The days a phrase names: "Mon–Sat", "weekends", "Sunday", "daily". */
function daysIn(spec: string): number[] {
  const s = spec.toLowerCase();
  if (/daily|every ?day/.test(s)) return [0, 1, 2, 3, 4, 5, 6];
  const out = new Set<number>();
  if (/weekdays?/.test(s)) [0, 1, 2, 3, 4].forEach((d) => out.add(d));
  if (/weekends?/.test(s)) [5, 6].forEach((d) => out.add(d));
  const range = /([a-z]{3,9})\s*(?:-|–|to)\s*([a-z]{3,9})/.exec(s);
  if (range) {
    const a = dayIndex(range[1]);
    const b = dayIndex(range[2]);
    if (a !== null && b !== null)
      for (let n = 0; n <= (b - a + 7) % 7; n += 1) out.add((a + n) % 7);
  }
  for (const w of s.split(/[^a-z]+/)) {
    const d = dayIndex(w);
    if (d !== null) out.add(d);
  }
  return [...out].sort((x, y) => x - y);
}

const TIME = String.raw`\d{1,2}(?::\d{2})?\s*(?:am|pm)?`;

/**
 * Pure: the week a saved line describes, or null when it names no hours we can read. Days it
 * doesn't mention are closed; a time with no days ("9am–5pm") fills the days not set yet.
 */
export function parseHours(line: string): Week | null {
  const week = closedWeek();
  const set = new Set<number>();
  let read = false;
  for (const seg of line.split(/[,;·\n]|\.\s+/)) {
    if (/holiday|christmas|new year/i.test(seg)) continue;
    const range = new RegExp(`(${TIME})\\s*(?:-|–|to)\\s*(${TIME})`, "i").exec(seg);
    const days = daysIn(range ? seg.slice(0, range.index) : seg);
    const unset = [0, 1, 2, 3, 4, 5, 6].filter((d) => !set.has(d));
    for (const d of days.length ? days : range ? unset : []) {
      set.add(d);
      if (/closed/i.test(seg)) {
        week[d] = { ...week[d], open: false };
        read = true;
      } else if (range) {
        const from = parseTime(range[1]);
        const to = parseTime(range[2], true);
        if (from !== null && to !== null && from !== to) {
          week[d] = { open: true, from, to };
          read = true;
        }
      }
    }
  }
  return read && week.some((d) => d.open) ? week : null;
}

/** Pure: a saved hours line as open days for the editor ([] when it can't be read). */
export const openDaysFromText = (line: string | null | undefined): OpenDay[] => {
  const week = line ? parseHours(line) : null;
  return week ? openDaysOf(week) : [];
};

/**
 * Pure (the replica's): an hours answer with new hours. The sentences that give weekday hours are
 * replaced by one "We’re open …" line; everything else the owner wrote (last orders, holidays)
 * stays.
 */
export function withNewHours(answer: string, hours: string): string {
  const range = new RegExp(`${TIME}\\s*(?:-|–|to)\\s*${TIME}`, "i");
  const kept = answer
    .split(/(?<=[.!?])\s+/)
    .map((x) => x.trim())
    .filter(Boolean)
    .filter((x) => /holiday|christmas|new year/i.test(x) || !(range.test(x) && daysIn(x).length));
  return [`We’re open ${hours}.`, ...kept].join(" ");
}
