// Honeycomb cells (design.md §6): honey for what's done, empty cells for what's still to come.
// Plain SVG: it renders on the server and the client.

const HEX = "M7 1 13 4.5v7L7 15 1 11.5v-7Z";

/** Honeycomb cells, `on` of them filled with honey (up to 10 drawn). */
export function Combs({ on, of, size = 16 }: { on: number; of: number; size?: number }) {
  const cells = Math.min(Math.max(of, 0), 10);
  const filled = Math.min(Math.max(on, 0), cells);
  return (
    <span aria-hidden className="inline-flex items-center gap-[3px]">
      {Array.from({ length: cells }, (_, i) => (
        <svg key={i} width={size} height={Math.round((size * 16) / 14)} viewBox="0 0 14 16">
          <path
            d={HEX}
            fill={i < filled ? "var(--honey)" : "var(--surface)"}
            stroke={i < filled ? "var(--ink)" : "var(--line-strong)"}
            strokeWidth="1.1"
            strokeLinejoin="round"
            className="transition-[fill] duration-500"
          />
        </svg>
      ))}
    </span>
  );
}
