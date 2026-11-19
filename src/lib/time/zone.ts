// The viewer's time zone (19 Nov): "today" in Today and the Inbox starts at the viewer's own
// midnight, not midnight UTC. The browser reports its zone in a cookie (TimeZoneCookie); the
// server reads it. Pure helpers, no I/O.

export const TZ_COOKIE = "waggle_tz";

/** The IANA zone if the runtime knows it (e.g. "Asia/Manila"), else "UTC". */
export function validTimeZone(raw: string | null | undefined): string {
  if (!raw || raw.length > 64) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: raw });
    return raw;
  } catch {
    return "UTC";
  }
}

/** Minutes the zone is ahead of UTC at `at` (Manila: +480). */
function offsetMinutes(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const n = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const wall = Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"), n("second"));
  return Math.round((wall - Math.floor(at.getTime() / 1000) * 1000) / 60_000);
}

/** The moment `now`'s day began in `timeZone` (its local midnight), as a UTC instant. */
export function startOfDayIn(now: Date, timeZone: string): Date {
  const local = new Date(now.getTime() + offsetMinutes(now, timeZone) * 60_000);
  const midnightWall = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  // The offset at midnight itself (a daylight-saving change can fall in between).
  let guess = midnightWall - offsetMinutes(now, timeZone) * 60_000;
  guess = midnightWall - offsetMinutes(new Date(guess), timeZone) * 60_000;
  return new Date(guess);
}
