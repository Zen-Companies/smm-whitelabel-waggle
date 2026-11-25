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
