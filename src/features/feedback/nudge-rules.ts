// When a nudge may show (design v3 FeedbackNudge). Pure, so it is unit tested.

export interface NudgeHistory {
  /** When the login was created. */
  createdAt: Date;
  /** Every nudge this person has seen: when, and whether they said "Not now". */
  shown: { at: Date; dismissed: boolean }[];
  /** When they last sent feedback, if ever. */
  lastFeedbackAt: Date | null;
}

const MIN = 60_000;
const DAY = 24 * 60 * MIN;

/**
 * - never in a new login's first 10 minutes;
 * - at most one a day;
 * - not for 7 days after they sent feedback;
 * - "Not now" three times within 30 days: no nudges for 30 days.
 * (Once per feature per person and "not mid-task" are handled by the caller and the widget.)
 */
export function nudgesAllowed(h: NudgeHistory, now: Date): boolean {
  const t = now.getTime();
  if (t - h.createdAt.getTime() < 10 * MIN) return false;
  if (h.shown.some((s) => t - s.at.getTime() < DAY)) return false;
  if (h.lastFeedbackAt && t - h.lastFeedbackAt.getTime() < 7 * DAY) return false;
  const recentNo = h.shown.filter((s) => s.dismissed && t - s.at.getTime() < 30 * DAY).length;
  return recentNo < 3;
}
