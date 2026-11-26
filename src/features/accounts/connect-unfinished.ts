// "Didn't finish?" (26 Nov). The owner tapped Connect, left for the platform's sign-in and never
// came back: often an ad blocker, Edge's strict tracking prevention, Brave's shields or a VPN
// stops the sign-in dialog, and Waggle heard nothing. From the connect_attempts rows (Fix 1), the
// Connect button says so in place. Pure: no I/O.

import { CONNECT_ABANDON_AFTER_MS } from "./connect-trace";

/** A try shows as unfinished once it is this old (sooner, the owner may still be signing in). */
export const CONNECT_UNFINISHED_AFTER_MS = 60 * 1000;

/** One connect_attempts row, as much as the note needs. */
export interface ConnectTry {
  id: string;
  platform: string;
  startedAt: string;
  outcome: string | null;
}

const startOf = (a: ConnectTry): number => new Date(a.startedAt).getTime();

/**
 * Pure: the connect try to ask "Didn't finish?" about, or null. Only each platform's latest try
 * counts; it shows when it has no outcome yet (not connected, failed, back without an account or
 * abandoned), its platform isn't connected now, and it started at least `minAgeMs` (1 minute) and
 * under 2 hours ago (after that the sweep marks it abandoned). Of several, the most recent.
 */
export function unfinishedConnect(
  attempts: readonly ConnectTry[],
  connectedPlatforms: readonly string[],
  now: Date,
  minAgeMs: number = CONNECT_UNFINISHED_AFTER_MS,
): ConnectTry | null {
  const latest = new Map<string, ConnectTry>();
  for (const a of attempts) {
    if (Number.isNaN(startOf(a))) continue;
    const seen = latest.get(a.platform);
    if (!seen || startOf(a) > startOf(seen)) latest.set(a.platform, a);
  }
  let pick: ConnectTry | null = null;
  for (const a of latest.values()) {
    const age = now.getTime() - startOf(a);
    if (a.outcome !== null) continue;
    if (connectedPlatforms.includes(a.platform)) continue;
    if (age < 0 || age < minAgeMs || age >= CONNECT_ABANDON_AFTER_MS) continue;
    if (!pick || startOf(a) > startOf(pick)) pick = a;
  }
  return pick;
}

/**
 * Pure: when the note appears and goes, counted from the server's clock so the browser's own
 * clock doesn't matter.
 */
export function unfinishedTimers(
  attempt: ConnectTry,
  now: Date,
): { showInMs: number; hideInMs: number } {
  const age = now.getTime() - startOf(attempt);
  return {
    showInMs: Math.max(0, CONNECT_UNFINISHED_AFTER_MS - age),
    hideInMs: Math.max(0, CONNECT_ABANDON_AFTER_MS - age),
  };
}

/** What the page hands the Connect button: the try, and when its note shows and goes. */
export interface UnfinishedConnect {
  id: string;
  platform: string;
  showInMs: number;
  hideInMs: number;
}

/** The note's words. */
export function unfinishedNoteText(label: string): string {
  return `Didn't finish connecting ${label}? This usually happens when an ad blocker or a strict privacy setting blocks ${label}'s sign-in. Try a private window or Chrome, or turn the blocker off, then try again.`;
}

/** "Having trouble?": the same tips, short. */
export function connectTroubleTips(): string[] {
  return [
    "Turn off ad blockers and privacy extensions for a moment.",
    "On Edge: Settings → Privacy → Tracking prevention → Balanced.",
    "Try Chrome, or a private window.",
    "Turn off a VPN, or try away from a work network.",
    "On a phone, open Waggle in Safari or Chrome, not inside Instagram, Facebook or TikTok.",
  ];
}
