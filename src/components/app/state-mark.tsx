import { cn } from "cn";

// States as honeycomb cells (design.md §4 "Beyond text", rule 3, option B approved 16 Nov): the
// word stays plain; a small hexagon beside it carries the meaning, so it reads without colour.
//   working: full honey · waiting: half honey · needs: red outline with a bar
//   off: empty outline · soon: dashed outline

export type State = "working" | "waiting" | "needs" | "off" | "soon";

const HEX = "M7 1 13 4.5v7L7 15 1 11.5v-7Z";

export function StateMark({ state, size = 12 }: { state: State; size?: number }) {
  const h = Math.round((size * 16) / 14);
  return (
    <svg width={size} height={h} viewBox="0 0 14 16" aria-hidden className="shrink-0">
      {state === "working" && (
        <path d={HEX} fill="var(--honey)" stroke="var(--ink)" strokeWidth="1.2" />
      )}
      {state === "waiting" && (
        <>
          <path d={HEX} fill="none" stroke="var(--ink)" strokeWidth="1.2" />
          <path d="M1.6 8.6h10.8v2.8L7 14.4 1.6 11.4Z" fill="var(--honey)" />
        </>
      )}
      {state === "needs" && (
        <>
          <path d={HEX} fill="none" stroke="var(--danger)" strokeWidth="1.4" />
          <path
            d="M7 5v4.5M7 11.3v.2"
            stroke="var(--danger)"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </>
      )}
      {state === "off" && <path d={HEX} fill="none" stroke="var(--ink-3)" strokeWidth="1.2" />}
      {state === "soon" && (
        <path d={HEX} fill="none" stroke="var(--ink-3)" strokeWidth="1.4" strokeDasharray="2 2" />
      )}
    </svg>
  );
}

/** The mark with its word ("Working", "Coming soon"). Needs-you words are red; the rest plain. */
export function StateLabel({
  state,
  children,
  className,
}: {
  state: State;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-sm whitespace-nowrap",
        state === "needs"
          ? "text-danger"
          : state === "off" || state === "soon"
            ? "text-ink-3"
            : "text-ink",
        className,
      )}
    >
      <StateMark state={state} />
      {children}
    </span>
  );
}
