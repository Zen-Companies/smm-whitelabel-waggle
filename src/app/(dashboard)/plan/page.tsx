import { LOADING_WORDS, PageLoading } from "@/components/app/page-loading";
import { Suspense } from "react";
import {
  BlackFridayNote,
  isUpgradeReason,
  ReferralCard,
  TrialConversionTag,
  YourPlanSection,
} from "@/features/billing";
import { can, listMyOrgs } from "@/features/orgs";
import { getCurrentTenant } from "@/features/tenants";

export const metadata = { title: "Your plan" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Stripe's return to Your plan: after checkout, or after buying more replies. */
function planNotice(
  params: Record<string, string | string[] | undefined>,
): "done" | "cancelled" | "top_up" | undefined {
  if (params.top_up === "done") return "top_up";
  if (params.checkout === "done") return "done";
  if (params.checkout === "cancelled") return "cancelled";
  return undefined;
}

async function Body({ searchParams }: { searchParams: SearchParams }) {
  const [params, tenant, orgs] = await Promise.all([
    searchParams,
    getCurrentTenant(),
    listMyOrgs(),
  ]);
  const org = orgs.find((o) => o.id === tenant.organizationId);
  if (!org) return null;
  const notice = planNotice(params);
  const isOwner = can(org.role, "billing.view");
  return (
    <>
      {isOwner && <BlackFridayNote orgId={org.id} />}
      <YourPlanSection
        org={{ id: org.id, name: org.name, isOwner: can(org.role, "billing.view") }}
        notice={notice}
        upgrade={isUpgradeReason(params.upgrade) ? params.upgrade : undefined}
      />
      {/* Give a month, get a month (23 Nov): the link right under the plan, one tap to share. */}
      {isOwner && <ReferralCard orgId={org.id} />}
      {notice === "done" && (
        <Suspense fallback={null}>
          <TrialConversionTag
            sessionId={typeof params.session_id === "string" ? params.session_id : undefined}
            orgId={org.id}
          />
        </Suspense>
      )}
    </>
  );
}

/**
 * Your plan on its own page (design "Your plan next to your profile", approved 18 Nov): opened
 * from the chip beside the account button, the account menu, More on a phone, and Settings.
 */
export default function PlanPage(props: { searchParams: SearchParams }) {
  return (
    <main className="mx-auto flex w-full max-w-[1240px] flex-col gap-6 px-4 py-6 md:px-8">
      <Suspense fallback={<PageLoading words={LOADING_WORDS.plan} />}>
        <Body searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}
