import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "cn";
import { SETUP_STEPS, type SetupScreen } from "./flow";
import { ScreenButton } from "./screen-pager";

// The frame every setup screen sits in (Walter's flow, paged; board approved 20 Nov): the 3 steps
// on top, "What you missed · 2 of 3" under them, Need help? and Finish later as the way out, the
// screen, and a bottom bar (← Back, dots, the next button) that sticks to the bottom on a phone.
// The screen fills the window; a long list pages inside it instead of growing the page.

export function SetupStepper({
  current,
  done,
}: {
  current: 1 | 2 | 3 | null;
  done: readonly boolean[];
}) {
  return (
    <ol
      className="flex flex-wrap items-center gap-x-2.5 gap-y-2 text-[13px]"
      aria-label="Setup steps"
    >
      {SETUP_STEPS.map((label, i) => {
        const n = (i + 1) as 1 | 2 | 3;
        const isCurrent = current === n;
        const isDone = !isCurrent && done[i];
        return (
          <li key={label} className="flex items-center gap-2.5">
            {i > 0 && (
              <span aria-hidden className="text-line-strong">
                —
              </span>
            )}
            <span
              aria-current={isCurrent ? "step" : undefined}
              className={cn(
                "flex items-center gap-1.5",
                isCurrent ? "text-ink font-semibold" : "text-ink-3",
              )}
            >
              <span
                className={cn(
                  "inline-flex size-5 items-center justify-center rounded-full text-[11px] font-bold",
                  isDone
                    ? "bg-ink text-surface"
                    : isCurrent
                      ? "bg-honey text-[#17140F]"
                      : "border-line-strong border",
                )}
              >
                {isDone ? <Check className="size-3" strokeWidth={2.6} aria-hidden /> : n}
              </span>
              {label}
              {isDone && <span className="sr-only"> (done)</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** The step's dots: the current one long, the ones before it honey. */
export function Dots({ index, count }: { index: number; count: number }) {
  if (count < 2) return <span />;
  return (
    <span className="inline-flex items-center gap-[5px]" aria-label={`Screen ${index} of ${count}`}>
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          aria-hidden
          className={cn(
            "h-[7px] rounded-full",
            i + 1 === index ? "w-[18px]" : "w-[7px]",
            i + 1 <= index ? "bg-honey" : "bg-line",
          )}
        />
      ))}
    </span>
  );
}

export { ScreenButton } from "./screen-pager";

export const PRIMARY =
  "bg-honey hover:bg-honey-hover inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold text-[#17140F] disabled:opacity-60";
export const QUIET =
  "text-ink-2 hover:text-ink inline-flex min-h-11 cursor-pointer items-center px-1 text-sm font-medium";

/**
 * The bottom bar: ← Back (none on a step's first screen), the dots, an extra action ("Not now")
 * and the primary button. Sticks to the bottom of the window.
 */
export function ScreenFooter({
  back,
  index,
  count,
  extra,
  primary,
}: {
  back: SetupScreen | null;
  index: number;
  count: number;
  extra?: ReactNode;
  primary: ReactNode;
}) {
  return (
    <div className="border-line bg-page sticky bottom-0 z-10 -mx-4 mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))]">
      {back ? (
        <ScreenButton to={back} className={QUIET}>
          ← Back
        </ScreenButton>
      ) : (
        <span />
      )}
      <Dots index={index} count={count} />
      <span className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
        {extra}
        {primary}
      </span>
    </div>
  );
}

/** A screen's title and its one line. */
export function ScreenTitle({ title, sub }: { title: string; sub?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <h1 className="font-display text-[22px] leading-tight font-semibold md:text-[26px]">
        {title}
      </h1>
      {sub && <p className="text-ink-2 text-[14px]">{sub}</p>}
    </div>
  );
}

/** One number on step 2 (reading counters, the 30-day tiles): one style everywhere; red is lost. */
export function Tile({
  value,
  label,
  note,
  tone = "lost",
}: {
  value: string;
  label: string;
  /** Under the label while the number can still change: "still counting…". */
  note?: string | null;
  tone?: "lost" | "plain";
}) {
  return (
    <div className="card flex min-w-0 flex-1 flex-col gap-0.5 px-3 py-2.5">
      <b
        className={cn(
          "font-display text-[24px] leading-none font-semibold tabular-nums",
          tone === "lost" && "text-danger",
        )}
      >
        {value}
      </b>
      <span className="text-ink-2 text-[12.5px] leading-snug">{label}</span>
      {note && <span className="text-ink-3 text-[11.5px] italic">{note}</span>}
    </div>
  );
}
