// Weekly check-up (board "Your week", approved 26 Nov): the words on Today's "Your week" card and
// its Check now button. Pure, tested; dates and times in the zone given (the viewer's).

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function parts(at: Date, zone: string) {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).formatToParts(at);
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return { weekday: v("weekday"), day: v("day"), month: v("month") };
}

/** "9:14 AM" in the zone. */
function clock(at: Date, zone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(at);
}

/**
 * "Mon 23 – Sun 29 Nov" (short: "23–29 Nov"), "Mon 30 Nov – Sun 6 Dec". `to` is the end of the
 * week (exclusive), so its last day is the day before.
 */
export function weekRange(from: Date, to: Date, zone: string, form: "long" | "short" = "long") {
  const a = parts(from, zone);
  const b = parts(new Date(to.getTime() - 1), zone);
  const sameMonth = a.month === b.month;
  if (form === "short") {
    return sameMonth ? `${a.day}–${b.day} ${b.month}` : `${a.day} ${a.month} – ${b.day} ${b.month}`;
  }
  return sameMonth
    ? `${a.weekday} ${a.day} – ${b.weekday} ${b.day} ${b.month}`
    : `${a.weekday} ${a.day} ${a.month} – ${b.weekday} ${b.day} ${b.month}`;
}

/** "checked Mon 7:00 AM · 6 accounts". */
export function checkedLine(at: Date, accounts: number, zone: string): string {
  return `checked ${parts(at, zone).weekday} ${clock(at, zone)} · ${plural(accounts, "account", "accounts")}`;
}

/** "▲ 12 vs last week"; null when there's no last week to compare with. */
export function vsLastWeek(cameIn: number, previous: number | null): string | null {
  if (previous === null) return null;
  const d = cameIn - previous;
  if (d === 0) return "Same as last week";
  return `${d > 0 ? "▲" : "▼"} ${Math.abs(d)} vs last week`;
}

export const answeredSplit = (waggle: number, you: number): string =>
  `${waggle} by Waggle · ${you} by you`;

/** "3 DMs close today"; null when none do. */
export function waitingLine(closingToday: number): string | null {
  if (closingToday === 0) return null;
  return closingToday === 1 ? "1 DM closes today" : `${closingToday} DMs close today`;
}

/** Under "found that Waggle missed". */
export function foundLine(found: number, tooOld: number): string {
  const first = found > 0 ? "now in your Inbox" : "nothing missed";
  return tooOld > 0 ? `${first} · ${tooOld} too old to answer` : first;
}

/** A few messages, all answered, nothing waiting or to teach: the email says it in one line. */
export function isQuietWeek(s: {
  cameIn: number;
  waiting: number;
  found: number;
  gaps: readonly unknown[];
}): boolean {
  return s.cameIn < 10 && s.waiting === 0 && s.found === 0 && s.gaps.length === 0;
}

export function quietLine(cameIn: number): string {
  if (cameIn === 0) return "A quiet week: no messages came in.";
  if (cameIn === 1) return "A quiet week: 1 message, answered.";
  return `A quiet week: ${cameIn} messages, all answered.`;
}

export const checkingLabel = (done: number, total: number): string =>
  `Checking… ${done} of ${plural(total, "account", "accounts")}`;

/** "Reading Instagram, Facebook, Gmail…" (the accounts still to read). */
export function readingLine(names: readonly string[]): string | null {
  return names.length ? `Reading ${names.join(", ")}…` : null;
}

export function justCheckedLine(found: number): string {
  if (found === 0) return "Waggle had every message. Nothing was missed.";
  return found === 1
    ? "Found 1 message Waggle hadn't seen; it's in your Inbox."
    : `Found ${found} messages Waggle hadn't seen; they're in your Inbox.`;
}

export const usedTodayLine = (at: Date, zone: string): string =>
  `Checked today at ${clock(at, zone)}. You can check again tomorrow.`;

const joinNames = (names: readonly string[]) =>
  names.length <= 1
    ? (names[0] ?? "")
    : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

export function couldntReadLine(names: readonly string[]): string {
  return `Couldn't read ${joinNames(names)} this time (${names.length === 1 ? "it needs" : "they need"} reconnecting).`;
}

export function firstRunLine(next: Date, zone: string): string {
  const p = parts(next, zone);
  return `Waggle checks your week every Monday at 7:00 AM. The first check-up is ${p.weekday} ${p.day} ${p.month}.`;
}
