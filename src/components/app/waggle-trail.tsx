/**
 * The signature moment (docs/design.md §3): a tiny honey trail traces the figure-8 once, next to
 * the check when a reply is sent. Reduced motion shows it drawn, without the animation.
 */
export function WaggleTrail({ className }: { className?: string }) {
  return (
    <svg viewBox="-140 -70 280 140" width="28" height="14" aria-hidden className={className}>
      <path
        d="M0,0 C30,-45 112,-58 112,0 C112,58 30,45 0,0 C-30,-45 -112,-58 -112,0 C-112,58 -30,45 0,0Z"
        pathLength={100}
        fill="none"
        stroke="currentColor"
        strokeWidth="18"
        strokeLinejoin="round"
        className="text-honey animate-trail"
      />
    </svg>
  );
}
