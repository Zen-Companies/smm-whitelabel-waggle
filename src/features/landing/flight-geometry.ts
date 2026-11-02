// The flight path on the landing page: pure geometry, no DOM. The client component measures the
// page and hands the numbers here; this builds the curve and maps scroll to a point on it.

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export type FlightAnchorKind = "dance" | "gutter" | "end";

export interface FlightAnchor {
  kind: FlightAnchorKind;
  rect: Rect;
}

/** The bee flies a little below the top of the window, where the eye is while reading. */
export const READING_LINE = 0.38;
/** The path sways this far either side of the gutter's center: inside a 64px gutter, never under text. */
export const SWAY = 18;
/** Where the bee lands: this far left of the pricing button. */
const END_GAP = 28;
/** The path drops in from straight above the landing point, so the bee arrives facing the button. */
const APPROACH = 90;
/** Waypoints closer than this below the previous one are dropped, so the path only descends. */
const MIN_STEP = 40;
/** The last part of the scroll glides the bee down to the landing point. */
const LANDING_FROM = 0.7;

/**
 * Where the path goes, in page coordinates: it starts at the center of the hero figure-8, runs
 * down the gutter between the two columns with a gentle sway, and lands beside the pricing
 * button at the gutter's edge. Every section is a two-column grid around the same center, so the
 * gutter is the one lane that's free of text all the way down.
 */
export function flightWaypoints(anchors: FlightAnchor[], pageWidth: number): Point[] {
  const center = pageWidth / 2;
  const points: Point[] = [];
  let sway = 1;
  const push = (p: Point) => {
    const prev = points[points.length - 1];
    if (prev && p.y < prev.y + MIN_STEP) return;
    points.push(p);
  };
  for (const a of anchors) {
    const cy = a.rect.top + a.rect.height / 2;
    switch (a.kind) {
      case "dance":
        push({ x: a.rect.left + a.rect.width / 2, y: cy });
        break;
      case "gutter":
        push({ x: center + sway * SWAY, y: cy });
        sway = -sway;
        break;
      case "end":
        push({ x: a.rect.left - END_GAP, y: cy - APPROACH });
        push({ x: a.rect.left - END_GAP, y: cy });
        break;
    }
  }
  return points;
}

/** A smooth cubic curve through every point (Catmull-Rom, as an SVG path string). */
export function smoothPath(points: Point[]): string {
  if (points.length === 0) return "";
  const f = (n: number) => Math.round(n * 10) / 10;
  if (points.length === 1) return `M${f(points[0].x)},${f(points[0].y)}`;
  let d = `M${f(points[0].x)},${f(points[0].y)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += ` C${f(c1.x)},${f(c1.y)} ${f(c2.x)},${f(c2.y)} ${f(p2.x)},${f(p2.y)}`;
  }
  return d;
}

/** Running maximum, so a curve that wobbles up a little still reads as descending. */
export function monotoneEnvelope(values: number[]): number[] {
  const out: number[] = [];
  let max = -Infinity;
  for (const v of values) {
    if (v > max) max = v;
    out.push(max);
  }
  return out;
}

/** The first index whose value reaches `target` (values nondecreasing), or the last index. */
export function firstIndexReaching(values: number[], target: number): number {
  let lo = 0;
  let hi = values.length - 1;
  if (hi < 0) return 0;
  if (values[hi] < target) return hi;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (values[mid] >= target) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

/**
 * How far along the path the bee should be for a scroll position: the point where the path
 * reaches the reading line of the window. Over the last stretch of the scroll the target
 * glides down to the path's end, so the bee lands exactly when the page bottoms out.
 * `sampleYs` are the path's y at even distances.
 */
export function distanceForScroll(
  sampleYs: number[],
  totalLength: number,
  scrollY: number,
  viewportHeight: number,
  maxScroll: number,
): number {
  if (sampleYs.length < 2 || totalLength <= 0) return 0;
  const envelope = monotoneEnvelope(sampleYs);
  let target = scrollY + viewportHeight * READING_LINE;
  if (maxScroll > 0) {
    const f = Math.min(1, Math.max(0, scrollY / maxScroll));
    const t = Math.min(1, Math.max(0, (f - LANDING_FROM) / (1 - LANDING_FROM)));
    const glide = t * t * (3 - 2 * t);
    target += (envelope[envelope.length - 1] - target) * glide;
  }
  if (target <= envelope[0]) return 0;
  const i = firstIndexReaching(envelope, target);
  return (i / (sampleYs.length - 1)) * totalLength;
}
