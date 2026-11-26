import Link from "next/link";
import { BottomTabs } from "@/components/app/bottom-tabs";
import { Brand } from "@/components/app/brand";
import { TopNav } from "@/components/app/top-nav";
import { can, listMyOrgs } from "@/features/orgs";
import { firstStaffPage, staffAccess } from "@/features/staff";
import { createServerSupabase, getCurrentUser } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import { signOut } from "./actions";
import { BusinessMenu } from "./business-menu";
import { listBrands } from "./brands";
import { getCurrentTenant } from "./current-tenant";

/**
 * The top bar (docs/design.md §4): wordmark, the tabs, then the bell and the account button with
 * the open business's initials and name, whose menu also switches business and organization
 * (the redesign's header; the separate switcher by the wordmark is gone). On phones the tabs move
 * to the bottom bar. `needsYouStatuses` is the inbox's For you list, for each brand's count.
 */
export async function AppHeader({
  bell,
  plan,
  planMenu,
  needsYouStatuses,
}: {
  bell?: React.ReactNode;
  /** Your plan chip, left of the account button (approved 18 Nov). */
  plan?: React.ReactNode;
  /** Your plan on top of the account menu. */
  planMenu?: React.ReactNode;
  needsYouStatuses: readonly string[];
}) {
  const [tenant, user, brands, orgs] = await Promise.all([
    getCurrentTenant(),
    getCurrentUser(),
    listBrands(needsYouStatuses),
    listMyOrgs(),
  ]);
  const staff = await staffAccess(getServiceClient(), user.id);
  const fullName =
    typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name.trim() : "";
  const supabase = await createServerSupabase();
  // Inbox by sender (26 Nov): the Inbox count is people (rows), not messages, as on the page.
  const { data: count } = await supabase.rpc("inbox_conversation_count", {
    p_tenant_id: tenant.id,
    p_statuses: [...needsYouStatuses],
  });

  return (
    <header className="border-line bg-surface sticky top-0 z-40 border-b">
      <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-x-3 px-4 md:flex-nowrap md:gap-x-6 md:px-8">
        <Link href="/today" className="flex min-h-14 items-center gap-2" aria-label="Waggle, Today">
          <Brand />
        </Link>
        <div className="hidden min-w-0 flex-1 md:block">
          <TopNav inboxCount={count ?? 0} />
        </div>
        <div className="ml-auto flex min-h-14 items-center gap-1.5 md:gap-2">
          {bell}
          {plan}
          <BusinessMenu
            planRow={planMenu}
            signedInAs={fullName || user.email || ""}
            orgs={orgs}
            brands={brands}
            currentId={tenant.id}
            currentOrgId={tenant.organizationId}
            canAddBrand={orgs.some(
              (o) => o.id === tenant.organizationId && can(o.role, "brands.add"),
            )}
            staffHref={firstStaffPage(staff.permissions)}
            signOut={signOut}
          />
        </div>
      </div>
      <BottomTabs inboxCount={count ?? 0} />
    </header>
  );
}
