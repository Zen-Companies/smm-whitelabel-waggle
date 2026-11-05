// Number and change formatting for the Analytics page (T49-T52). Pure, and pinned to one locale so
// the server and the browser print the same text.

const LOCALE = "en-US";
const COMPACT = new Intl.NumberFormat(LOCALE, { notation: "compact", maximumFractionDigits: 1 });

/** "312", "4,048", "18.4K", "1.2M": full up to 9,999, compact above. */
export function compact(n: number): string {
  return Math.abs(n) < 10_000 ? Math.round(n).toLocaleString(LOCALE) : COMPACT.format(n);
}

/** "6,204": always the full number (tables, tooltips). */
export const full = (n: number) => Math.round(n).toLocaleString(LOCALE);

/** "4.6%" */
export const percent = (n: number, digits = 1) =>
  `${n.toLocaleString(LOCALE, { maximumFractionDigits: digits, minimumFractionDigits: 0 })}%`;

export interface Delta {
  direction: "up" | "down" | "flat";
  /** Always carries ▲/▼ or words: never color alone. */
  text: string;
}

/** "▲ 12%" against the previous period; null when there is nothing to compare with. */
export function percentDelta(current: number, previous: number | null | undefined): Delta | null {
  if (previous === null || previous === undefined || previous <= 0) return null;
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return { direction: "flat", text: "No change" };
  return pct > 0
    ? { direction: "up", text: `▲ ${pct}%` }
    : { direction: "down", text: `▼ ${Math.abs(pct)}%` };
}

/** Rates change in points, not percent: "▼ 0.3 points". */
export function pointsDelta(current: number, previous: number | null | undefined): Delta | null {
  if (previous === null || previous === undefined) return null;
  const diff = Math.round((current - previous) * 10) / 10;
  if (diff === 0) return { direction: "flat", text: "No change" };
  const size = Math.abs(diff);
  const unit = size === 1 ? "point" : "points";
  return diff > 0
    ? { direction: "up", text: `▲ ${size} ${unit}` }
    : { direction: "down", text: `▼ ${size} ${unit}` };
}

/** Followers gained: "▲ 114 new", "▼ 3 fewer", "No new followers". */
export function gainedDelta(gained: number): Delta {
  if (gained === 0) return { direction: "flat", text: "No new followers" };
  return gained > 0
    ? { direction: "up", text: `▲ ${full(gained)} new` }
    : { direction: "down", text: `▼ ${full(-gained)} fewer` };
}

/** The middle value (mean of the two middle ones for an even count); null for none. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** A wait, short: "6 s", "4 min", "2 h 10 min", "3 d". */
export function duration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s} s`;
  const minutes = Math.round(s / 60);
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 24 * 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m ? `${h} h ${m} min` : `${h} h`;
  }
  return `${Math.round(minutes / (24 * 60))} d`;
}

/** Time saved at `minutesEach` per reply: "40 min", "1 h 30 min", "8 h". */
export function timeSaved(replies: number, minutesEach = 2): string {
  const minutes = replies * minutesEach;
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  // An estimate: whole hours from 2 hours up.
  return h >= 2 || m === 0 ? `${Math.round(minutes / 60)} h` : `${h} h ${m} min`;
}

/** "Reel", "Photo": a stored format as a word. */
export function formatName(format: string): string {
  const names: Record<string, string> = {
    reel: "Reel",
    photo: "Photo",
    carousel: "Carousel",
    story: "Story",
    video: "Video",
    text: "Text post",
    post: "Post",
  };
  return names[format] ?? format.charAt(0).toUpperCase() + format.slice(1);
}

/** "Oct 26" (UTC day, so server and browser agree). */
export function shortDate(isoOrDay: string): string {
  const d = new Date(isoOrDay.length === 10 ? `${isoOrDay}T00:00:00Z` : isoOrDay);
  return d.toLocaleDateString(LOCALE, { month: "short", day: "numeric", timeZone: "UTC" });
}

/** "Sat, Oct 26" for tooltips. */
export function longDate(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString(LOCALE, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
