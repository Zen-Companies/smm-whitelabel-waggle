import type { CalendarEventSummary } from "@/lib/social/types";

// Calendar (T81d, design "Your calendar"): Waggle reads the owner's busy times when someone asks
// to book, and adds a booking only when the owner confirms it. Times stay in the calendar's own
// offset (brands have no stored timezone), and event titles never leave this module's caller.

export const BUSY_LINES_MAX = 40;
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The date, clock time and offset written in an ISO time ("Z" is +00:00). */
export function localParts(iso: string): { date: string; time: string; offset: string } {
  const m =
    /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/.exec(iso);
  if (!m) return { date: iso.slice(0, 10), time: "00:00", offset: "+00:00" };
  return { date: m[1], time: m[2] ?? "00:00", offset: !m[3] || m[3] === "Z" ? "+00:00" : m[3] };
}

const dayLabel = (date: string) => {
  const [y, mo, d] = date.split("-").map(Number);
  const wd = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
  return `${DAYS[wd]} ${d} ${MONTHS[mo - 1]}`;
};

/** Busy times for the draft prompt, oldest first: "Fri 21 Nov, 09:00 to 09:30". No titles. */
export function busyLines(events: CalendarEventSummary[]): string[] {
  return events
    .filter((e) => e.busy)
    .map((e) => {
      const s = localParts(e.start);
      if (e.allDay) return `${dayLabel(s.date)}, all day`;
      const end = localParts(e.end);
      const to = end.date === s.date ? end.time : `${dayLabel(end.date)} ${end.time}`;
      return `${dayLabel(s.date)}, ${s.time} to ${to}`;
    })
    .slice(0, BUSY_LINES_MAX);
}

const offsetMinutes = (offset: string) => {
  const sign = offset.startsWith("-") ? -1 : 1;
  const [h, m] = offset.slice(1).split(":").map(Number);
  return sign * (h * 60 + m);
};

/** "Today is Sat 14 Nov 2026." in the calendar's offset, or UTC (said so) without one. */
export function todayLine(now: Date, offset: string | null): string {
  const local = new Date(now.getTime() + (offset ? offsetMinutes(offset) : 0) * 60_000);
  const date = local.toISOString().slice(0, 10);
  return `Today is ${dayLabel(date)} ${date.slice(0, 4)}${offset ? "" : " (UTC)"}.`;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** The owner's "Add to calendar" form: title, date, start time, length and the offset. */
export function parseBooking(
  f: FormData,
):
  | { ok: true; value: { title: string; start: string; end: string } }
  | { ok: false; field: string; error: string } {
  const title = String(f.get("title") ?? "")
    .trim()
    .slice(0, 200);
  if (!title) return { ok: false, field: "title", error: "Give the booking a name." };
  const date = String(f.get("date") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, field: "date", error: "Pick a date." };
  const time = String(f.get("time") ?? "");
  if (!/^\d{2}:\d{2}$/.test(time)) return { ok: false, field: "time", error: "Pick a start time." };
  const minutes = Number(f.get("minutes"));
  if (!(Number.isInteger(minutes) && minutes >= 15 && minutes <= 24 * 60)) {
    return { ok: false, field: "minutes", error: "A booking lasts 15 minutes to a day." };
  }
  const offset = String(f.get("offset") ?? "");
  if (!/^[+-]\d{2}:\d{2}$/.test(offset))
    return { ok: false, field: "date", error: "Reload the page." };
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  // Wall-clock arithmetic in UTC fields, then written back with the calendar's offset.
  const endWall = new Date(Date.UTC(y, mo - 1, d, h, mi) + minutes * 60_000);
  const end = `${endWall.getUTCFullYear()}-${pad(endWall.getUTCMonth() + 1)}-${pad(endWall.getUTCDate())}T${pad(endWall.getUTCHours())}:${pad(endWall.getUTCMinutes())}:00${offset}`;
  return { ok: true, value: { title, start: `${date}T${time}:00${offset}`, end } };
}
