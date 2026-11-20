import Link from "next/link";
import type { ReactNode } from "react";
import { HelpButton } from "@/features/feedback";
import { SetupStepper } from "./setup-frame";

// The page frame of a setup screen. Kept apart from setup-frame.tsx, whose parts client screens
// import: the help button comes from the feedback feature, which is server code.

export function SetupFrame({
  step,
  done,
  sublabel,
  children,
  wayOut = true,
}: {
  step: 1 | 2 | 3;
  done: readonly boolean[];
  /** "What you missed · 2 of 3". */
  sublabel: string;
  children: ReactNode;
  /** Need help? · Finish later on the step line. */
  wayOut?: boolean;
}) {
  return (
    <main className="mx-auto flex min-h-[calc(100dvh-57px)] w-full max-w-[640px] flex-col px-4 pt-5 md:pt-8">
      <SetupStepper current={step} done={done} />
      <div className="text-ink-3 mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[12.5px]">
        <span className="tracking-[0.3px]">{sublabel}</span>
        {wayOut && (
          <span className="flex items-center gap-2.5">
            <HelpButton className="hover:text-ink cursor-pointer">Need help?</HelpButton>
            <span aria-hidden>·</span>
            <Link href="/today" className="hover:text-ink no-underline">
              Finish later
            </Link>
          </span>
        )}
      </div>
      <div className="mt-4 flex flex-1 flex-col gap-3.5">{children}</div>
    </main>
  );
}
