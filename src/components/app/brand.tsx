import { cn } from "cn";

/**
 * The Waggle mark (docs/design.md §2): the waggle itself, a honey wave that starts high, dips
 * twice and rises into the bee, an ink dot at its head. Reads as a W. Drawn inline so it takes
 * the tokens; the files in public/brand/ are the same shape for use outside the app.
 */
export function Mark({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      aria-hidden
      className={cn("shrink-0", className)}
    >
      <path
        d="M5 16 C9 16 11 35 15 35 S21 16 25 16 S31 35 35 35 S39 17 41 16"
        fill="none"
        stroke="var(--honey)"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <circle cx="42.5" cy="13.5" r="5" fill="var(--ink)" />
    </svg>
  );
}

/**
 * The lockup: the mark, then `waggle` as text, lowercase, Inter 700. The honey lives in the
 * mark now, so the wordmark has no full stop. In the top bar: 22px mark, 19px wordmark.
 */
export function Brand() {
  return (
    <span className="inline-flex items-center gap-2">
      <Mark />
      <span className="wordmark text-[19px]">waggle</span>
    </span>
  );
}
