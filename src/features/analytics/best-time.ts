import type { BestTimeSlot, OnlineFollowers } from "@/lib/social/analytics-types";

// Best times to post and the online-followers grid (T51). Pure; days are 0 = Monday throughout.

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export const WEEKDAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

const WEEK_MINUTES = 7 * 24 * 60;

export interface LocalSlot {
  dayOfWeek: number;
  hour: number;
  minute: number;
}

/**
 * A UTC slot in the viewer's time. `offsetMinutes` is `Date#getTimezoneOffset()` (minutes behind
 * UTC, so Manila is -480).
 */
export function toLocalSlot(
  slot: Pick<BestTimeSlot, "dayOfWeek" | "hourUtc">,
  offsetMinutes: number,
): LocalSlot {
  const utc = slot.dayOfWeek * 1440 + slot.hourUtc * 60;
  const local = (((utc - offsetMinutes) % WEEK_MINUTES) + WEEK_MINUTES) % WEEK_MINUTES;
  return {
    dayOfWeek: Math.floor(local / 1440),
    hour: Math.floor((local % 1440) / 60),
    minute: local % 60,
  };
}

/** "8 AM", "8:30 PM", "12 PM". */
export function hourLabel(hour: number, minute = 0): string {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  const suffix = hour < 12 ? "AM" : "PM";
  return minute ? `${h12}:${String(minute).padStart(2, "0")} ${suffix}` : `${h12} ${suffix}`;
}

/** "Sat 8 AM" */
export const slotLabel = (s: LocalSlot) =>
  `${WEEKDAYS[s.dayOfWeek]} ${hourLabel(s.hour, s.minute)}`;

/**
 * The next time this local slot comes round, at least an hour from `now` (local time), as the
 * composer's day and time fields: { day: "2026-11-08", time: "08:00" }.
 */
export function nextOccurrence(slot: LocalSlot, now: Date): { day: string; time: string } {
  const todayDow = (now.getDay() + 6) % 7;
  for (let add = 0; add <= 7; add++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + add);
    if ((todayDow + add) % 7 !== slot.dayOfWeek) continue;
    d.setHours(slot.hour, slot.minute, 0, 0);
    if (d.getTime() - now.getTime() < 60 * 60_000) continue;
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return {
      day,
      time: `${String(slot.hour).padStart(2, "0")}:${String(slot.minute).padStart(2, "0")}`,
    };
  }
  throw new Error("unreachable: every weekday comes round within 8 days");
}

/** The best slots first: by engagement, needing at least one post behind them. */
export function topSlots(slots: BestTimeSlot[], count = 3): BestTimeSlot[] {
  return slots
    .filter((s) => s.postCount > 0)
    .sort((a, b) => b.avgEngagement - a.avgEngagement)
    .slice(0, count);
}

/**
 * Followers online, averaged per weekday and hour: 7 rows (Mon-Sun) × 24 hours. Each day of Meta's
 * data ends at `endTime`, so the day it describes is the UTC date a day before it. The hours are
 * as Meta sends them (its time zone is undocumented, TDD §7.7). Null with no days.
 */
export function onlineGrid(online: OnlineFollowers | null): number[][] | null {
  if (!online || online.days.length === 0) return null;
  const sums = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
  const counts = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
  for (const day of online.days) {
    const t = Date.parse(day.endTime);
    if (Number.isNaN(t)) continue;
    const dow = (new Date(t - 86_400_000).getUTCDay() + 6) % 7;
    day.hours.slice(0, 24).forEach((v, h) => {
      if (!Number.isFinite(v)) return;
      sums[dow][h] += v;
      counts[dow][h] += 1;
    });
  }
  if (counts.every((row) => row.every((c) => c === 0))) return null;
  return sums.map((row, d) => row.map((s, h) => (counts[d][h] ? Math.round(s / counts[d][h]) : 0)));
}

/** The busiest cell of the grid, for the chart's summary. */
export function peakCell(grid: number[][]): { dayOfWeek: number; hour: number; value: number } {
  let best = { dayOfWeek: 0, hour: 0, value: -1 };
  grid.forEach((row, d) =>
    row.forEach((v, h) => {
      if (v > best.value) best = { dayOfWeek: d, hour: h, value: v };
    }),
  );
  return best;
}
