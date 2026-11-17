import { cn } from "cn";
import { BeeBody } from "./bee";

// The bee on Your plan (approved 17 Nov, canvas "Settings · Your plan, with the bee"; design.md
// §6). AI replies are honey in a comb, each plan has its bees, and the bee rests when replies run
// out. The numbers are always written beside the art, never only in it. Reduced motion shows
// everything drawn and still (globals.css).

const INK = "var(--ink)";
const HONEY = "var(--honey)";

function Bee({
  w = 24,
  className,
  style,
}: {
  w?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span aria-hidden className={cn("absolute block", className)} style={style}>
      <svg width={w} height={Math.round((w * 16) / 24)} viewBox="0 0 24 16">
        <BeeBody />
      </svg>
    </span>
  );
}

function hexPoints(x: number, y: number, r: number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const a = ((60 * i - 30) * Math.PI) / 180;
    return `${(x + r * Math.cos(a)).toFixed(1)},${(y + r * Math.sin(a)).toFixed(1)}`;
  }).join(" ");
}

/** Pure: how many of `cells` are full, and whether the next is part-filled. */
export function combFill(
  used: number,
  allowance: number,
  cells: number,
): { full: number; part: boolean } {
  if (allowance <= 0) return { full: 0, part: false };
  const share = (Math.min(used, allowance) / allowance) * cells;
  const full = Math.floor(share);
  return { full, part: full < cells && share - full >= 0.25 };
}

/**
 * AI replies as a row of comb cells (each `allowance / cells` replies). Full cells pour in one by
 * one when the page opens; the bee sits on the last full one. `rest` puts it to sleep (out of
 * replies).
 */
export function CombMeter({
  used,
  allowance,
  cells = 10,
  size = 18,
  className,
}: {
  used: number;
  allowance: number;
  cells?: number;
  size?: number;
  className?: string;
}) {
  const { full, part } = combFill(used, allowance, cells);
  const dx = size * 1.732 + 2;
  const width = Math.ceil(size * 2 + 8 + (cells - 1) * dx);
  const height = Math.ceil(size * 2 + size * 0.9 + 6);
  const perch = Math.max(0, full - 1);
  const px = size + 4 + perch * dx;
  const py = perch % 2 === 0 ? 3 + size : 3 + size + size * 0.9;
  return (
    <span
      aria-hidden
      className={cn("relative block max-w-full", className)}
      style={{ width, height: height + 6 }}
    >
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="absolute bottom-0 left-0 max-w-full"
      >
        {Array.from({ length: cells }, (_, i) => {
          const x = size + 4 + i * dx;
          const y = i % 2 === 0 ? 3 + size : 3 + size + size * 0.9;
          const isFull = i < full;
          const isPart = i === full && part;
          return (
            <polygon
              key={i}
              points={hexPoints(x, y, size)}
              fill={isFull ? HONEY : isPart ? "var(--honey-tint)" : "var(--surface)"}
              stroke={isFull || isPart ? INK : "var(--line-strong)"}
              strokeWidth="1.3"
              strokeLinejoin="round"
              className={isFull ? "comb-pour" : undefined}
              style={isFull ? { animationDelay: `${i * 0.12}s` } : undefined}
            />
          );
        })}
      </svg>
      {full > 0 && full < cells && (
        <Bee
          w={Math.round(size * 1.4)}
          className="bee-bob"
          style={{ left: px - size * 0.5, top: py - size * 1.7 }}
        />
      )}
    </span>
  );
}

/** The 7 trial days as small cells, filled as they pass. */
export function TrialCells({ day, of }: { day: number; of: number }) {
  const r = 10;
  return (
    <svg
      aria-hidden
      width={of * 23 + 6}
      height={42}
      viewBox={`0 0 ${of * 23 + 6} 42`}
      className="shrink-0"
    >
      {Array.from({ length: of }, (_, i) => (
        <polygon
          key={i}
          points={hexPoints(13 + i * 23, i % 2 === 0 ? 15 : 26, r)}
          fill={i < day ? HONEY : "var(--surface)"}
          stroke={i < day ? INK : "var(--line-strong)"}
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}

const FIGURE_8 =
  "M120,60 C138,30 204,24 204,60 C204,96 138,90 120,60 C102,30 36,24 36,60 C36,96 102,90 120,60Z";

/** Each plan's bees: Solo one bee, Business a little swarm on the figure-8, Team a hive. */
export function PlanBees({
  plan,
  className,
}: {
  plan: "solo" | "business" | "team";
  className?: string;
}) {
  if (plan === "solo") {
    return (
      <span aria-hidden className={cn("relative block h-[70px] w-[70px] shrink-0", className)}>
        <Bee w={36} className="bee-bob" style={{ left: 14, top: 22 }} />
      </span>
    );
  }
  if (plan === "business") {
    return (
      <span aria-hidden className={cn("relative block h-[70px] w-[150px] shrink-0", className)}>
        <svg width="150" height="70" viewBox="0 0 240 120" className="absolute inset-0">
          <path
            d={FIGURE_8}
            fill="none"
            stroke={HONEY}
            strokeWidth="4"
            strokeDasharray="2 7"
            strokeLinecap="round"
          />
        </svg>
        <Bee w={26} className="bee-bob" style={{ left: 4, top: 22 }} />
        <Bee w={30} className="bee-bob" style={{ left: 62, top: 0, animationDelay: "0.4s" }} />
        <Bee w={24} className="bee-bob" style={{ left: 112, top: 30, animationDelay: "0.8s" }} />
      </span>
    );
  }
  return (
    <span aria-hidden className={cn("relative block h-[70px] w-[150px] shrink-0", className)}>
      <svg width="70" height="70" viewBox="0 0 70 70" className="absolute top-0 left-0">
        <path d="M35 6c-8 0-12 6-12 6h24s-4-6-12-6z" fill={HONEY} stroke={INK} strokeWidth="1.3" />
        <rect
          x="16"
          y="12"
          width="38"
          height="12"
          rx="6"
          fill={HONEY}
          stroke={INK}
          strokeWidth="1.3"
        />
        <rect
          x="11"
          y="24"
          width="48"
          height="13"
          rx="6.5"
          fill={HONEY}
          stroke={INK}
          strokeWidth="1.3"
        />
        <rect
          x="13"
          y="37"
          width="44"
          height="13"
          rx="6.5"
          fill={HONEY}
          stroke={INK}
          strokeWidth="1.3"
        />
        <rect
          x="19"
          y="50"
          width="32"
          height="12"
          rx="6"
          fill={HONEY}
          stroke={INK}
          strokeWidth="1.3"
        />
        <ellipse cx="35" cy="56" rx="5" ry="4" fill={INK} />
      </svg>
      <Bee w={22} className="bee-bob" style={{ left: 76, top: 4 }} />
      <Bee w={22} className="bee-bob" style={{ left: 96, top: 34, animationDelay: "0.5s" }} />
      <Bee w={20} className="bee-bob" style={{ left: 120, top: 14, animationDelay: "1s" }} />
    </span>
  );
}

/** Out of replies: the bee rests, swaying, with two small z's. */
export function RestingBee({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn("relative block h-[44px] w-[64px] shrink-0", className)}>
      <Bee w={34} className="bee-sway" style={{ left: 6, top: 16 }} />
      <span className="bee-zz text-honey-text absolute top-0.5 left-11 text-xs font-bold">z</span>
      <span
        className="bee-zz text-honey-text absolute top-0 left-[52px] text-xs font-bold"
        style={{ animationDelay: "1.2s" }}
      >
        z
      </span>
    </span>
  );
}
