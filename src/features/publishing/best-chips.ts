import { nextOccurrence, toLocalSlot, topSlots } from "@/features/analytics";
import type { BestTimeSlot } from "@/lib/social/analytics-types";
import { clock12, wallClockIn, zoneOffsetMinutes } from "./post-time";

// The best-time chips in the date/time picker (Posts Round 3, decision 3, approved 25 Nov):
// "Your posts do best at:" with 3 times from Zernio's analysis of the brand's own past posts
// (the same data as Insights → Audience). Shown once about 10 posts are behind the analysis.

/** Posts behind the analysis before the chips show. */
export const BEST_TIME_MIN_POSTS = 10;

export interface BestChip {
  /** "Thu 7:00 PM" */
  label: string;
  /** Wall clock in the viewer's zone. */
  day: string;
  time: string;
}

/** How many of the brand's posts the analysis is built from (each post sits in one slot). */
export const postsAnalyzed = (slots: readonly BestTimeSlot[] | null): number =>
  (slots ?? []).reduce((n, s) => n + (s.postCount > 0 ? s.postCount : 0), 0);

/**
 * The chips, or null while Waggle is still learning ("Waggle learns your best times after a few
 * posts"). Each chip is the slot's next time in the viewer's zone, never within the next hour.
 */
export function bestChips(
  slots: readonly BestTimeSlot[] | null,
  now: Date,
  timeZone: string,
): BestChip[] | null {
  if (postsAnalyzed(slots) < BEST_TIME_MIN_POSTS) return null;
  const top = topSlots([...(slots ?? [])], 3);
  if (!top.length) return null;
  // `nextOccurrence` reads the clock's local fields: hand it the viewer's wall clock as one.
  const wall = wallClockIn(now, timeZone);
  const [y, m, d] = wall.day.split("-").map(Number);
  const [h, mi] = wall.time.split(":").map(Number);
  const localNow = new Date(y, m - 1, d, h, mi, now.getUTCSeconds());
  const offset = -zoneOffsetMinutes(now, timeZone);
  return top.map((s) => {
    const next = nextOccurrence(toLocalSlot(s, offset), localNow);
    const [ny, nm, nd] = next.day.split("-").map(Number);
    const weekday = new Date(Date.UTC(ny, nm - 1, nd)).toLocaleDateString("en-US", {
      weekday: "short",
      timeZone: "UTC",
    });
    return { label: `${weekday} ${clock12(next.time)}`, day: next.day, time: next.time };
  });
}
