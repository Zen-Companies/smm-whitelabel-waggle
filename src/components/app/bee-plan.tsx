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

// The plan bees (approved 20 Nov, canvas "Plan pill peek + Free and Solo bees"). One story: cells
// are accounts, bees are people, motion is how much Waggle does on its own. Free waits for your
// OK, Solo works alone, Team works together, Business is the whole dance.

/** A bee flying `path` (in its box's own pixels), wings fluttering. */
function Flyer({
  path,
  seconds,
  delay = 0,
  w = 22,
}: {
  path: string;
  seconds: number;
  delay?: number;
  w?: number;
}) {
  const h = Math.round((w * 16) / 24);
  return (
    <span
      className="bee-fly"
      style={{
        width: w,
        height: h,
        margin: `-${h / 2}px 0 0 -${w / 2}px`,
        offsetPath: `path("${path}")`,
        animationDuration: `${seconds}s`,
        animationDelay: `-${delay}s`,
      }}
    >
      <svg width={w} height={h} viewBox="0 0 24 16">
        <BeeBody />
      </svg>
    </span>
  );
}

/** Comb cells that fill with honey in turn, round and round. */
function FillingCells({
  cells,
  r,
  seconds,
}: {
  cells: [number, number][];
  r: number;
  seconds: number;
}) {
  return (
    <>
      {cells.map(([x, y], i) => (
        <polygon
          key={i}
          points={hexPoints(x, y, r)}
          fill="var(--surface)"
          stroke={INK}
          strokeWidth="1.3"
          strokeLinejoin="round"
          className="bee-cell-fill"
          style={{
            animationDuration: `${seconds}s`,
            animationDelay: `-${((seconds * i) / cells.length).toFixed(2)}s`,
          }}
        />
      ))}
    </>
  );
}

const trail = {
  fill: "none",
  stroke: HONEY,
  strokeWidth: 2.5,
  strokeDasharray: "1.5 5",
  strokeLinecap: "round",
} as const;

const SOLO_LOOP =
  "M30,40 C30,10 80,10 80,40 C80,70 130,70 130,40 C130,10 80,10 80,40 C80,70 30,70 30,40Z";
const TEAM_LOOPS = [
  "M40,32 C40,8 75,8 75,32 C75,56 40,56 40,32Z",
  "M70,40 C70,16 110,16 110,40 C110,64 70,64 70,40Z",
  "M30,46 C30,70 90,74 90,46 C90,22 30,22 30,46Z",
];
const BUSINESS_EIGHT =
  "M120,40 C135,14 196,12 196,40 C196,68 135,66 120,40 C105,14 44,12 44,40 C44,68 105,66 120,40Z";

/** Each plan's bees. `business` is the plan shown as Team, `team` the one shown as Business. */
export function PlanBees({
  plan,
  className,
}: {
  plan: "free" | "solo" | "business" | "team";
  className?: string;
}) {
  // Free, "waits for your OK": one bee holds a drop of honey by one empty cell; a check glows.
  if (plan === "free") {
    return (
      <span aria-hidden className={cn("relative block h-[80px] w-[110px] shrink-0", className)}>
        <svg width="110" height="80" viewBox="0 0 110 80" className="absolute inset-0">
          <polygon
            points={hexPoints(30, 48, 18)}
            fill="var(--surface)"
            stroke={INK}
            strokeWidth="1.3"
            strokeDasharray="3 3"
          />
          <path
            d="M22 48l6 6 11-12"
            fill="none"
            stroke={HONEY}
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="bee-ok"
          />
        </svg>
        <span className="bee-wait absolute top-5 left-[58px] block h-10 w-10">
          <Bee w={34} style={{ left: 0, top: 0, transform: "scaleX(-1)" }} />
          <svg width="12" height="14" viewBox="0 0 12 14" className="absolute top-6 left-2">
            <path
              d="M6 1C6 1 1 7 1 9.5a5 5 0 0 0 10 0C11 7 6 1 6 1z"
              fill={HONEY}
              stroke={INK}
              strokeWidth="1.2"
            />
          </svg>
        </span>
      </span>
    );
  }
  // Solo, "works on its own": one bee loops over 3 cells (3 accounts), filling each.
  if (plan === "solo") {
    return (
      <span aria-hidden className={cn("relative block h-[80px] w-[160px] shrink-0", className)}>
        <svg width="160" height="80" viewBox="0 0 160 80" className="absolute inset-0">
          <path d={SOLO_LOOP} {...trail} />
          <FillingCells
            cells={[
              [30, 40],
              [80, 40],
              [130, 40],
            ]}
            r={11}
            seconds={3.4}
          />
        </svg>
        <Flyer path={SOLO_LOOP} seconds={3.4} w={26} />
      </span>
    );
  }
  // Team, "a team at work": 6 cells as a small comb, 3 bees each on their own loop.
  if (plan === "business") {
    const r = 10;
    const dx = r * 1.732;
    const cells: [number, number][] = [
      ...[0, 1, 2].map((i): [number, number] => [50 + i * dx, 30]),
      ...[0, 1, 2].map((i): [number, number] => [50 - dx / 2 + i * dx, 45]),
    ];
    return (
      <span aria-hidden className={cn("relative block h-[80px] w-[160px] shrink-0", className)}>
        <svg width="160" height="80" viewBox="0 0 160 80" className="absolute inset-0">
          {TEAM_LOOPS.map((d) => (
            <path key={d} d={d} {...trail} strokeWidth={2} opacity={0.7} />
          ))}
          <FillingCells cells={cells} r={r} seconds={3.6} />
        </svg>
        <Flyer path={TEAM_LOOPS[0]} seconds={3} />
        <Flyer path={TEAM_LOOPS[1]} seconds={3.4} delay={1.2} />
        <Flyer path={TEAM_LOOPS[2]} seconds={3.8} delay={2.4} />
      </span>
    );
  }
  // Business, "the whole hive": a full comb of 10 cells in the waggle dance, 5 bees on the 8.
  const r = 8;
  const dx = r * 1.732;
  const cells: [number, number][] = [
    ...[0, 1, 2, 3, 4].map((i): [number, number] => [120 - 2 * dx + i * dx, 33]),
    ...[0, 1, 2, 3].map((i): [number, number] => [120 - 1.5 * dx + i * dx, 45]),
    [120, 21],
  ];
  return (
    <span aria-hidden className={cn("relative block h-[80px] w-[240px] shrink-0", className)}>
      <svg width="240" height="80" viewBox="0 0 240 80" className="absolute inset-0">
        <path d={BUSINESS_EIGHT} {...trail} />
        <FillingCells cells={cells} r={r} seconds={2.5} />
      </svg>
      {[0, 1, 2, 3, 4].map((i) => (
        <Flyer key={i} path={BUSINESS_EIGHT} seconds={5} delay={i} w={20} />
      ))}
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
