// Posting times (T75, design "Posts · Queue"): the brand's weekly slots in Zernio's queue
// (`/v1/queue/slots`, dayOfWeek 0 = Sunday, time "HH:mm" in the queue's timezone).

export type QueueSlot = { dayOfWeek?: number; time?: string };

/** The week as owners read it: Monday first. */
export const DAYS = [
  { dayOfWeek: 1, label: "Mon" },
  { dayOfWeek: 2, label: "Tue" },
  { dayOfWeek: 3, label: "Wed" },
  { dayOfWeek: 4, label: "Thu" },
  { dayOfWeek: 5, label: "Fri" },
  { dayOfWeek: 6, label: "Sat" },
  { dayOfWeek: 0, label: "Sun" },
] as const;

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Times per day (index = dayOfWeek), sorted, valid and unique. */
export function slotsToGrid(slots: readonly QueueSlot[]): string[][] {
  const grid: string[][] = [[], [], [], [], [], [], []];
  for (const s of slots) {
    if (s.dayOfWeek === undefined || s.dayOfWeek < 0 || s.dayOfWeek > 6) continue;
    if (!s.time || !TIME.test(s.time)) continue;
    if (!grid[s.dayOfWeek].includes(s.time)) grid[s.dayOfWeek].push(s.time);
  }
  for (const day of grid) day.sort();
  return grid;
}

export function gridToSlots(grid: readonly string[][]): { dayOfWeek: number; time: string }[] {
  return grid.flatMap((times, dayOfWeek) => times.map((time) => ({ dayOfWeek, time })));
}

function validTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** The Queue form: `day-N` = "09:00, 18:00" per day, and `timezone`. Null when unusable. */
export function parseSlotsForm(
  form: FormData,
): { timezone: string; slots: { dayOfWeek: number; time: string }[] } | null {
  const timezone = String(form.get("timezone") ?? "");
  if (!timezone || !validTimezone(timezone)) return null;
  const raw: QueueSlot[] = [];
  for (let d = 0; d < 7; d++) {
    const v = form.get(`day-${d}`);
    if (typeof v !== "string") continue;
    for (const t of v.split(",")) raw.push({ dayOfWeek: d, time: t.trim() });
  }
  return { timezone, slots: gridToSlots(slotsToGrid(raw)) };
}
