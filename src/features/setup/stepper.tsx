import { Check } from "lucide-react";
import { cn } from "cn";
import { readySteps, type ReadyStep } from "./checklist";
import type { SetupStepNumber } from "./starter";

/**
 * The five "Get Waggle ready" steps in a row. In setup the current one is honey and done ones are
 * ticked; on /welcome (step 0, "Before you start") none is current yet.
 */
export function Stepper({ step, steps }: { step: SetupStepNumber | 0; steps: ReadyStep[] }) {
  return (
    <ol className="flex flex-wrap gap-x-4 gap-y-2 text-sm" aria-label="Setup steps">
      {steps.map((s) => {
        // Ticked by what's really done, so a skipped step stays open.
        const done = s.done && step !== s.n;
        const current = step === s.n;
        return (
          <li
            key={s.n}
            aria-current={current ? "step" : undefined}
            className={cn(
              "flex items-center gap-2",
              current ? "text-ink font-semibold" : "text-ink-3",
            )}
          >
            <span
              className={cn(
                "inline-flex size-6 items-center justify-center rounded-full text-xs font-semibold",
                done
                  ? "bg-ink text-surface"
                  : current
                    ? "bg-honey text-ink"
                    : "border-line-strong border",
              )}
            >
              {done ? <Check className="size-3.5" strokeWidth={2.4} aria-hidden /> : s.n}
            </span>
            {s.label}
          </li>
        );
      })}
    </ol>
  );
}

/** /welcome, before the brand exists: the five steps, none started. */
export function StepsAhead() {
  const steps = readySteps({
    hasProfile: false,
    accounts: 0,
    answers: 0,
    tries: 0,
    repliesChosen: false,
  });
  return <Stepper step={0} steps={steps} />;
}
