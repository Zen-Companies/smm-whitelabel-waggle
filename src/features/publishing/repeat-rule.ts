import { clock12, dayKeyIn, fromWallClock, wallClockIn } from "./post-time";

// Repeat posts (Posts Round 5, board section 2, approved 27 Nov): every day, week or month at the
// same time, until the owner stops it, until a date, or after N times. Zernio has recurring queue
// slots, not repeating posts (docs.zernio.com/guides/queue-scheduling), so Waggle works out each
// next time here and makes that post itself. Times are wall clock in the rule's zone: 9:00 stays
// 9:00 across a daylight-saving change. Pure; tested.

export type RepeatEvery = "day" | "week" | "month";
export type RepeatEnds = "never" | "on" | "after";

export interface RepeatRule {
  every: RepeatEvery;
  /** week: 0 Sunday … 6 Saturday. */
  weekday: number | null;
  /** month: 1–31 (a shorter month uses its last day). */
  monthDay: number | null;
  /** "HH:MM", 24 h. */
  time: string;
  timeZone: string;
  ends: RepeatEnds;
  /** ends "on": the last day a repeat may go out (YYYY-MM-DD, in the rule's zone). */
  endDate: string | null;
  /** ends "after": how many posts in all, the first included. */
  maxCount: number | null;
}

/** The most times a repeat can be set to go out. */
export const REPEAT_MAX_COUNT = 366;

/** What the composer sends (the time comes from the first post's own time). */
export interface RepeatChoice {
  every: RepeatEvery;
  ends: RepeatEnds;
  endDate?: string | null;
  count?: number | null;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function weekdayOf(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** The rule a repeat follows, from its first post's time (its weekday, day of month and time). */
export function ruleFromFirst(choice: RepeatChoice, firstAt: Date, timeZone: string): RepeatRule {
  const { day, time } = wallClockIn(firstAt, timeZone);
  return {
    every: choice.every,
    weekday: choice.every === "week" ? weekdayOf(day) : null,
    monthDay: choice.every === "month" ? Number(day.slice(8)) : null,
    time,
    timeZone,
    ends: choice.ends,
    endDate: choice.ends === "on" ? (choice.endDate ?? null) : null,
    maxCount: choice.ends === "after" ? (choice.count ?? null) : null,
  };
}

/** Whether the composer's choice is complete and sensible for a first post at `firstAt`. */
export function repeatChoiceProblem(
  choice: RepeatChoice,
  firstAt: Date,
  timeZone: string,
): string | null {
  if (choice.ends === "on") {
    if (!choice.endDate || !/^\d{4}-\d{2}-\d{2}$/.test(choice.endDate)) return "Pick the last day.";
    if (choice.endDate < dayKeyIn(firstAt, timeZone)) {
      return "The last day can't be before the first post.";
    }
  }
  if (choice.ends === "after") {
    const n = choice.count ?? 0;
    if (!Number.isInteger(n) || n < 2 || n > REPEAT_MAX_COUNT) {
      return `Pick how many times, from 2 to ${REPEAT_MAX_COUNT}.`;
    }
  }
  return null;
}

/** The first time the rule names that is strictly after `after`. */
export function nextSlotAfter(rule: RepeatRule, after: Date): Date {
  const start = wallClockIn(after, rule.timeZone).day;
  if (rule.every === "month") {
    const [y, m] = start.split("-").map(Number);
    for (let k = 0; k < 14; k += 1) {
      const year = y + Math.floor((m - 1 + k) / 12);
      const month = ((m - 1 + k) % 12) + 1;
      const d = Math.min(rule.monthDay ?? 1, daysInMonth(year, month));
      const day = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const slot = fromWallClock(day, rule.time, rule.timeZone);
      if (slot.getTime() > after.getTime()) return slot;
    }
  } else {
    for (let k = 0; k < 16; k += 1) {
      const day = addDays(start, k);
      if (rule.every === "week" && weekdayOf(day) !== rule.weekday) continue;
      const slot = fromWallClock(day, rule.time, rule.timeZone);
      if (slot.getTime() > after.getTime()) return slot;
    }
  }
  throw new Error("repeat rule has no next time");
}

/** Whether post number `n` (the first is 1) at `slot` is still within the rule's end. */
export function withinEnd(rule: RepeatRule, slot: Date, n: number): boolean {
  if (rule.ends === "after") return n <= (rule.maxCount ?? 0);
  if (rule.ends === "on") return !!rule.endDate && dayKeyIn(slot, rule.timeZone) <= rule.endDate;
  return true;
}

export type NextStep = { kind: "make"; slot: Date } | { kind: "finished" };

/**
 * What the job does next for a repeat: the next post's time after the last one's slot, never
 * sooner than `minAheadMs` from now (missed times are skipped, never posted late), or finished
 * when the rule's end is reached.
 */
export function planNext(
  rule: RepeatRule,
  state: { lastSlot: Date; madeCount: number; now: Date; minAheadMs: number },
): NextStep {
  if (rule.ends === "after" && state.madeCount >= (rule.maxCount ?? 0)) return { kind: "finished" };
  const earliest = new Date(state.now.getTime() + state.minAheadMs);
  let slot = nextSlotAfter(rule, state.lastSlot);
  while (slot.getTime() < earliest.getTime()) slot = nextSlotAfter(rule, slot);
  return withinEnd(rule, slot, state.madeCount + 1) ? { kind: "make", slot } : { kind: "finished" };
}

/**
 * The first few times a repeat goes out, starting with the first post, within its end: for the
 * composer's "Next: …" line. `more` is true when more follow.
 */
export function previewSlots(
  rule: RepeatRule,
  first: Date,
  n = 3,
): { slots: Date[]; more: boolean } {
  const slots: Date[] = [];
  let slot = first;
  while (slots.length < n && withinEnd(rule, slot, slots.length + 1)) {
    slots.push(slot);
    slot = nextSlotAfter(rule, slot);
  }
  return { slots, more: slots.length === n && withinEnd(rule, slot, n + 1) };
}

/**
 * The times after the latest post, within the rule's end (the post panel's "Then: …"). `made` is
 * how many posts the repeat has made so far.
 */
export function slotsAfter(
  rule: RepeatRule,
  lastSlot: Date,
  made: number,
  n = 2,
): { slots: Date[]; more: boolean } {
  const slots: Date[] = [];
  let slot = nextSlotAfter(rule, lastSlot);
  while (slots.length < n && withinEnd(rule, slot, made + slots.length + 1)) {
    slots.push(slot);
    slot = nextSlotAfter(rule, slot);
  }
  return { slots, more: slots.length === n && withinEnd(rule, slot, made + n + 1) };
}

function ordinal(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return `${n}th`;
  return `${n}${n % 10 === 1 ? "st" : n % 10 === 2 ? "nd" : n % 10 === 3 ? "rd" : "th"}`;
}

/** "Every week on Friday at 9:00 AM". */
export function repeatLabel(rule: Pick<RepeatRule, "every" | "weekday" | "monthDay" | "time">) {
  const at = `at ${clock12(rule.time)}`;
  if (rule.every === "day") return `Every day ${at}`;
  if (rule.every === "week") return `Every week on ${WEEKDAYS[rule.weekday ?? 0]} ${at}`;
  const d = rule.monthDay ?? 1;
  return `Every month on the ${ordinal(d)}${d > 28 ? " (or the month's last day)" : ""} ${at}`;
}

/** "Fri 28 Nov": a day in the rule's zone. */
export function shortDay(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
  })
    .format(at)
    .replace(",", "");
}

