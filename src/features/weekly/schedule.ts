import { startOfDayIn, validTimeZone } from "@/lib/time/zone";

// Weekly check-up (board "Your week", approved 26 Nov): when it runs. Every Monday at 7:00 AM in
// the business's time zone, over the week before (Monday to Sunday); and Check now, once a day
// per business, over the last 7 days. Pure, tested.

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** The Monday check-up runs from this local hour. */
export const MONDAY_HOUR = 7;
/**
 * Without a stored zone the business is assumed to be in US Eastern (as HighLevel's dates are).
 * The zone is the Owner's browser zone saved on the organization's bill (org_billing.time_zone).
 */
export const FALLBACK_ZONE = "America/New_York";

export function businessZone(stored: string | null | undefined): string {
  const zone = validTimeZone(stored);
  return zone === "UTC" && stored !== "UTC" ? FALLBACK_ZONE : zone;
}

/** "2026-11-30": the calendar day of `at` in `zone`. */
export function localDayKey(at: Date, zone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

/** 0 = Sunday … 6 = Saturday, in `zone`. */
function localWeekday(at: Date, zone: string): number {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: zone, weekday: "short" }).format(at);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(name);
}

/** The local midnight `days` days away from `dayStart` (itself a local midnight). */
function shiftDays(dayStart: Date, days: number, zone: string): Date {
  // Noon of the target day, then its midnight: safe across daylight-saving changes.
  return startOfDayIn(new Date(dayStart.getTime() + days * DAY_MS + 12 * HOUR_MS), zone);
}

/** The local midnight starting the Monday of `now`'s week (Monday to Sunday). */
function mondayStart(now: Date, zone: string): Date {
  const sinceMonday = (localWeekday(now, zone) + 6) % 7;
  return shiftDays(startOfDayIn(now, zone), -sinceMonday, zone);
}

export interface MondayRun {
  /** The local Monday this week's check-up belongs to ("2026-11-30"); one run per week. */
  weekStart: string;
  /** Monday 7:00 AM local. */
  runAt: Date;
  /** The week read: last Monday 00:00 to this Monday 00:00, local. */
  from: Date;
  to: Date;
  /** It's Monday, 7:00 AM or later. Later in the week a missed Monday isn't made up. */
  due: boolean;
}

export function mondayRun(now: Date, zone: string): MondayRun {
  const to = mondayStart(now, zone);
  const from = shiftDays(to, -7, zone);
  const runAt = new Date(to.getTime() + MONDAY_HOUR * HOUR_MS);
  const nextDay = shiftDays(to, 1, zone);
  return {
    weekStart: localDayKey(to, zone),
    runAt,
    from,
    to,
    due: now >= runAt && now < nextDay,
  };
}

/** When the next Monday check-up runs ("The first check-up is on Mon 30 Nov"). */
export function nextMondayRun(now: Date, zone: string): Date {
  const thisWeek = mondayRun(now, zone);
  if (now < thisWeek.runAt) return thisWeek.runAt;
  return new Date(shiftDays(thisWeek.to, 7, zone).getTime() + MONDAY_HOUR * HOUR_MS);
}

/** Check now reads the last 7 days up to the moment it's asked. */
export function checkNowWindow(now: Date): { from: Date; to: Date } {
  return { from: new Date(now.getTime() - 7 * DAY_MS), to: now };
}

/** Check now has an AI cost: once per business per day, in the business's zone. */
export function checkNowOpen(lastCheckNowAt: Date | null, now: Date, zone: string): boolean {
  if (!lastCheckNowAt) return true;
  return localDayKey(lastCheckNowAt, zone) !== localDayKey(now, zone);
}

/** The business's next local midnight ("DMs close today" close before it). */
export function endOfLocalDay(now: Date, zone: string): Date {
  return shiftDays(startOfDayIn(now, zone), 1, zone);
}
