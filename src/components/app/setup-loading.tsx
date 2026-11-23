import { cn } from "cn";
import { BeeBody } from "./bee";

const COMB = "M7 1 13 4.5v7L7 15 1 11.5v-7Z";

/**
 * Any setup page that waits over a second (board "Setup, start to finish", approved 23 Nov): the
 * bee bobs over three honeycomb cells that fill one after another. Appears only after 0.3 s
 * (`page-loading`), so fast pages never flash it; reduced motion shows the cells filled and still.
 * Server-safe (CSS only).
 */
export function SetupLoading({ words, className }: { words?: string; className?: string }) {
  return (
    <div
      className={cn(
        "page-loading flex min-h-[320px] w-full flex-col items-center justify-center gap-3 py-16",
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <span className="bee-bob inline-block" aria-hidden>
        <svg width="44" height="30" viewBox="0 0 24 16">
          <BeeBody />
        </svg>
      </span>
      <span className="flex items-center gap-1" aria-hidden>
        {[0, 1, 2].map((i) => (
          <svg key={i} width="16" height="18" viewBox="0 0 14 16">
            <path
              d={COMB}
              fill="var(--surface)"
              stroke="var(--ink)"
              strokeWidth="1.2"
              strokeLinejoin="round"
              className="bee-cell-fill"
              style={{ animationDelay: `${i * 0.5}s` }}
            />
          </svg>
        ))}
      </span>
      <span className={words ? "text-ink-2 text-sm" : "sr-only"}>{words ?? "Loading"}</span>
    </div>
  );
}
