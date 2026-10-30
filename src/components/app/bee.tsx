import { cn } from "cn";

// The bee and its moments (docs/design.md §6). One bee everywhere: black outline, honey body,
// white wing, dotted trail. Animations live in globals.css and stop with reduced motion.

const INK = "var(--ink)";
const HONEY = "var(--honey)";

/** The figure-8 in a 240×120 box (the waggle dance). */
const FIGURE_8 =
  "M120,60 C138,30 204,24 204,60 C204,96 138,90 120,60 C102,30 36,24 36,60 C36,96 102,90 120,60Z";
/** A lost, wandering flight for the 404. */
const WANDER = "M30,96 C70,20 100,120 130,60 S200,14 214,80 S160,124 120,102 S50,50 30,96Z";

/** The bee itself, 24×16, facing right. `flutter` animates the wing. */
function BeeBody({ flutter = true }: { flutter?: boolean }) {
  return (
    <>
      <g className={flutter ? "bee-wing" : undefined}>
        <ellipse cx="10" cy="4" rx="5" ry="4" fill="#fff" stroke={INK} strokeWidth="1.2" />
      </g>
      <ellipse cx="11" cy="10" rx="8" ry="5" fill={HONEY} stroke={INK} strokeWidth="1.2" />
      <path d="M9 5.5v9M13 5.5v9" stroke={INK} strokeWidth="1.6" />
      <circle cx="20" cy="10" r="3" fill={INK} />
    </>
  );
}

/** A bee that flies along `path` inside a 240×120 box. */
function Flight({ path, seconds }: { path: string; seconds: number }) {
  return (
    <span
      aria-hidden
      className="bee-fly"
      style={{
        width: 24,
        height: 16,
        margin: "-8px 0 0 -12px",
        offsetPath: `path("${path}")`,
        animationDuration: `${seconds}s`,
      }}
    >
      <svg width="24" height="16" viewBox="0 0 24 16">
        <BeeBody />
      </svg>
    </span>
  );
}

const box = "relative h-[120px] w-[240px] shrink-0";

/** Loading: the bee flies the figure-8 while the trail draws in honey. */
export function BeeLoading({ className }: { className?: string }) {
  return (
    <span className={cn(box, className)} aria-hidden>
      <svg width="240" height="120" viewBox="0 0 240 120" className="absolute inset-0">
        <path
          d={FIGURE_8}
          fill="none"
          stroke="var(--line)"
          strokeWidth="2"
          strokeDasharray="2 5"
          strokeLinecap="round"
        />
        <path
          d={FIGURE_8}
          pathLength={100}
          fill="none"
          stroke={HONEY}
          strokeWidth="2"
          strokeLinecap="round"
          className="bee-draw"
        />
      </svg>
      <Flight path={FIGURE_8} seconds={4} />
    </span>
  );
}

/** 404: the bee loses the figure-8 and wanders, ending at a "?". */
export function BeeLost({ className }: { className?: string }) {
  return (
    <span className={cn(box, className)} aria-hidden>
      <svg width="240" height="120" viewBox="0 0 240 120" className="absolute inset-0">
        <path
          d={WANDER}
          fill="none"
          stroke="var(--line)"
          strokeWidth="2"
          strokeDasharray="2 5"
          strokeLinecap="round"
        />
        <text x="222" y="40" fontSize="22" fontWeight="600" fill="var(--line-strong)">
          ?
        </text>
      </svg>
      <Flight path={WANDER} seconds={6} />
    </span>
  );
}

/** Something went wrong: the bee rests on a closed honeycomb cell, breathing slowly. */
export function BeeResting({ className }: { className?: string }) {
  return (
    <svg
      width="240"
      height="120"
      viewBox="0 0 240 120"
      aria-hidden
      className={cn("shrink-0", className)}
    >
      <g transform="translate(60 14)">
        <path
          d="M60,30 L92,48 L92,84 L60,102 L28,84 L28,48Z"
          fill="var(--subtle)"
          stroke={INK}
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path
          d="M44,66 L76,66"
          stroke="var(--line-strong)"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <g className="bee-rest">
          <g transform="translate(48 10)">
            <BeeBody flutter={false} />
          </g>
        </g>
      </g>
    </svg>
  );
}

