import { dmWindowClosesAt, dmWindowFor } from "@/lib/social/dm-window";
import { platformLabel } from "@/lib/social/platforms";
import type { PopupVersion, Seg } from "./popup-copy";

// The DM countdown (board "Playbook Round 2", approved 26 Nov): the owner's own clock, from the
// open DMs' real reply windows (the same close time the Inbox shows as "3 h left to reply").
// Only real deadlines: none, nothing is shown. The nearest one drives the time; under 1 hour it
// turns red. It never resets and never ticks to hurry anyone: it's worked out again each minute
// from the same close times. Pure.

/** An open DM (waiting for the owner) and when its reply window closes (ISO). */
export interface OpenDm {
  closesAt: string;
  platform: string;
}

export interface Countdown {
  /** Open DMs whose window closes within the next 24 hours. */
  count: number;
  /** Until the nearest one closes. */
  nearestMs: number;
  nearestPlatform: string;
  /** The platforms of the counted DMs, without repeats. */
  platforms: string[];
  /** Under 1 hour: red. */
  urgent: boolean;
  /** Every counted DM closes before the end of the viewer's day. */
  allToday: boolean;
}

const HOUR = 3_600_000;
const MINUTE = 60_000;
/** The count is every open DM that closes within this (board: "within 24 hours"). */
export const COUNTDOWN_WITHIN_MS = 24 * HOUR;
/** The nearest window closes within this: the box turns red (the Inbox's "within the hour"). */
export const URGENT_MS = HOUR;

/**
 * Pure: the countdown for these open DMs at `now`, or null when none closes within 24 hours.
 * `endOfDay`: the end of the viewer's day, for "close today" (null: never say today).
 */
export function countdownOf(
  dms: readonly OpenDm[],
  now: Date,
  endOfDay: Date | null = null,
): Countdown | null {
  const t = now.getTime();
  const open = dms
    .map((d) => ({ at: Date.parse(d.closesAt), platform: d.platform }))
    .filter((d) => Number.isFinite(d.at) && d.at > t && d.at - t <= COUNTDOWN_WITHIN_MS)
    .sort((a, b) => a.at - b.at);
  const nearest = open[0];
  if (!nearest) return null;
  const nearestMs = nearest.at - t;
  return {
    count: open.length,
    nearestMs,
    nearestPlatform: nearest.platform,
    platforms: [...new Set(open.map((d) => d.platform))],
    urgent: nearestMs < URGENT_MS,
    allToday: !!endOfDay && open.every((d) => d.at <= endOfDay.getTime()),
  };
}

/** Pure: "3 h", "45 min", "under 1 min" (whole hours and minutes, rounded down like the Inbox). */
export function timeLeft(ms: number): string {
  if (ms < MINUTE) return "under 1 min";
  if (ms < HOUR) return `${Math.floor(ms / MINUTE)} min`;
  return `${Math.floor(ms / HOUR)} h`;
}

const n = (v: number) => v.toLocaleString("en-US");
const them = (c: Countdown) => (c.count === 1 ? "it" : "them");

/** "4 DMs close in 3 h", "1 DM closes in 45 min". */
export function closesLine(c: Countdown): string {
  return `${c.count === 1 ? "1 DM closes" : `${n(c.count)} DMs close`} in ${timeLeft(c.nearestMs)}`;
}

/** Meta's apps share one rule (24 hours). */
const META = new Set(["instagram", "facebook", "whatsapp"]);
const owner = (platform: string) => (META.has(platform) ? "Meta" : platformLabel(platform));
const hours = (platform: string) => Math.round((dmWindowFor(platform)?.ms ?? 0) / HOUR);

/**
 * Pure: who locks them, truthfully, from the nearest one (it closes first): Instagram, Facebook
 * and WhatsApp "Meta locks them after 24 hours", TikTok "TikTok locks them after 48 hours", any
 * other window "After that, you can't reply."
 */
