// Step 2's 30-day strip (board "Setup comes alive", idea 1, approved 21 Nov): what Waggle found,
// by the day it arrived. Index 0 is 29 days ago, 29 is today. Pure, tested.

const DAY_MS = 24 * 60 * 60 * 1000;
export const STRIP_DAYS = 30;

export interface StripItem {
  kind: string;
  receivedAt: string;
  /** Nobody answered it (a lost DM, or a message still open). */
  noReply: boolean;
}

export interface StripDay {
  dms: number;
  comments: number;
  /** Of those, how many got no reply. */
  noReply: number;
}

export function dayStrip(items: readonly StripItem[], now: Date): StripDay[] {
  const days: StripDay[] = Array.from({ length: STRIP_DAYS }, () => ({
    dms: 0,
    comments: 0,
    noReply: 0,
  }));
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  for (const it of items) {
    const t = Date.parse(it.receivedAt);
    if (Number.isNaN(t)) continue;
    const ago = Math.floor((today + DAY_MS - 1 - t) / DAY_MS);
    if (ago < 0 || ago >= STRIP_DAYS) continue;
    const d = days[STRIP_DAYS - 1 - ago];
    if (it.kind === "dm") d.dms += 1;
    else d.comments += 1;
    if (it.noReply) d.noReply += 1;
  }
  return days;
}

/** How many messages one mark stands for, so the busiest day fits `maxMarks` marks. */
export function marksScale(days: readonly StripDay[], maxMarks: number): number {
  const top = Math.max(0, ...days.map((d) => d.dms + d.comments));
  return Math.max(1, Math.ceil(top / maxMarks));
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** The strip's day `index` (0 is 29 days ago) as a UTC date, the same days dayStrip counts. */
function stripDate(index: number, now: Date): Date {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return new Date(today - (STRIP_DAYS - 1 - index) * DAY_MS);
}

/** The weekly date labels under the strip (board, 23 Nov): 5 of them, the last is "today". */
export function stripTicks(now: Date): { index: number; label: string }[] {
  return [4, 3, 2, 1, 0].map((weeks) => {
    const index = STRIP_DAYS - 1 - weeks * 7;
    const d = stripDate(index, now);
    return { index, label: weeks === 0 ? "today" : `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}` };
  });
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** A day's tooltip: "Tue 28 Oct · 2 DMs · 1 no reply" ("Today · …" for today). */
export function dayTip(day: StripDay, index: number, now: Date): string {
  const d = stripDate(index, now);
  const when =
    index === STRIP_DAYS - 1
      ? "Today"
      : `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
  const parts = [
    day.dms ? count(day.dms, "DM", "DMs") : null,
    day.comments ? count(day.comments, "comment", "comments") : null,
    day.noReply ? `${day.noReply} no reply` : null,
  ].filter((p): p is string => p !== null);
  return [when, ...(parts.length ? parts : ["nothing came in"])].join(" · ");
}
