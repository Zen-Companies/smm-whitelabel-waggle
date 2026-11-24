import { ActionLink } from "@/components/app/action-link";
import { LOADING_WORDS, PageLoading } from "@/components/app/page-loading";
import { Suspense } from "react";
import { ReferralCard } from "@/features/billing";
import { can, listMyOrgs } from "@/features/orgs";
import { getCurrentTenant } from "@/features/tenants";

export const metadata = { title: "Refer a friend" };

async function Body() {
  const [tenant, orgs] = await Promise.all([getCurrentTenant(), listMyOrgs()]);
  const org = orgs.find((o) => o.id === tenant.organizationId);
  if (!org) return null;
  if (!can(org.role, "billing.view")) {
    return (
      <section className="card flex max-w-[1100px] flex-col gap-2 p-6">
        <h1 className="font-display text-[24px] leading-tight font-semibold">Refer a friend</h1>
        <p className="text-ink-2 m-0">
          Only the organization’s Owner has the referral link. Ask them to share it from this page.
        </p>
      </section>
    );
  }
  return (
    <>
      <ReferralCard orgId={org.id} page />
      <ActionLink href="/plan">Your plan</ActionLink>
    </>
  );
}

/**
 * Give a month, get a month on its own page (Walter's GHL campaign, 24 Nov): the emails' buttons
 * land here, so the Owner can copy their link in one tap. The same card as on Your plan.
 */
export default function ReferPage() {
  return (
    <main className="mx-auto flex w-full max-w-[1240px] flex-col gap-6 px-4 py-6 md:px-8">
      <Suspense fallback={<PageLoading words={LOADING_WORDS.plan} />}>
        <Body />
      </Suspense>
    </main>
  );
}
