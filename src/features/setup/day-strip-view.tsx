"use client";

import { useState, type KeyboardEvent, type PointerEvent } from "react";
import { BeeBody } from "@/components/app/bee";
import { dayTip, marksScale, STRIP_DAYS, stripTicks, type StripDay } from "./day-strip";

// The 30-day strip (board "Setup comes alive", idea 1, approved 21 Nov; dates and tooltip from
// "Step 2 plays like a story", 23 Nov). While Waggle reads, the bee flies back from today as far
// as the reading has got, and each find stacks on its day: blue for a DM, sand for a comment, red
// for one nobody answered. Once read, the bee rests at today. Weekly dates sit under it; hover,
// tap or arrow keys on a day show "Tue 28 Oct · 2 DMs · 1 no reply".

const W = 388;
const H = 112;
const COL = (W - 8) / STRIP_DAYS;
const MARK_W = 9;
const MARK_H = 6;
const GAP = 1;
const BASE = 88;
const MAX_MARKS = 10;
const TIP_H = 20;

const DM = "#3B6FB6";
const COMMENT = "#D8C7A3";
const NO_REPLY = "var(--danger, #8C2A1E)";

const colX = (i: number) => 4 + i * COL;

export function DayStripView({
  days,
  progress,
  now,
}: {
  days: readonly StripDay[];
  /** 0–100 while reading (the bee flies); left out once read (the bee rests at today). */
  progress?: number;
  /** ISO time the page was rendered: the dates under the strip and in the tooltip. */
  now: string;
}) {
  const [pick, setPick] = useState<number | null>(null);
  const at = new Date(now);
  const per = marksScale(days, MAX_MARKS);
  const reading = progress !== undefined;
  const beeX = W - 30 - ((W - 40) * Math.min(100, Math.max(0, progress ?? 0))) / 100;
  const total = days.reduce((n, d) => n + d.dms + d.comments, 0);
  const missed = days.reduce((n, d) => n + d.noReply, 0);
  const tip = pick !== null && days[pick] ? dayTip(days[pick], pick, at) : null;
  // About 5.4 px a character at 10 px; kept inside the strip.
  const tipW = tip ? Math.round(tip.length * 5.4) + 16 : 0;
  const tipX = pick !== null ? Math.min(W - tipW, Math.max(0, colX(pick) + COL / 2 - tipW / 2)) : 0;

  const dayAt = (e: PointerEvent<SVGSVGElement>): number => {
    const box = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * W;
    return Math.min(STRIP_DAYS - 1, Math.max(0, Math.floor((x - 4) / COL)));
  };
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const step = e.key === "ArrowLeft" ? -1 : 1;
      setPick((p) => Math.min(STRIP_DAYS - 1, Math.max(0, (p ?? STRIP_DAYS - 1) + step)));
    } else if (e.key === "Escape") {
      setPick(null);
    }
  };

  return (
    <figure className="flex flex-col gap-1.5">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full max-w-[460px] touch-pan-y rounded-md"
        role="img"
        tabIndex={0}
        aria-label={`Last 30 days: ${total} messages found, ${missed} with no reply. Arrow keys read a day.`}
        onPointerMove={(e) => {
          if (e.pointerType === "mouse") setPick(dayAt(e));
        }}
        onPointerDown={(e) => setPick(dayAt(e))}
        onPointerLeave={(e) => {
          if (e.pointerType === "mouse") setPick(null);
        }}
        onFocus={() => setPick((p) => p ?? STRIP_DAYS - 1)}
        onBlur={() => setPick(null)}
        onKeyDown={onKey}
      >
        {reading && (
          <path
            d={`M${beeX + 26} 18 C ${beeX + 60} 0, ${(beeX + W) / 2} 30, ${W - 2} 16`}
            fill="none"
            stroke="var(--line-strong)"
            strokeDasharray="3 4"
          />
        )}
        {days.map((d, i) => {
          const x = colX(i) + (COL - MARK_W) / 2;
          const n = d.dms + d.comments;
          if (n === 0) {
            return (
              <rect
                key={i}
                x={x}
                y={BASE - MARK_H}
                width={MARK_W}
                height={MARK_H}
                rx={2}
                fill="var(--subtle)"
              />
            );
          }
          // Comments at the bottom, DMs on top; the first marks of each kind go red for no reply.
          const comments = Math.ceil(d.comments / per);
          const dms = Math.ceil(d.dms / per);
          let red = Math.ceil(d.noReply / per);
          const marks: { fill: string; round: number }[] = [];
          for (let k = 0; k < dms; k++) {
            marks.push({ fill: red > 0 ? NO_REPLY : DM, round: 3 });
            if (red > 0) red -= 1;
          }
          for (let k = 0; k < comments; k++) {
            marks.push({ fill: red > 0 ? NO_REPLY : COMMENT, round: 2 });
            if (red > 0) red -= 1;
          }
          return marks
            .reverse()
            .map((m, k) => (
              <rect
                key={`${i}-${k}`}
                x={x}
                y={BASE - (k + 1) * (MARK_H + GAP)}
                width={MARK_W}
                height={MARK_H}
                rx={m.round}
                fill={m.fill}
              />
            ));
        })}
        {stripTicks(at).map((t, k, all) => {
          const x = colX(t.index) + COL / 2;
          const last = k === all.length - 1;
          return (
            <g key={t.index}>
              <line x1={x} x2={x} y1={BASE + 3} y2={BASE + 7} stroke="var(--line-strong)" />
              <text
                x={last ? W - 2 : x}
                y={H - 6}
                fontSize="10"
                fill="var(--ink-3)"
                textAnchor={last ? "end" : "middle"}
              >
                {t.label}
              </text>
            </g>
          );
        })}
        {reading ? (
          <g className="strip-bee" style={{ transform: `translate(${beeX}px, 4px)` }}>
            <svg width="28" height="19" viewBox="0 0 24 16" className="bee-bob">
              <BeeBody />
            </svg>
          </g>
        ) : (
          // Read: the bee rests at today.
          <svg x={W - 34} y={0} width="26" height="17" viewBox="0 0 24 16" className="bee-rest">
            <BeeBody flutter={false} />
          </svg>
        )}
        {pick !== null && tip && (
          <g pointerEvents="none">
            <rect
              x={colX(pick) + 0.5}
              y={TIP_H + 4}
              width={COL - 1}
              height={BASE - TIP_H - 2}
              rx={3}
              fill="none"
              stroke="var(--ink)"
            />
            <rect x={tipX} y={0} width={tipW} height={TIP_H} rx={6} fill="var(--ink)" />
            <text x={tipX + 8} y={14} fontSize="10" fill="var(--surface)">
              {tip}
            </text>
          </g>
        )}
      </svg>
      {/* What the tooltip says, for screen readers too. */}
      <span className="sr-only" aria-live="polite">
        {tip ?? ""}
      </span>
      <figcaption className="text-ink-2 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px]">
        <Key color={DM} round>
          DM
        </Key>
        <Key color={COMMENT}>comment</Key>
        <Key color={NO_REPLY} round>
          no reply
        </Key>
        {per > 1 && <span className="text-ink-3">each mark is {per} messages</span>}
      </figcaption>
    </figure>
  );
}

function Key({ color, round, children }: { color: string; round?: boolean; children: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        aria-hidden
        className="inline-block h-[7px] w-[10px]"
        style={{ background: color, borderRadius: round ? 3 : 2 }}
      />
      {children}
    </span>
  );
}
