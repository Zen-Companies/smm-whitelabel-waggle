import { cn } from "cn";

/** The dashed honeycomb cell with a plus (rule 4, option B): something empty, waiting to be filled. */
export function EmptyCell({ size = 40, className }: { size?: number; className?: string }) {
  const h = Math.round((size * 16) / 14);
  return (
    <svg
      width={size}
      height={h}
      viewBox="0 0 14 16"
      aria-hidden
      className={cn("empty-cell shrink-0", className)}
    >
      <path
        className="empty-cell-hex"
        d="M7 1 13 4.5v7L7 15 1 11.5v-7Z"
        strokeWidth=".6"
        strokeDasharray="1 1"
      />
      <path
        className="empty-cell-plus"
        d="M7 5.5v5M4.5 8h5"
        strokeWidth=".8"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * An empty spot inside a card (design.md §4 "Beyond text", rule 4, option B approved 16 Nov):
 * the empty cell, one sentence, and at most one next step (a real button, never an underlined
 * word). Whole pages use the bee instead.
 */
export function EmptySpot({
  children,
  action,
  className,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-center gap-3.5">
        <EmptyCell />
        <p className="text-ink-2 min-w-0 flex-1 text-sm">{children}</p>
      </div>
      {action && <div className="flex flex-wrap gap-2">{action}</div>}
    </div>
  );
}
