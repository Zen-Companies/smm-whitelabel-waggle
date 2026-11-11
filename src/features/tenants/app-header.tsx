import { LogOut } from "lucide-react";
import Link from "next/link";
import { Brand } from "@/components/app/brand";
import { TopNav } from "@/components/app/top-nav";
import { can, listMyOrgs } from "@/features/orgs";
import { firstStaffPage, staffAccess } from "@/features/staff";
import { createServerSupabase, getCurrentUser } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import { signOut } from "./actions";
import { BrandMenu } from "./brand-menu";
import { listBrands } from "./brands";
import { getCurrentTenant } from "./current-tenant";

/**
 * The top bar (docs/design.md §4): wordmark, the Organization / Brand switcher (T54), nav, then
 * the bell and sign out. On phones the nav drops to its own scrolling row. `needsYouStatuses`
 * is the inbox's For you list, for each brand's count in the menu.
 */
export async function AppHeader({
  bell,
  needsYouStatuses,
}: {
  bell?: React.ReactNode;
  needsYouStatuses: readonly string[];
}) {
  const [tenant, user, brands, orgs] = await Promise.all([
    getCurrentTenant(),
    getCurrentUser(),
    listBrands(needsYouStatuses),
    listMyOrgs(),
  ]);
  const db = getServiceClient();
  const [staff, { data: orgBrands }] = await Promise.all([
    staffAccess(db, user.id),
    // Every open brand of the user's organizations, seen or not, for "1 of 2 brands".
    db
      .from("tenants")
      .select("organization_id")
      .in(
        "organization_id",
        orgs.map((o) => o.id),
      )
      .is("offboarded_at", null),
  ]);
  const brandCounts: Record<string, number> = {};
  for (const t of orgBrands ?? []) {
    if (t.organization_id)
      brandCounts[t.organization_id] = (brandCounts[t.organization_id] ?? 0) + 1;
  }
  const supabase = await createServerSupabase();
  const { count } = await supabase
    .from("inbound_items")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", tenant.id)
    .eq("status", "awaiting_approval");

  return (
    <header className="border-line bg-page sticky top-0 z-40 border-b">
      <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-x-6 px-4 md:flex-nowrap md:px-8">
        <Link href="/inbox" className="flex min-h-14 items-center gap-2" aria-label="Waggle, inbox">
          <Brand />
          <span className="bg-honey-tint text-honey-text rounded-full px-2 py-0.5 text-[11px] font-bold tracking-wide">
            BETA
          </span>
        </Link>
        <div className="flex min-h-14 items-center">
          <BrandMenu
            orgs={orgs}
            brands={brands}
            brandCounts={brandCounts}
            currentId={tenant.id}
            currentOrgId={tenant.organizationId}
            canAddBrandIn={orgs.filter((o) => can(o.role, "brands.add")).map((o) => o.id)}
          />
        </div>
        <div className="order-last -mb-px w-full md:order-none md:w-auto md:flex-1">
          <TopNav staffHref={firstStaffPage(staff.permissions)} inboxCount={count ?? 0} />
        </div>
        <div className="ml-auto flex min-h-14 items-center gap-2">
          {bell}
          <form action={signOut}>
            <button
              type="submit"
              aria-label={`Sign out (${user.email})`}
              title={`Sign out (${user.email})`}
              className="text-ink-2 hover:bg-subtle hover:text-ink inline-flex size-10 items-center justify-center rounded-md transition-colors duration-150"
            >
              <LogOut strokeWidth={1.5} className="size-[18px]" aria-hidden />
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
