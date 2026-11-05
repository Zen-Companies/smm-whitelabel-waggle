"use client";

import { useState } from "react";
import { compact, full } from "../format";
import { AXIS, GRID } from "./colors";
import { labelIndexes, linear, niceTicks } from "./scale";
import { useWidth } from "./use-width";

export interface LineSeries {
  name: string;
  color: string;
  values: (number | null)[];
  dashed?: boolean;
}

/**
 * A daily line chart (T49, T51): 2px lines, a quiet grid, the last value labelled at the line's
 * end, a crosshair with a tooltip on hover. The first series is the one being read; others (the
 * previous period) are grey and dashed.
 */
export function LineChart({
  ariaLabel,
  xLabels,
  xTitles,
  series,
  height = 240,
  zero = true,
  marks = [],
  markNote,
  unit,
}: {
  ariaLabel: string;
  xLabels: string[];
  xTitles: string[];
  series: LineSeries[];
  height?: number;
  zero?: boolean;
  /** Indexes marked with a dot on the first series (days a post went out). */
  marks?: number[];
  markNote?: string;
  /** Word after the value in the tooltip: "reached". */
  unit?: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>(640);
  const [hover, setHover] = useState<number | null>(null);
  const all = series.flatMap((s) => s.values.filter((v): v is number => v !== null));
  const lo = all.length ? Math.min(...all) : 0;
  const hi = all.length ? Math.max(...all) : 0;
  const ticks = niceTicks(lo, hi, 4, zero);
  const n = xLabels.length;
  const tickText = ticks.map((t) => compact(t));
  const padL = Math.max(...tickText.map((t) => t.length)) * 7 + 10;
  const padR = 44;
  const padT = 10;
  const padB = 26;
  const x = linear(0, Math.max(1, n - 1), padL, width - padR);
  const y = linear(ticks[0], ticks[ticks.length - 1], height - padB, padT);
  const path = (values: (number | null)[]) => {
    let d = "";
    let pen = false;
    values.forEach((v, i) => {
      if (v === null) {
        pen = false;
        return;
      }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };
  const main = series[0];
  const lastIndex = main ? main.values.findLastIndex((v) => v !== null) : -1;
  const markSet = new Set(marks);

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - box.left + padL;
    const i = Math.round(((px - padL) / Math.max(1, width - padR - padL)) * (n - 1));
    setHover(Math.min(n - 1, Math.max(0, i)));
  };

  return (
    <div className="flex flex-col gap-2">
      {series.length > 1 && (
        <div className="text-ink-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
          {series.map((s) => (
            <span key={s.name} className="inline-flex items-center gap-1.5">
              <svg width="18" height="4" aria-hidden>
                <line
                  x1="0"
                  y1="2"
                  x2="18"
                  y2="2"
                  stroke={s.color}
                  strokeWidth="2"
                  strokeDasharray={s.dashed ? "4 3" : undefined}
                />
              </svg>
              {s.name}
            </span>
          ))}
        </div>
      )}
      <div ref={ref} className="relative w-full">
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={ariaLabel}
          className="block max-w-full overflow-visible"
        >
          <g fontSize="11" fill="var(--ink-3)">
            {ticks.map((t, i) => (
              <g key={t}>
                {i > 0 && <line x1={padL} x2={width - padR} y1={y(t)} y2={y(t)} stroke={GRID} />}
                <text x={padL - 8} y={y(t) + 4} textAnchor="end">
                  {tickText[i]}
                </text>
              </g>
            ))}
            {labelIndexes(n, width < 480 ? 3 : 5).map((i) => (
              <text
                key={i}
                x={x(i)}
                y={height - 6}
                textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}
              >
                {xLabels[i]}
              </text>
            ))}
          </g>
          <line x1={padL} x2={width - padR} y1={height - padB} y2={height - padB} stroke={AXIS} />
          {[...series].reverse().map((s) => (
            <path
              key={s.name}
              d={path(s.values)}
              fill="none"
              stroke={s.color}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeDasharray={s.dashed ? "4 3" : undefined}
            />
          ))}
          {main &&
            main.values.map((v, i) =>
              v !== null && markSet.has(i) ? (
                <circle
                  key={i}
                  cx={x(i)}
                  cy={y(v)}
                  r="3"
                  fill={main.color}
                  stroke="var(--surface)"
                  strokeWidth="1.5"
                />
              ) : null,
            )}
          {main && lastIndex >= 0 && hover === null && (
            <text
              x={x(lastIndex) + 6}
              y={y(main.values[lastIndex]!) + 4}
              fontSize="12"
              fontWeight="600"
              fill="var(--ink-2)"
            >
              {compact(main.values[lastIndex]!)}
            </text>
          )}
          {hover !== null && (
            <g>
              <line
                x1={x(hover)}
                x2={x(hover)}
                y1={padT}
                y2={height - padB}
                stroke="var(--ink-3)"
              />
              {series.map((s) =>
                s.values[hover] !== null && s.values[hover] !== undefined ? (
                  <circle
                    key={s.name}
                    cx={x(hover)}
                    cy={y(s.values[hover]!)}
                    r="4"
                    fill={s.color}
                    stroke="var(--surface)"
                    strokeWidth="2"
                  />
                ) : null,
              )}
            </g>
          )}
          <rect
            x={padL}
            y={0}
            width={Math.max(0, width - padR - padL)}
            height={height - padB}
            fill="transparent"
            onPointerMove={onMove}
            onPointerLeave={() => setHover(null)}
          />
        </svg>
        {hover !== null && (
          <div
            role="presentation"
            className="bg-ink text-surface pointer-events-none absolute top-1 rounded-md px-3 py-2 text-xs leading-5 whitespace-nowrap"
            style={{
              left: Math.min(Math.max(0, x(hover) + 12), Math.max(0, width - 180)),
            }}
          >
            <b className="font-semibold">{xTitles[hover]}</b>
            {series.map((s) => (
              <div key={s.name}>
                {s.values[hover] === null || s.values[hover] === undefined
                  ? `${s.name}: no number`
                  : `${series.length > 1 ? `${s.name}: ` : ""}${full(s.values[hover]!)}${unit ? ` ${unit}` : ""}`}
              </div>
            ))}
            {markSet.has(hover) && markNote && <div className="text-ink-4">{markNote}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
