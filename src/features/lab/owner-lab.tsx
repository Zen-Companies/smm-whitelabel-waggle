import { Suspense } from "react";
import { ReadinessCard } from "@/features/approvals";
import { can } from "@/features/orgs";
import { getCurrentTenant, RoleGate } from "@/features/tenants";
import { getServiceClient } from "@/lib/supabase/service";
import { PracticeBox } from "./practice-box";
import { loadPracticePage } from "./practice-data";

// The owner's Lab (/lab, T35, T36; design v2 canvas, row 4): trying on the left and the verdict
// ("Ready to reply on its own?") on the right. Setup progress is the "Get Waggle ready" line above.

export async function OwnerLab() {
  const tenant = await getCurrentTenant();
  const page = await loadPracticePage(getServiceClient(), tenant.id);
  return (
    <div className="flex flex-col gap-5">
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

/**
 * Teach Waggle's "Try it" (T73): the practice box on its own; nothing gets posted. Setup's step 4
 * passes the customers' own top questions as the examples (first connect, approved 20 Nov).
 */
export async function TryIt({
  goal,
  examples,
}: { goal?: { done: number; of: number }; examples?: string[] } = {}) {
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
        examples={examples?.length ? examples.slice(0, 5) : page.examples}
        examplesFromTopics={examples?.length ? true : page.examplesFromTopics}
        examplesLabel={examples?.length ? "What your customers asked" : undefined}
        recentTries={page.recentTries}
        goal={goal}
      />
    </RoleGate>
  );
}
