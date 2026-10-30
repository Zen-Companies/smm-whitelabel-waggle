import { Check } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { ReadinessCard } from "@/features/approvals";
import { getCurrentTenant } from "@/features/tenants";
import { getServiceClient } from "@/lib/supabase/service";
import { PracticeBox } from "./practice-box";
import { loadPracticePage } from "./practice-data";
import { setupComplete, type SetupStep } from "./setup";

// The owner's Lab (/lab, T35, T36; design v2 canvas, row 4): a first-day checklist until setup
// is done, then trying on the left and the verdict ("Ready to reply on its own?") on the right.

function SetupChecklist({ steps }: { steps: SetupStep[] }) {
  const done = steps.filter((s) => s.done).length;
  return (
    <section aria-labelledby="setup-heading" className="card flex flex-col gap-2 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="setup-heading" className="section-title">
          Get Waggle ready
        </h2>
        <span className="meta">
          {done} of {steps.length} done
        </span>
      </div>
      <ol className="grid gap-x-6 gap-y-1 sm:grid-cols-2 xl:grid-cols-3">
        {steps.map((s, i) => (
          <li key={s.key} className="flex min-h-13 items-center gap-3">
            {s.done ? (
              <span
                className="bg-success-soft text-success flex size-7 flex-none items-center justify-center rounded-full"
                aria-label="Done"
              >
                <Check className="size-4" strokeWidth={2} aria-hidden />
              </span>
            ) : (
              <span className="border-line-strong text-wax-muted flex size-7 flex-none items-center justify-center rounded-full border text-[13px] font-semibold">
                {i + 1}
              </span>
            )}
            <span className="flex min-w-0 flex-1 flex-col">
              <span className={s.done ? "text-pollen font-semibold line-through" : "font-semibold"}>
                {s.title}
              </span>
              <span className="meta">{s.detail}</span>
            </span>
            {s.action && (
              <Link
                href={s.action.href}
                className="text-honey text-sm font-medium whitespace-nowrap"
              >
                {s.action.label}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

export async function OwnerLab() {
  const tenant = await getCurrentTenant();
  const page = await loadPracticePage(getServiceClient(), tenant.id);
  return (
    <div className="flex flex-col gap-5">
      {!setupComplete(page.setup) && <SetupChecklist steps={page.setup} />}
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
        <PracticeBox
          triesLeft={page.triesLeft}
          examples={page.examples}
          examplesFromTopics={page.examplesFromTopics}
          recentTries={page.recentTries}
        />
        <Suspense fallback={<div className="skeleton h-72" />}>
          <ReadinessCard />
        </Suspense>
      </div>
    </div>
  );
}