/** All caught up: the bee hovers beside a flower, wings fluttering. */
export function BeeCaughtUp({ className }: { className?: string }) {
  const petal = { r: 9, fill: "#fff", stroke: INK, strokeWidth: 1.5 };
  return (
    <svg
      width="240"
      height="120"
      viewBox="0 0 240 120"
      aria-hidden
      className={cn("shrink-0", className)}
    >
      <g transform="translate(20 8)">
        <path
          d="M18,52 C30,30 46,62 62,44 S84,30 92,40"
          fill="none"
          stroke="var(--line-strong)"
          strokeWidth="1.5"
          strokeDasharray="2 5"
          strokeLinecap="round"
        />
        <path d="M140,112 L140,66" stroke={INK} strokeWidth="1.5" strokeLinecap="round" />
        <path
          d="M140,94 C150,92 156,84 156,78 C148,78 142,84 140,94Z"
          fill="#fff"
          stroke={INK}
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <circle cx="140" cy="40" {...petal} />
        <circle cx="156" cy="52" {...petal} />
        <circle cx="124" cy="52" {...petal} />
        <circle cx="150" cy="68" {...petal} />
        <circle cx="130" cy="68" {...petal} />
        <circle cx="140" cy="56" r="8" fill={HONEY} stroke={INK} strokeWidth="1.5" />
        <g className="bee-bob">
          <g transform="translate(92 26)">
            <BeeBody />
          </g>
        </g>
      </g>
    </svg>
  );
}

/** The mini loop inside the Send button while it sends (28×14, ink on honey). */
export function BeeSending() {
  const loop = "M14,7 C17,1 26,0 26,7 C26,14 17,13 14,7 C11,1 2,0 2,7 C2,14 11,13 14,7Z";
  return (
    <span aria-hidden className="relative inline-block h-[14px] w-[28px] shrink-0">
      <svg width="28" height="14" viewBox="0 0 28 14" className="absolute inset-0">
        <path
          d={loop}
          fill="none"
          stroke={INK}
          strokeOpacity=".35"
          strokeWidth="1.2"
          strokeDasharray="1.5 2.5"
        />
      </svg>
      <span
        className="bee-fly bg-ink rounded-full"
        style={{
          width: 7,
          height: 5,
          margin: "-2.5px 0 0 -3.5px",
          offsetPath: `path("${loop}")`,
          animationDuration: "1.6s",
        }}
      />
    </span>
  );
}

/** The small bee in the top bar: a slow figure-8 loop while Waggle is on. */
export function BeeStatus() {
  const loop = "M28,9 C33,1 48,-1 48,9 C48,19 33,17 28,9 C23,1 8,-1 8,9 C8,19 23,17 28,9Z";
  return (
    <span aria-hidden className="relative inline-block h-[18px] w-[56px] shrink-0">
      <svg width="56" height="18" viewBox="0 0 56 18" className="absolute inset-0">
        <path d={loop} fill="none" stroke="var(--line)" strokeWidth="1.5" strokeDasharray="2 3" />
      </svg>
      <span
        className="bee-fly bg-honey rounded-full"
        style={{
          width: 7,
          height: 5,
          margin: "-2.5px 0 0 -3.5px",
          boxShadow: "inset -2px 0 0 var(--ink)",
          offsetPath: `path("${loop}")`,
          animationDuration: "5s",
        }}
      />
    </span>
  );
}

export type BeeScene = "loading" | "lost" | "resting" | "caught-up";

const SCENES: Record<BeeScene, (p: { className?: string }) => React.ReactElement> = {
  loading: BeeLoading,
  lost: BeeLost,
  resting: BeeResting,
  "caught-up": BeeCaughtUp,
};

/** One of the four scenes by name. */
export function Bee({ scene, className }: { scene: BeeScene; className?: string }) {
  const Scene = SCENES[scene];
  return <Scene className={className} />;
}
