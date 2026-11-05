"use client";

import { useState } from "react";
import { full } from "../format";
import { AXIS, GRID } from "./colors";
import { labelIndexes, linear, niceTicks } from "./scale";
import { useWidth } from "./use-width";

export interface BarSegment {
  name: string;
  color: string;
  values: number[];
}

/** The top of a bar: square at the base, 4px rounded corners at the data end. */
function barPath(x: number, y: number, w: number, h: number, rounded: boolean): string {
  if (h <= 0) return "";
  const r = rounded ? Math.min(4, w / 2, h) : 0;
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

/**
 * Stacked daily bars (T52): the first segment at the bottom, a 2px gap between segments, the top
 * one rounded. A tooltip per bar on hover or focus.
 */
export function StackedBars({
  ariaLabel,
  xLabels,
  xTitles,
  segments,
  height = 220,
}: {
  ariaLabel: string;
  xLabels: string[];
  xTitles: string[];
  segments: BarSegment[];
  height?: number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>(640);
  const [hover, setHover] = useState<number | null>(null);
  const n = xLabels.length;
  const totals = xLabels.map((_, i) => segments.reduce((a, s) => a + (s.values[i] ?? 0), 0));
  const ticks = niceTicks(0, Math.max(0, ...totals), 3);
  const padL = Math.max(...ticks.map((t) => full(t).length)) * 7 + 10;
  const padR = 8;
  const padT = 10;
  const padB = 26;
  const slot = (width - padL - padR) / Math.max(1, n);
  const barW = Math.max(2, Math.min(28, slot * 0.7));
  const y = linear(0, ticks[ticks.length - 1], height - padB, padT);
  const cx = (i: number) => padL + slot * i + slot / 2;

  return (
    <div className="flex flex-col gap-2">
      <div className="text-ink-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
        {segments.map((s) => (
          <span key={s.name} className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-[2px]" style={{ background: s.color }} aria-hidden />
            {s.name}
          </span>
        ))}
      </div>
      <div ref={ref} className="relative w-full">
        <svg width={width} height={height} role="img" aria-label={ariaLabel} className="block">
          <g fontSize="11" fill="var(--ink-3)">
            {ticks.map((t, i) => (
              <g key={t}>
                {i > 0 && <line x1={padL} x2={width - padR} y1={y(t)} y2={y(t)} stroke={GRID} />}
                <text x={padL - 8} y={y(t) + 4} textAnchor="end">
                  {full(t)}
                </text>
              </g>
            ))}
            {labelIndexes(n, width < 480 ? 3 : 5).map((i) => (
              <text
                key={i}
                x={cx(i)}
                y={height - 6}
                textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}
              >
                {xLabels[i]}
              </text>
            ))}
          </g>
          <line x1={padL} x2={width - padR} y1={height - padB} y2={height - padB} stroke={AXIS} />
          {xLabels.map((_, i) => {
            let base = height - padB;
            const top = segments.findLastIndex((s) => (s.values[i] ?? 0) > 0);
            return (
              <g
                key={i}
                tabIndex={0}
                aria-label={`${xTitles[i]}: ${segments.map((s) => `${s.name} ${s.values[i] ?? 0}`).join(", ")}`}
                onPointerEnter={() => setHover(i)}
                onPointerLeave={() => setHover(null)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                className="outline-none"
              >
                <rect
                  x={padL + slot * i}
                  y={padT}
                  width={slot}
                  height={height - padB - padT}
                  fill={hover === i ? "var(--subtle)" : "transparent"}
                />
                {segments.map((s, k) => {
                  const v = s.values[i] ?? 0;
                  if (v <= 0) return null;
                  const h = y(0) - y(v);
                  // 2px of white between stacked segments.
                  const gap = k > 0 && base < height - padB ? 2 : 0;
                  const yTop = base - h;
                  const d = barPath(cx(i) - barW / 2, yTop, barW, Math.max(0, h - gap), k === top);
                  base = yTop;
                  return <path key={s.name} d={d} fill={s.color} />;
                })}
              </g>
            );
          })}
        </svg>
        {hover !== null && (
          <div
            role="presentation"
            className="bg-ink text-surface pointer-events-none absolute top-1 rounded-md px-3 py-2 text-xs leading-5 whitespace-nowrap"
            style={{ left: Math.min(Math.max(0, cx(hover) + 12), Math.max(0, width - 200)) }}
          >
            <b className="font-semibold">{xTitles[hover]}</b>
            {segments.map((s) => (
              <div key={s.name}>
                {s.name}: {full(s.values[hover] ?? 0)}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
