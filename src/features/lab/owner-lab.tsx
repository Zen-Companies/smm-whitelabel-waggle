import { Check } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { ReadinessCard } from "@/features/approvals";
import { can } from "@/features/orgs";
import { getCurrentTenant, RoleGate } from "@/features/tenants";
import { getServiceClient } from "@/lib/supabase/service";
import { PracticeBox } from "./practice-box";
import { loadPracticePage } from "./practice-data";
import { setupComplete, type SetupStep } from "./setup";

// The owner's Lab (/lab, T35, T36; design v2 canvas, row 4): a first-day checklist until setup
// is done, then trying on the left and the verdict ("Ready to reply on its own?") on the right.

function SetupChecklist({ steps }: { steps: SetupStep[] }) {
  const done = steps.filter((s) => s.done).length;
  return (
    // One line until opened (Teach Waggle, approved 16 Nov): a progress bar and Show steps.
    <details aria-labelledby="setup-heading" className="card group flex flex-col gap-2 px-5 py-3">
      <summary className="flex min-h-10 cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-2 [&::-webkit-details-marker]:hidden">
        <h2 id="setup-heading" className="font-semibold">
          Get Waggle ready
        </h2>
        <span
          className="bg-subtle h-2 min-w-24 flex-1 overflow-hidden rounded-full"
          role="progressbar"
          aria-label="Setup progress"
          aria-valuenow={done}
          aria-valuemin={0}
          aria-valuemax={steps.length}
        >
          <span
            className="bg-honey block h-full"
            style={{ width: `${Math.round((done / steps.length) * 100)}%` }}
          />
        </span>
        <span className="text-sm">
          {done} of {steps.length} done
        </span>
        <span className="action-link with-arrow text-sm group-open:hidden">Show steps</span>
        <span className="action-link hidden text-sm group-open:inline-flex">Hide steps</span>
      </summary>
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
              <span className="border-line-strong text-ink-2 flex size-7 flex-none items-center justify-center rounded-full border text-[13px] font-semibold">
                {i + 1}
              </span>
            )}
            <span className="flex min-w-0 flex-1 flex-col">
              <span className={s.done ? "text-ink-3 font-semibold line-through" : "font-semibold"}>
                {s.title}
              </span>
              <span className="meta">{s.detail}</span>
            </span>
            {s.action && (
              <Link
                href={s.action.href}
                className="text-honey-text text-sm font-medium whitespace-nowrap"
              >
                {s.action.label}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </details>
  );
}

export async function OwnerLab() {
  const tenant = await getCurrentTenant();
  const page = await loadPracticePage(getServiceClient(), tenant.id);
  return (
    <div className="flex flex-col gap-5">
      {!setupComplete(page.setup) && <SetupChecklist steps={page.setup} />}
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
        <RoleGate
          allowed={can(tenant.role, "brand.settings")}
          role={tenant.role}
          what="the practice box"
        >
          <PracticeBox
            triesLeft={page.triesLeft}
            examples={page.examples}
            examplesFromTopics={page.examplesFromTopics}
            recentTries={page.recentTries}
          />
        </RoleGate>
        <Suspense fallback={<div className="skeleton h-72" />}>
          <ReadinessCard />
        </Suspense>
      </div>
    </div>
  );
}

/** Teach Waggle's "Try it" (T73): the practice box on its own; nothing gets posted. */
export async function TryIt() {
  const tenant = await getCurrentTenant();
  const page = await loadPracticePage(getServiceClient(), tenant.id);
  return (
    <RoleGate
      allowed={can(tenant.role, "brand.settings")}
      role={tenant.role}
      what="the practice box"
    >
      <PracticeBox
        triesLeft={page.triesLeft}
        examples={page.examples}
        examplesFromTopics={page.examplesFromTopics}
        recentTries={page.recentTries}
      />
    </RoleGate>
  );
}
