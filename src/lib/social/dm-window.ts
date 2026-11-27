import { inboxRules } from "./platforms";

// A platform's DM reply window (T61), shared by the policy check and the upgrade pop-ups' DM
// countdown (Playbook round 2, 26 Nov), so both say the same close time. Pure.

/** Meta only allows replying to a DM within 24 hours of the customer's last message. */
export const DM_REPLY_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * A platform's DM rules (T61): Meta 24 h; TikTok 48 h and 10 replies; Bluesky none (null).
 * Without a platform (older callers), Meta's.
 */
export function dmWindowFor(
  platform: string | undefined,
): { ms: number; maxReplies: number | null } | null {
  if (!platform) return { ms: DM_REPLY_WINDOW_MS, maxReplies: null };
  const w = inboxRules(platform).dmWindow;
  return w ? { ms: w.hours * 60 * 60 * 1000, maxReplies: w.maxReplies } : null;
}

/** When a DM's reply window closes; null when the platform has none or nothing is known. */
export function dmWindowClosesAt(platform: string | undefined, last: Date | null): Date | null {
  const w = dmWindowFor(platform);
  return w && last ? new Date(last.getTime() + w.ms) : null;
}
