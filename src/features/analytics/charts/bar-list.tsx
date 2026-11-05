import { SERIES_1 } from "./colors";
import { ChartTable } from "./chart-table";

export interface BarRow {
  label: string;
  value: number;
  /** What's printed at the end of the bar: "13.2K", "38%". */
  display: string;
  color?: string;
}

/**
 * Horizontal bars for one measure (reach by platform, what came in, age, cities): label · thin bar
 * with a rounded data end · the value, printed. Honey unless a row names its color.
 */
export function BarList({
  ariaLabel,
  rows,
  columns,
  max,
}: {
  ariaLabel: string;
  rows: BarRow[];
  /** Column names for the table: [label, value]. */
  columns: [string, string];
  /** Scale to this value instead of the largest row (shares: 100). */
  max?: number;
}) {
  const top = max ?? Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="flex flex-col gap-2">
      <div role="img" aria-label={ariaLabel} className="flex flex-col gap-2">
        {rows.map((r) => (
          <div
            key={r.label}
            className="grid grid-cols-[minmax(72px,30%)_1fr_auto] items-center gap-3 text-sm"
            title={`${r.label}: ${r.display}`}
          >
            <span className="text-ink-2 truncate">
              {r.color && (
                <span
                  aria-hidden
                  className="mr-1.5 inline-block size-2 rounded-[2px] align-middle"
                  style={{ background: r.color }}
                />
              )}
              {r.label}
            </span>
            <span className="flex h-3.5 items-center" aria-hidden>
              <span
                className="block h-2.5 rounded-r-[4px]"
                style={{
                  width: `${Math.max(r.value > 0 ? 1 : 0, (r.value / top) * 100)}%`,
                  background: r.color ?? SERIES_1,
                }}
              />
            </span>
            <b className="min-w-12 text-right font-semibold tabular-nums">{r.display}</b>
          </div>
        ))}
      </div>
      <ChartTable
        caption={ariaLabel}
        columns={columns}
        rows={rows.map((r) => [r.label, r.display])}
      />
    </div>
  );
}
