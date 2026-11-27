// Posts' dates and times in one time zone (Posts round 1, 25 Nov): the calendar renders on the
// server, which runs in UTC, so every time and every day bucket names the viewer's zone
// explicitly (the zone their browser reported, the same one the composer schedules in). Pure.

/** "YYYY-MM-DD" of `at` in `timeZone`. */
export function dayKeyIn(at: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  const n = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${n("year")}-${n("month")}-${n("day")}`;
}

/** "9:00 AM" in `timeZone`. */
export function clockIn(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  });
}

/** "Tue, Nov 25, 9:00 AM" in `timeZone`. */
export function dateTimeIn(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** The line under the calendar: "Times in Asia/Manila". */
export function zoneLine(timeZone: string): string {
  return `Times in ${timeZone.replace(/_/g, " ")}`;
}

// --- Wall-clock times in a zone (Posts Round 3, 25 Nov: drag to move, the date/time picker) ---

/** "YYYY-MM-DD" and "HH:MM" (24 h) of `at` in `timeZone`. */
export function wallClockIn(at: Date | string, timeZone: string): { day: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(at));
  const n = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return { day: `${n("year")}-${n("month")}-${n("day")}`, time: `${n("hour")}:${n("minute")}` };
}

/** How far `timeZone` is ahead of UTC at `at`, in minutes (Manila: 480). */
export function zoneOffsetMinutes(at: Date, timeZone: string): number {
  const { day, time } = wallClockIn(at, timeZone);
  const [y, m, d] = day.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const asUtc = Date.UTC(y, m - 1, d, h, mi);
  return Math.round((asUtc - Math.floor(at.getTime() / 60_000) * 60_000) / 60_000);
}

/**
 * The instant a wall-clock day and time ("2026-11-26", "09:00") names in `timeZone`. Across a
 * daylight-saving change the offset is read again at the result, so 9:00 stays 9:00.
 */
export function fromWallClock(day: string, time: string, timeZone: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  const first = guess - zoneOffsetMinutes(new Date(guess), timeZone) * 60_000;
  const second = guess - zoneOffsetMinutes(new Date(first), timeZone) * 60_000;
  return new Date(second);
}

/** "Thu 26 · 9:00 AM": a day and time named on a button or a line ("Move to …"). */
export function shortWhen(day: string, time: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    weekday: "short",
    timeZone: "UTC",
  });
  return `${weekday} ${d} · ${clock12(time)}`;
}

/** "19:05" → "7:05 PM". */
export function clock12(time: string): string {
  const [h, mi] = time.split(":").map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(mi).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}
