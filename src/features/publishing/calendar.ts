// Month calendar for Posts (design v2). Pure: dates are local calendar days as "YYYY-MM-DD".

export interface Month {
  year: number;
  /** 1–12 */
  month: number;
}

const pad = (n: number) => String(n).padStart(2, "0");

export const dayKey = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const monthParam = (m: Month) => `${m.year}-${pad(m.month)}`;

/** "2026-10" → October 2026; anything else → the month of `now`. */
export function parseMonth(param: string | undefined, now = new Date()): Month {
  const match = param?.match(/^(\d{4})-(\d{2})$/);
  if (match) {
    const month = Number(match[2]);
    if (month >= 1 && month <= 12) return { year: Number(match[1]), month };
  }
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

/** "08:00" when it's a real time of day, else null (Analytics links a best time, T51). */
export function parseTime(param: string | undefined): string | null {
  return param && /^([01]\d|2[0-3]):[0-5]\d$/.test(param) ? param : null;
}

/** "2026-11-01" when it's a real day, else null. */
export function parseDay(param: string | undefined): string | null {
  if (!param || !/^\d{4}-\d{2}-\d{2}$/.test(param)) return null;
  const [y, m, d] = param.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return dayKey(date) === param ? param : null;
}

export function shiftMonth(m: Month, by: number): Month {
  const d = new Date(m.year, m.month - 1 + by, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

/** Weeks (Sunday first) covering the month, each day as "YYYY-MM-DD". 4 to 6 rows. */
export function monthWeeks(m: Month): string[][] {
  const first = new Date(m.year, m.month - 1, 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  const last = new Date(m.year, m.month, 0);
  const weeks: string[][] = [];
  const cursor = new Date(start);
  while (cursor <= last || weeks.length === 0) {
    const week: string[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(dayKey(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  }
  return weeks;
}

/** The day a post belongs on: when it went out, else when it's planned, else when it was made. */
export function postDay(post: {
  published_at: string | null;
  scheduled_for: string | null;
  created_at: string;
}): string {
  return dayKey(new Date(post.published_at ?? post.scheduled_for ?? post.created_at));
}

/** A post that didn't go out and needs the owner to pick a new time (or retry). */
export function needsNewTime(post: { status: string; failure_reason: string | null }): boolean {
  return (
    post.status === "failed" ||
    post.status === "partial" ||
    (post.status === "cancelled" && !!post.failure_reason)
  );
}