/** "Until I stop it", "Until Fri 19 Dec", "6 times in all". */
export function endsLabel(rule: Pick<RepeatRule, "ends" | "endDate" | "maxCount">): string {
  if (rule.ends === "on" && rule.endDate) {
    return `Until ${shortDay(new Date(`${rule.endDate}T12:00:00Z`), "UTC")}`;
  }
  if (rule.ends === "after") return `${rule.maxCount ?? 0} times in all`;
  return "Until I stop it";
}

/** "Next: Fri 28 Nov · Fri 5 Dec · Fri 12 Dec…". */
export function nextLine(slots: readonly Date[], more: boolean, timeZone: string): string {
  if (!slots.length) return "";
  return `Next: ${slots.map((s) => shortDay(s, timeZone)).join(" · ")}${more ? "…" : ""}`;
}

/** The rule a stored repeat row follows. */
export function ruleOfRow(row: {
  every: string;
  weekday: number | null;
  month_day: number | null;
  at_time: string;
  time_zone: string;
  ends: string;
  end_date: string | null;
  max_count: number | null;
}): RepeatRule {
  return {
    every: row.every === "day" || row.every === "month" ? row.every : "week",
    weekday: row.weekday,
    monthDay: row.month_day,
    time: row.at_time,
    timeZone: row.time_zone,
    ends: row.ends === "on" || row.ends === "after" ? row.ends : "never",
    endDate: row.end_date,
    maxCount: row.max_count,
  };
}

/** A held repeat's reason, in the owner's words (post panel). */
export function repeatHeldLine(code: string | null): string | null {
  if (!code) return null;
  if (code === "account_disconnected") {
    return "The next one is waiting: an account stopped connecting. Reconnect it in Settings.";
  }
  if (code === "accounts_not_owned") {
    return "The next one is waiting: one of its accounts was removed. Edit this post and choose This and the ones after.";
  }
  if (code === "not_accepted") {
    return "The next one is waiting: a platform won't take the post as it is now.";
  }
  return "The next one couldn't be planned yet. Waggle tries again within the hour.";
}

/** A repeat row as the posts page reads it. */
export interface RepeatRow {
  id: string;
  every: string;
  weekday: number | null;
  month_day: number | null;
  at_time: string;
  time_zone: string;
  ends: string;
  end_date: string | null;
  max_count: number | null;
  made_count: number;
  last_post_id: string | null;
  last_slot: string;
  last_error: string | null;
  stopped_at: string | null;
  finished_at: string | null;
}

/** The post panel's repeat block for one of the repeat's posts, shown in `timeZone`. */
export function repeatInfo(row: RepeatRow, postId: string, timeZone: string) {
  const rule = ruleOfRow(row);
  const state: "live" | "stopped" | "finished" = row.stopped_at
    ? "stopped"
    : row.finished_at
      ? "finished"
      : "live";
  const after =
    state === "live" && row.last_post_id === postId
      ? slotsAfter(rule, new Date(row.last_slot), row.made_count)
      : null;
  return {
    id: row.id,
    label: repeatLabel(rule),
    ends: endsLabel(rule),
    then: after?.slots.length
      ? `Then: ${after.slots.map((s) => shortDay(s, timeZone)).join(" · ")}${after.more ? "…" : ""}`
      : null,
    state,
    made: row.made_count,
    held: repeatHeldLine(row.last_error),
  };
}
