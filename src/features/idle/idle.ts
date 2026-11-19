// Free plan idle disconnect (decided 19 Nov). Pure: no I/O. Each connected account costs Waggle
// $1-6 a month, so a Free organization nobody uses for 30 days has its accounts disconnected:
// one warning email at day 23, the disconnect at day 30 (never sooner than 7 days after the
// warning), and anyone coming back clears it. Paid plans never disconnect for being away.

export const DAY_MS = 24 * 60 * 60 * 1000;
export const WARN_AFTER_DAYS = 23;
export const DISCONNECT_AFTER_DAYS = 30;
/** The warning always gives at least this long, even when it goes out late. */
export const WARNING_NOTICE_DAYS = DISCONNECT_AFTER_DAYS - WARN_AFTER_DAYS;
/** Each organization is checked at most once a day. */
export const CHECK_EVERY_MS = DAY_MS;

/** Stripe statuses that keep a plan (mirrors the billing feature's live statuses). */
const LIVE_STATUSES = new Set(["trialing", "active", "past_due"]);

/**
 * Whether an organization counts as Free for idle disconnects: no plan, or a plan that isn't
 * live (canceled, unpaid…). Organizations holding a test brand are never touched.
 */
export function isFreeForIdle(input: {
  billStatus: string | null | undefined;
  hasTestBrand: boolean;
}): boolean {
  if (input.hasTestBrand) return false;
  return !LIVE_STATUSES.has(input.billStatus ?? "");
}

/**
 * The last time anyone in the organization used Waggle: the latest of every signal (app visits,
 * sign-ins, actions), never earlier than when the organization was created.
 */
export function lastActiveAt(signals: Array<string | Date | null | undefined>): Date | null {
  let latest: number | null = null;
  for (const s of signals) {
    if (!s) continue;
    const t = s instanceof Date ? s.getTime() : Date.parse(s);
    if (Number.isNaN(t)) continue;
    if (latest === null || t > latest) latest = t;
  }
  return latest === null ? null : new Date(latest);
}

/** Whole days away (rounded down). */
export function daysAway(lastActive: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - lastActive.getTime()) / DAY_MS));
}

/** When the accounts disconnect: day 30, and never sooner than 7 days after the warning. */
export function disconnectDate(lastActive: Date, warnedAt: Date): Date {
  return new Date(
    Math.max(
      lastActive.getTime() + DISCONNECT_AFTER_DAYS * DAY_MS,
      warnedAt.getTime() + WARNING_NOTICE_DAYS * DAY_MS,
    ),
  );
}

export interface IdleState {
  warnedAt: Date | null;
  /** The stretch away the warning belongs to (last active when it was sent). */
  warnedForActiveAt: Date | null;
}

export type IdleDecision =
  | { kind: "none" }
  /** A warning no longer applies (they came back, upgraded, or nothing is connected). */
  | { kind: "clear" }
  | { kind: "warn"; days: number; disconnectOn: Date }
  | { kind: "disconnect"; days: number };

export function decideIdle(input: {
  now: Date;
  lastActive: Date;
  free: boolean;
  hasActiveAccounts: boolean;
  state: IdleState;
}): IdleDecision {
  const { now, lastActive, state } = input;
  const warned = state.warnedAt !== null;
  // The warning still stands only for the same stretch away: any use since then clears it.
  const warningStands =
    state.warnedAt !== null &&
    state.warnedForActiveAt !== null &&
    lastActive.getTime() <= state.warnedForActiveAt.getTime();

  if (!input.free || !input.hasActiveAccounts) return warned ? { kind: "clear" } : { kind: "none" };

  const days = daysAway(lastActive, now);
  if (warningStands && state.warnedAt) {
    return now.getTime() >= disconnectDate(lastActive, state.warnedAt).getTime()
      ? { kind: "disconnect", days }
      : { kind: "none" };
  }
  if (days >= WARN_AFTER_DAYS) {
    return { kind: "warn", days, disconnectOn: disconnectDate(lastActive, now) };
  }
  return warned ? { kind: "clear" } : { kind: "none" };
}

export interface IdleAccount {
  platformLabel: string;
  username: string | null;
}

/** "@harbourbean", or "your Facebook account" when the platform gives no handle. */
export function accountName(a: IdleAccount): string {
  const handle = a.username?.trim().replace(/^@/, "");
  return handle ? `@${handle}` : `your ${a.platformLabel} account`;
}

/** "@a", "@a and @b", "@a, @b and your Facebook account". */
export function joinAccounts(accounts: IdleAccount[]): string {
  const names = accounts.map(accountName);
  if (names.length <= 1) return names[0] ?? "your accounts";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** The note on Today after a disconnect (decided 19 Nov). */
export function idleNoticeCopy(accounts: IdleAccount[]): { title: string; body: string } {
  return {
    title: `We disconnected ${joinAccounts(accounts)} while you were away`,
    body: "Free accounts disconnect after 30 days without a sign-in. Everything Waggle learned is still here.",
  };
}

/** Whether the note still shows: a disconnect not dismissed since. */
export function noticeOpen(state: {
  disconnectedAt: string | null;
  dismissedAt: string | null;
}): boolean {
  if (!state.disconnectedAt) return false;
  if (!state.dismissedAt) return true;
  return Date.parse(state.dismissedAt) < Date.parse(state.disconnectedAt);
}
