import { LogOut } from "lucide-react";
import Link from "next/link";
import { Brand } from "@/components/app/brand";
import { TopNav } from "@/components/app/top-nav";
import { firstStaffPage, staffAccess } from "@/features/staff";
import { createServerSupabase, getCurrentUser } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import { signOut } from "./actions";
import { BrandMenu } from "./brand-menu";
import { listBrands } from "./brands";
import { getCurrentTenant } from "./current-tenant";

/**
 * The top bar (docs/design.md §4): wordmark, nav, then the brand menu (T47), the bell and sign
 * out. On phones the nav drops to its own scrolling row. `needsYouStatuses` is the inbox's For
 * you list, for each brand's count in the menu.
 */
export async function AppHeader({
  bell,
  needsYouStatuses,
}: {
  bell?: React.ReactNode;
  needsYouStatuses: readonly string[];
}) {
  const [tenant, user, brands] = await Promise.all([
    getCurrentTenant(),
    getCurrentUser(),
    listBrands(needsYouStatuses),
  ]);
  const staff = await staffAccess(getServiceClient(), user.id);
  const supabase = await createServerSupabase();
  const { count } = await supabase
    .from("inbound_items")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", tenant.id)
    .eq("status", "awaiting_approval");

  return (
    <header className="border-line bg-page sticky top-0 z-40 border-b">
      <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-x-6 px-4 md:flex-nowrap md:px-8">
        <Link href="/inbox" className="flex min-h-14 items-center" aria-label="Waggle, inbox">
          <Brand />
        </Link>
        <div className="order-last -mb-px w-full md:order-none md:w-auto md:flex-1">
          <TopNav staffHref={firstStaffPage(staff.permissions)} inboxCount={count ?? 0} />
        </div>
        <div className="ml-auto flex min-h-14 items-center gap-2">
          <BrandMenu brands={brands} currentId={tenant.id} />
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
