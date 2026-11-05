"use client";

import { useState } from "react";
import { hourLabel, WEEKDAY_NAMES, WEEKDAYS } from "../best-time";
import { full } from "../format";
import { RAMP } from "./colors";
import { rampStep } from "./scale";
import { useWidth } from "./use-width";

/** Weekdays × 24 hours, one honey ramp, a Fewer → More legend and a tooltip per cell. */
export function Heatmap({ ariaLabel, grid }: { ariaLabel: string; grid: number[][] }) {
  const [ref, width] = useWidth<HTMLDivElement>(720);
  const [hover, setHover] = useState<{ d: number; h: number } | null>(null);
  const max = Math.max(...grid.flat());
  const padL = 34;
  const padB = 22;
  const gap = 2;
  const cell = Math.max(6, (width - padL) / 24);
  const rowH = Math.min(26, Math.max(14, cell));
  const height = rowH * 7 + padB;

  return (
    <div className="flex flex-col gap-2">
      <div className="text-ink-3 flex items-center gap-2 self-end text-[13px]" aria-hidden>
        Fewer
        <span className="flex">
          {RAMP.map((c) => (
            <span key={c} className="h-2.5 w-3.5" style={{ background: c }} />
          ))}
        </span>
        More
      </div>
      <div ref={ref} className="relative w-full">
        <svg width={width} height={height} role="img" aria-label={ariaLabel} className="block">
          <g fontSize="11" fill="var(--ink-3)">
            {WEEKDAYS.map((d, i) => (
              <text key={d} x={padL - 6} y={i * rowH + rowH / 2 + 4} textAnchor="end">
                {d}
              </text>
            ))}
            {[0, 6, 12, 18, 23].map((h) => (
              <text
                key={h}
                x={padL + h * cell + cell / 2}
                y={height - 6}
                textAnchor={h === 23 ? "end" : h === 0 ? "start" : "middle"}
              >
                {hourLabel(h)}
              </text>
            ))}
          </g>
          {grid.map((row, d) =>
            row.map((v, h) => (
              <rect
                key={`${d}-${h}`}
                x={padL + h * cell}
                y={d * rowH}
                width={Math.max(1, cell - gap)}
                height={rowH - gap}
                rx="2"
                fill={RAMP[rampStep(v, max)]}
                stroke={hover?.d === d && hover.h === h ? "var(--ink)" : "none"}
                onPointerEnter={() => setHover({ d, h })}
                onPointerLeave={() => setHover(null)}
              />
            )),
          )}
        </svg>
        {hover && (
          <div
            role="presentation"
            className="bg-ink text-surface pointer-events-none absolute rounded-md px-3 py-2 text-xs leading-5 whitespace-nowrap"
            style={{
              left: Math.min(padL + hover.h * cell + cell, Math.max(0, width - 170)),
              top: Math.max(0, hover.d * rowH - 44),
            }}
          >
            <b className="font-semibold">
              {WEEKDAY_NAMES[hover.d]}, {hourLabel(hover.h)}
            </b>
            <div>{full(grid[hover.d][hover.h])} followers online</div>
          </div>
        )}
      </div>
    </div>
  );
}
