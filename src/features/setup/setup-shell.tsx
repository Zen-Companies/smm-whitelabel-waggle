import type { ReactNode } from "react";
import { SetupStepper } from "./setup-frame";
import { FinishLater, WayOutProvider } from "./way-out";

// The page frame of a setup screen. Kept apart from setup-frame.tsx, whose parts client screens
// import.

export function SetupFrame({
  step,
  done,
  children,
  wayOut = true,
}: {
  step: 1 | 2 | 3;
  done: readonly boolean[];
  children: ReactNode;
  /** Finish later on the steps' row. */
  wayOut?: boolean;
}) {
  // 21 Nov (board "Step 2 unfolds"): no second line under the steps ("What you missed · 1 of 2",
  // Need help?): the steps and the open part say where you are; help is the Feedback button.
  return (
    <main className="mx-auto flex min-h-[calc(100dvh-57px)] w-full max-w-[640px] flex-col px-4 pt-5 md:pt-8">
      <WayOutProvider>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <SetupStepper current={step} done={done} />
          {wayOut && <FinishLater />}
        </div>
        <div className="mt-4 flex flex-1 flex-col gap-3.5">{children}</div>
      </WayOutProvider>
    </main>
  );
}
