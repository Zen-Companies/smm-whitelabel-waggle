// The waggle dance: a figure-8 trail with the bee perched on the top-right loop.
// Follows the brand kit's Logo rules board: three lockups, one bee, colours set by the ground.
export const FIGURE_8 =
  "M0,0 C30,-45 112,-58 112,0 C112,58 30,45 0,0 C-30,-45 -112,-58 -112,0 C-112,58 -30,45 0,0Z";

const STRIPES = "M-6 -12.4 C-8 -4 -8 4 -6 12.4 M3 -12.6 C1 -4 1 4 3 12.6";

// Full ≥ 180px wide (weight 15, one wing), Compact 48–179px (weight 20, no wing), Glyph < 48px (weight 26, no bee).
function lockup(width: number) {
  if (width >= 180) return { stroke: 15, bee: true, wing: true };
  if (width >= 48) return { stroke: 20, bee: true, wing: false };
  return { stroke: 26, bee: false, wing: false };
}

type MarkProps = {
  size?: number;
  bee?: boolean;
  className?: string;
  // Defaults follow the page ground: Hive trail on light, Honey trail on dark. Override for a fixed ground.
  trail?: string;
  head?: string;
};

export function Mark({ size = 28, bee = false, className = "", trail = "var(--mark-trail)", head = "var(--bee-head)" }: MarkProps) {
  const l = lockup(size);
  const showBee = bee && l.bee;
  return (
    <svg width={size} height={(size * 190) / 280} viewBox="-140 -110 280 190" aria-hidden="true" className={className}>
      {l.wing && (
        // the 25% glow: Full lockup, dark grounds only (--mark-glow is 0 on light)
        <path d={FIGURE_8} fill="none" stroke={trail} strokeWidth={l.stroke * 2} strokeLinejoin="round" style={{ strokeOpacity: "var(--mark-glow)" }} />
      )}
      <path d={FIGURE_8} fill="none" stroke={trail} strokeWidth={l.stroke} strokeLinejoin="round" />
      {showBee && (
        <g transform="translate(62,-72) rotate(-8) scale(1.3)">
          {l.wing && <ellipse cx="-4" cy="-13" rx="13" ry="9" fill="var(--bee-wing)" transform="rotate(-25)" />}
          <ellipse cx="0" cy="0" rx="20" ry="13" fill="var(--honey)" />
          <path d={STRIPES} stroke="#17140F" strokeWidth="5" fill="none" />
          <circle cx="19" cy="0" r="8" fill={head} />
        </g>
      )}
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`wordmark ${className}`}>
      waggle<em>.</em>
    </span>
  );
}

export function Logo() {
  return (
    <span className="inline-flex items-center gap-2">
      <Mark size={56} bee className="-mt-2" />
      <Wordmark className="text-[1.45rem]" />
    </span>
  );
}
