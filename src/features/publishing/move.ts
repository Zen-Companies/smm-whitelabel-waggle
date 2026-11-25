import { fromWallClock, wallClockIn } from "./post-time";

// Move a planned post to another day or time (Posts Round 3, approved 25 Nov): drag on the
// week calendar (computer only) or Move in the post panel. Pure.

/** Scheduled posts must be at least this far ahead (the composer says the same). */
const MIN_AHEAD_MS = 5 * 60_000;

/**
 * Only a planned post that the platforms already hold can be moved: it goes through an update
 * of that post. A post that went out (or is going out) never moves.
 */
export function canMove(post: { status: string; zernio_post_id?: string | null }): boolean {
  return post.status === "scheduled" && !!post.zernio_post_id;
}

/** The same time of day on another day, in the viewer's zone (a drag keeps the post's time). */
export function moveToDay(iso: string, toDay: string, timeZone: string): Date {
  return fromWallClock(toDay, wallClockIn(iso, timeZone).time, timeZone);
}

/** Why a post can't go to `at`, or null when it can. Never into the past. */
export function moveProblem(at: Date, now: Date): string | null {
  if (Number.isNaN(at.getTime())) return "Pick a day and time.";
  if (at.getTime() < now.getTime() + MIN_AHEAD_MS) {
    return "That time has already passed. Pick a later one.";
  }
  return null;
}

/** Whether a day can take a dragged post: not a day already past, and not the post's own day. */
export function canDropOn(
  post: { scheduled_for: string | null },
  day: string,
  timeZone: string,
  now: Date,
): boolean {
  if (!post.scheduled_for) return false;
  if (wallClockIn(post.scheduled_for, timeZone).day === day) return false;
  return moveProblem(moveToDay(post.scheduled_for, day, timeZone), now) === null;
}