export function lockLine(c: Countdown): string {
  const p = c.nearestPlatform;
  if (META.has(p) || p === "tiktok") {
    return `${owner(p)} locks ${them(c)} after ${hours(p)} hours.`;
  }
  return "After that, you can’t reply.";
}

/** The pop-up versions that carry the countdown: B Worker Bee, C replies, F Try Solo / welcome. */
export function showsCountdown(version: PopupVersion): boolean {
  return version.v === "worker_bee" || version.v === "replies" || version.v === "try";
}

/**
 * Pure: the countdown box in a pop-up, or null (no box). B and F: Walter's line, "4 DMs close in
 * 3 h. Meta locks them after 24 hours. Worker Bee would answer them now." C (about replies, not
 * Worker Bee): "4 DMs close in 3 h. With Solo, Waggle answers them now."
 */
export function popupCountdown(
  version: PopupVersion,
  c: Countdown | null,
  soloName: string,
): { segs: Seg[]; urgent: boolean } | null {
  if (!c || !showsCountdown(version)) return null;
  const tail =
    version.v === "replies"
      ? `. With ${soloName}, Waggle answers ${them(c)} now.`
      : `. ${lockLine(c)} Worker Bee would answer ${them(c)} now.`;
  return { segs: [{ text: closesLine(c), bold: true }, { text: tail }], urgent: c.urgent };
}

/** "close today" when they all do, else "close within a day" (never a day that isn't true). */
function closeWhen(c: Countdown): string {
  const verb = c.count === 1 ? "1 DM closes" : `${n(c.count)} DMs close`;
  return `${verb} ${c.allToday ? "today" : "within a day"}`;
}

/** Pure: the line on Today's Try Solo banner: "2 DMs close today, the first in 3 h". */
export function bannerCountdown(c: Countdown): string {
  return c.count === 1
    ? `${closeWhen(c)}, in ${timeLeft(c.nearestMs)}`
    : `${closeWhen(c)}, the first in ${timeLeft(c.nearestMs)}`;
}

/**
 * Pure: the line above the Inbox list. Free (with the way to Worker Bee): "2 DMs close today.
 * Worker Bee would answer them now." Paid, or someone who can't upgrade: "2 DMs close today ·
 * 3 h left on the first".
 */
export function inboxCountdown(c: Countdown, offer: boolean): string {
  if (offer) return `${closeWhen(c)}. Worker Bee would answer ${them(c)} now.`;
  const left = timeLeft(c.nearestMs);
  return c.count === 1
    ? `${closeWhen(c)} · ${left} left to reply`
    : `${closeWhen(c)} · ${left} left on the first`;
}

/** The end of the viewer's day (browser time), for "close today". */
export function endOfLocalDay(now: Date): Date {
  const d = new Date(now);
  d.setHours(24, 0, 0, 0);
  return d;
}

/** An open DM row as loaded: its conversation, platform and the customer's last message. */
export interface OpenDmRow {
  conversationId: string | null;
  /** null: the account is gone; read as Instagram, like the Inbox. */
  platform: string | null;
  lastCustomerMessageAt: string | null;
}

/**
 * Pure: the open DMs still inside their window, nearest first, one per conversation (a customer
 * who sent three messages is one DM to answer). The close time is the Inbox's own
 * (dmWindowClosesAt); platforms without a window (Bluesky) and unknown times are left out.
 */
export function openDmsFrom(rows: readonly OpenDmRow[], now: Date): OpenDm[] {
  const seen = new Set<string>();
  const out: OpenDm[] = [];
  for (const r of rows) {
    const platform = r.platform ?? "instagram";
    const last = r.lastCustomerMessageAt ? new Date(r.lastCustomerMessageAt) : null;
    const closes = dmWindowClosesAt(platform, last);
    if (!closes || closes.getTime() <= now.getTime()) continue;
    if (r.conversationId) {
      if (seen.has(r.conversationId)) continue;
      seen.add(r.conversationId);
    }
    out.push({ closesAt: closes.toISOString(), platform });
  }
  return out.sort((a, b) => Date.parse(a.closesAt) - Date.parse(b.closesAt));
}
