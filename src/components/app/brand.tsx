import { cn } from "cn";

/**
 * The Waggle mark, as on gowaggle.ai (18 Nov): the waggle dance, a honey figure-8. Drawn inline
 * so it takes the tokens; public/brand/ and the app icons are the same shape.
 */
export function Mark({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="-140 -110 280 190"
      aria-hidden
      className={cn("shrink-0", className)}
    >
      <path
        d="M0,0 C30,-45 112,-58 112,0 C112,58 30,45 0,0 C-30,-45 -112,-58 -112,0 C-112,58 -30,45 0,0Z"
        fill="none"
        stroke="var(--honey)"
        strokeWidth="26"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * The wordmark (design.md §2): `waggle.` in Outfit 700, lowercase, the full stop in honey.
 * 24px in the top bar.
 */
export function Brand() {
  return (
    <span className="wordmark text-2xl">
      waggle<span className="text-honey">.</span>
    </span>
  );
}
