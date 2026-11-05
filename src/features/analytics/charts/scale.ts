// Axis helpers for the hand-built charts. Pure.

import { RAMP } from "./colors";

/** A round step near range / count: 1, 2, 2.5 or 5 × 10^n. */
function niceStep(range: number, count: number): number {
  const raw = range / Math.max(1, count);
  const pow = 10 ** Math.floor(Math.log10(raw));
  const m = raw / pow;
  const nice = m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10;
  return Math.max(nice * pow, Number.EPSILON);
}

/**
 * Round ticks covering [min, max], about `count` of them. With `zero`, the axis starts at 0 (bars
 * and counts); without it, it hugs the data (followers, which move little).
 */
export function niceTicks(min: number, max: number, count = 4, zero = true): number[] {
  let lo = zero ? Math.min(0, min) : min;
  let hi = max;
  if (hi <= lo) hi = lo + (zero ? 1 : Math.max(1, Math.abs(lo) * 0.01));
  const step = niceStep(hi - lo, count);
  // Whole numbers only: these are counts.
  const s = step < 1 ? 1 : step;
  lo = Math.floor(lo / s) * s;
  hi = Math.ceil(hi / s) * s;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + s / 2; v += s) ticks.push(Math.round(v * 100) / 100);
  return ticks;
}

/** Linear map from [d0, d1] to [r0, r1]. */
export function linear(d0: number, d1: number, r0: number, r1: number) {
  const span = d1 - d0 || 1;
  return (v: number) => r0 + ((v - d0) / span) * (r1 - r0);
}

/** About `count` evenly spaced indexes into `length` items, always including the first and last. */
export function labelIndexes(length: number, count: number): number[] {
  if (length <= 0) return [];
  if (length <= count) return Array.from({ length }, (_, i) => i);
  const out = new Set<number>([0, length - 1]);
  const step = (length - 1) / (count - 1);
  for (let i = 1; i < count - 1; i++) out.add(Math.round(i * step));
  return [...out].sort((a, b) => a - b);
}

/** A value's step on the heatmap ramp (0 = fewest), by its share of the busiest cell. */
export function rampStep(value: number, max: number): number {
  if (max <= 0 || value <= 0) return 0;
  return Math.min(RAMP.length - 1, Math.floor((value / max) * RAMP.length));
}
