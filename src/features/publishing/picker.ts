import { clock12, shortWhen } from "./post-time";

// Waggle's own date and time picker (Posts Round 3, approved 25 Nov): a month (Monday first),
// the best-time chips, a time in 15-minute steps with AM/PM. Days are "YYYY-MM-DD" and times
// "HH:MM" (24 h), both wall clock in the viewer's zone. Pure.

export const STEP_MINUTES = 15;

const pad = (n: number) => String(n).padStart(2, "0");

/** "2026-11" of a day. */
export const monthOf = (day: string) => day.slice(0, 7);

/** The month before or after ("2026-12" + 1 → "2027-01"). */
export function shiftMonthKey(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

/** "November 2026". */
export function monthTitle(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Weeks of the month, Monday first; days outside the month are null. */
export function monthGrid(month: string): (string | null)[][] {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7;
  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: days }, (_, i) => `${month}-${pad(i + 1)}`),
  ];
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
}

/** A day before today can't be picked. */
export const isPastDay = (day: string, today: string): boolean => day < today;

/** "Thursday, November 26" for a day's accessible name. */
export function dayName(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** "19:00" → hour 7, minute 0, PM. */
export function to12h(time: string): { hour: number; minute: number; pm: boolean } {
  const [h, m] = time.split(":").map(Number);
  return { hour: h % 12 === 0 ? 12 : h % 12, minute: m, pm: h >= 12 };
}

/** Hour 7, minute 0, PM → "19:00". */
export function from12h(hour: number, minute: number, pm: boolean): string {
  const h = (hour % 12) + (pm ? 12 : 0);
  return `${pad(h)}:${pad(minute)}`;
}

/** The time moved by whole 15-minute steps, snapped to the grid and kept within the day. */
export function stepTime(time: string, steps: number): string {
  const [h, m] = time.split(":").map(Number);
  const snapped = Math.round((h * 60 + m) / STEP_MINUTES) * STEP_MINUTES;
  const total = (((snapped + steps * STEP_MINUTES) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

/** A typed hour (1–12) and minute, kept in range and on the 15-minute grid; null if unreadable. */
export function readTime(hourText: string, minuteText: string, pm: boolean): string | null {
  const hour = Number(hourText);
  const minute = Number(minuteText || "0");
  if (!Number.isInteger(hour) || hour < 1 || hour > 12) return null;
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return null;
  return stepTime(from12h(hour, minute, pm), 0);
}

/** The picker's main button: "Move to Thu 26 · 7:00 PM", "Use Fri 27 · 12:00 PM". */
export function pickLabel(verb: string, day: string, time: string): string {
  return `${verb} ${shortWhen(day, time)}`;
}

export { clock12 };
