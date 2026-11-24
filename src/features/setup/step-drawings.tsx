import type { ReactNode } from "react";
import { cn } from "cn";
import type { DrawnStep } from "./connect-help";

// Connect fix 2 (board approved 24 Nov): steps drawn as small phones, the spot to tap ringed in
// honey, a numbered honey hexagon on each. Drawings only (aria-hidden); the line under each phone
// says the step in words for screen readers and everyone else.

/** The honey ring around the spot to tap. */
const RING = "rounded-[4px] shadow-[0_0_0_2px_var(--honey),0_0_0_5px_rgba(246,178,27,.3)]";

function Bar({ w }: { w: string }) {
  return <span className={cn("bg-line block h-1 rounded-sm", w)} />;
}

function NumberHex({ n }: { n: number }) {
  return (
    <svg width="22" height="24" viewBox="0 0 12 12.8" className="absolute -top-0.5 -left-2.5">
      <path
        d="M6 0.6l5 2.9v5.8L6 12.2 1 9.3V3.5z"
        fill="var(--honey)"
        stroke="#17140F"
        strokeWidth=".7"
      />
      <text
        x="6"
        y="8.7"
        textAnchor="middle"
        fontFamily="Inter,sans-serif"
        fontWeight="700"
        fontSize="6"
        fill="#17140F"
      >
        {n}
      </text>
    </svg>
  );
}

function Screen({ step }: { step: DrawnStep }) {
  switch (step.kind) {
    case "bar":
      return (
        <>
          <div className="border-line flex items-center justify-between border-b px-1.5 pt-1.5 pb-1">
            <span>waggle.app</span>
            <span className={cn("px-[3px] py-px text-[9px] font-bold", RING)}>{step.menu}</span>
          </div>
          <div className="flex flex-1 flex-col gap-1.5 px-[7px] py-2">
            <Bar w="w-4/5" />
            <Bar w="w-1/2" />
            <span className="bg-line block flex-1 rounded-[5px] opacity-60" />
          </div>
        </>
      );
    case "sheet":
      return (
        <>
          <div className="bg-line flex-1 opacity-70" />
          <div className="border-line bg-surface flex flex-col gap-[3px] border-t py-1.5">
            <span className="text-ink-3 mx-[5px] px-1 py-[3px]">{step.options[0]}</span>
            <span className={cn("bg-honey-tint mx-[5px] px-1 py-[3px]", RING)}>
              {step.options[1]}
            </span>
          </div>
        </>
      );
    case "tabbar":
      return (
        <>
          <div className="flex flex-1 flex-col gap-1.5 px-[7px] py-2">
            <Bar w="w-4/5" />
            <Bar w="w-1/2" />
            <span className="bg-line block flex-1 rounded-[5px] opacity-60" />
          </div>
          <div className="border-line flex items-center justify-around border-t px-1 py-1.5">
            <span className="bg-line size-[9px] rounded-[3px]" />
            <span className="bg-line size-[9px] rounded-[3px]" />
            <span className="bg-line size-[9px] rounded-[3px]" />
            <span className="bg-line size-[9px] rounded-[3px]" />
            <span className={cn("bg-line-strong size-2.5 !rounded-full", RING)} />
          </div>
        </>
      );
    case "profile":
      return (
        <>
          <div className="border-line flex items-center justify-between border-b px-1.5 pt-1.5 pb-1">
            <span>{step.handle}</span>
            <span className={cn("px-[3px] py-px text-[9px] font-bold", RING)}>{step.menu}</span>
          </div>
          <div className="flex items-center gap-1.5 px-[7px] py-2">
            <span className="bg-line-strong size-5 shrink-0 rounded-full" />
            <div className="flex flex-1 flex-col gap-1">
              <Bar w="w-[90%]" />
              <Bar w="w-3/5" />
            </div>
          </div>
          <div className="flex flex-col gap-1 px-[7px]">
            <Bar w="w-[85%]" />
            <Bar w="w-[70%]" />
          </div>
        </>
      );
    case "list":
      return (
        <>
          <div className="border-line border-b px-1.5 pt-1.5 pb-1">{step.title}</div>
          <div className="flex flex-col gap-[3px] py-1.5">
            <span className="text-ink-3 mx-[5px] px-1 py-[3px]">{step.options[0]}</span>
            <span className={cn("bg-honey-tint mx-[5px] px-1 py-[3px]", RING)}>
              {step.options[1]}
            </span>
          </div>
          {step.chips && (
            <div className="flex gap-[3px] px-1.5">
              <span className="border-line rounded-[4px] border px-[3px] py-0.5">
                {step.chips[0]}
              </span>
              <span className="border-line rounded-[4px] border px-[3px] py-0.5">
                {step.chips[1]}
              </span>
            </div>
          )}
        </>
      );
  }
}

/** One drawn phone with its number and its words underneath. */
export function StepPhone({ step, n }: { step: DrawnStep; n: number }) {
  return (
    <li className="flex min-w-0 flex-1 flex-col items-center gap-2 text-center">
      <div className="relative pt-1.5" aria-hidden>
        <div className="border-ink bg-surface text-ink flex h-[100px] w-[84px] flex-col overflow-hidden rounded-[13px] border-2 text-left text-[7.5px] leading-[1.2] font-semibold">
          <Screen step={step} />
        </div>
        <NumberHex n={n} />
      </div>
      <span className="text-ink text-[12.5px] leading-snug">
        <span className="sr-only">Step {n}: </span>
        {step.label}
      </span>
    </li>
  );
}

/** A row of drawn steps, in order. */
export function StepRow({ steps, label }: { steps: DrawnStep[]; label: string }) {
  return (
    <ol aria-label={label} className="flex justify-between gap-2.5 px-0.5 pt-1 sm:gap-4">
      {steps.map((s, i) => (
        <StepPhone key={i} step={s} n={i + 1} />
      ))}
    </ol>
  );
}

/** A small filled green hexagon: "it's fine" lines (free, progress saved). */
export function OkLine({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("text-ink-2 flex items-center gap-1.5 text-[13px]", className)}>
      <svg width="12" height="13" viewBox="0 0 12 12.8" aria-hidden className="shrink-0">
        <path
          d="M6 0.6l5 2.9v5.8L6 12.2 1 9.3V3.5z"
          fill="var(--success)"
          stroke="var(--success)"
          strokeWidth="1.2"
        />
      </svg>
      <span>{children}</span>
    </p>
  );
}

export const PROGRESS_SAVED = "Your progress is saved. You’ll come right back to this step.";
