import { TimeZoneCookie } from "@/components/app/time-zone-cookie";

import { headers } from "next/headers";

import { redirect } from "next/navigation";

import { Suspense } from "react";

import { AccountBanner, ConnectResult, FirstConnectTag } from "@/features/accounts";

import { Bell } from "@/features/alerts";

import { FirstReplyTag, NEEDS_OWNER } from "@/features/approvals";

import { PlanChip, PlanMenuRow } from "@/features/billing";

import { touchActivity } from "@/features/crm";

import { Feedback } from "@/features/feedback";

import { can, listMyOrgs } from "@/features/orgs";

import { SetupGateWatch, setupGateFor } from "@/features/setup";

import { AppHeader, getCurrentTenant } from "@/features/tenants";

import { PATH_HEADER } from "@/lib/routes";

import { getServiceClient } from "@/lib/supabase/service";

/** The top bar with Your plan beside the account button (approved 18 Nov). */

async function Header() {
  const [tenant, orgs] = await Promise.all([getCurrentTenant(), listMyOrgs()]);

  const org = orgs.find((o) => o.id === tenant.organizationId);

  // CRM "last active" (inactive / app_active emails): never blocks the page.

  await touchActivity(getServiceClient(), tenant.userId).catch(() => undefined);

  const viewer = { orgId: tenant.organizationId, isOwner: !!org && can(org.role, "billing.view") };

  return (
    <AppHeader
      bell={<Bell />}

      plan={<PlanChip {...viewer} />}

      planMenu={<PlanMenuRow {...viewer} />}

      needsYouStatuses={NEEDS_OWNER}
    />
  );
}

/**
 * The ads' ConnectAccount event, once, after the organization's first connect (19 Nov), and
 * FirstReplyApproved after its first approved reply (20 Nov).
 */
async function ConnectTag() {
  const [tenant, orgs] = await Promise.all([getCurrentTenant(), listMyOrgs()]);
  const org = orgs.find((o) => o.id === tenant.organizationId);
  const isOwner = org?.role === "owner";
  return (
    <>
      <FirstConnectTag orgId={tenant.organizationId} isOwner={isOwner} />
      {/* FirstReplyApproved (20 Nov): once, on the page after the first approved reply. */}
      <FirstReplyTag orgId={tenant.organizationId} isOwner={isOwner} />
    </>
  );
}

/**
 * Setup first, then free (approved 20 Nov): a brand owner whose setup isn't passed goes to setup
 * from every app page (not Your plan, account settings or staff pages). Shows nothing otherwise.
 */
async function SetupGate() {
  const [tenant, orgs, h] = await Promise.all([getCurrentTenant(), listMyOrgs(), headers()]);
  const org = orgs.find((o) => o.id === tenant.organizationId);
  const gate = await setupGateFor({
    tenantId: tenant.id,
    userId: tenant.userId,
    role: org?.role ?? null,
    path: h.get(PATH_HEADER) ?? "",
  });
  if (gate.decision !== "open") redirect(gate.decision.redirect);
  return gate.watch ? <SetupGateWatch /> : null;
}

async function DashboardFeedback() {
  const tenant = await getCurrentTenant();

  return <Feedback orgId={tenant.organizationId} tenantId={tenant.id} />;
}

// App shell (docs/design.md §8): the top bar, then content centered up to ~1240px with 32px

// gutters (16 on phones). Each page sets its own width inside.

export default function DashboardLayout({ children }: LayoutProps<"/">) {
  return (
    // Phones: room under the content for the bottom tabs.

    // A page marked data-fit-screen (the Inbox) fills exactly the screen on desktop and never

    // scrolls; its own areas scroll instead.

    <div className="flex min-h-dvh flex-col pb-16 md:pb-0 lg:has-[[data-fit-screen]]:h-dvh">
      <Suspense fallback={<div className="border-line h-14 border-b" />}>
        <Header />
      </Suspense>

      <Suspense fallback={null}>
        <div className="mx-auto w-full max-w-[1240px] px-4 pt-4 empty:hidden md:px-8 md:pt-6">
          <AccountBanner />
        </div>
      </Suspense>

      {/* What happened to a connect started on this page, said here (20 Nov). */}
      <Suspense fallback={null}>
        <div className="mx-auto w-full max-w-[1240px] px-4 pt-4 empty:hidden md:px-8 md:pt-6">
          <ConnectResult />
        </div>
      </Suspense>

      {children}

      <TimeZoneCookie />

      <Suspense fallback={null}>
        <DashboardFeedback />
      </Suspense>

      <Suspense fallback={null}>
        <ConnectTag />
      </Suspense>

      <Suspense fallback={null}>
        <SetupGate />
      </Suspense>
    </div>
  );
}
