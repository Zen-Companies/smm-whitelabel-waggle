import { LOADING_WORDS, PageLoading } from "@/components/app/page-loading";
import { Suspense } from "react";
import { InboxView, NEEDS_OWNER, RepliesBackLine } from "@/features/approvals";
import { InboxCountdown } from "@/features/billing";
import { can } from "@/features/orgs";
import { getCurrentTenant } from "@/features/tenants";
import { PlanNote } from "../plan-note";

export const metadata = { title: "Inbox" };

// Plain props type: the generated route types need `next typegen`.
type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** The DM countdown above the list (Playbook round 2, 26 Nov). */
async function Countdown() {
  const tenant = await getCurrentTenant();
  return (
    <InboxCountdown
      orgId={tenant.organizationId}
      tenantId={tenant.id}
      canUpgrade={can(tenant.role, "billing.view")}
      needsYou={NEEDS_OWNER}
    />
  );
}

/** After paying when out of replies: `?answering=<count>` (Playbook round 2). */
async function Notice({ searchParams }: Props) {
  const { answering } = await searchParams;
  const count = typeof answering === "string" && /^\d{1,4}$/.test(answering) ? +answering : null;
  return (
    <div className="flex flex-col gap-2">
      {count !== null && <RepliesBackLine count={count} />}
      <Suspense fallback={null}>
        <Countdown />
      </Suspense>
    </div>
  );
}

/** Inbox → For you. */
export default function InboxPage({ searchParams }: Props) {
  return (
    <main
      data-fit-screen
      className="mx-auto flex w-full max-w-[1240px] flex-col gap-5 px-4 py-6 md:px-8 lg:min-h-0 lg:flex-1"
    >
      <Suspense fallback={null}>
        <PlanNote where="inbox" />
      </Suspense>
      <Suspense fallback={<PageLoading words={LOADING_WORDS.inbox} />}>
        <InboxView
          tab="for_you"
          searchParams={searchParams}
          notice={
            <Suspense fallback={null}>
              <Notice searchParams={searchParams} />
            </Suspense>
          }
        />
      </Suspense>
    </main>
  );
}
