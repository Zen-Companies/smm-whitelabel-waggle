import { LogOut } from "lucide-react";
import Link from "next/link";
import { BeeStatus } from "@/components/app/bee";
import { Brand } from "@/components/app/brand";
import { TopNav } from "@/components/app/top-nav";
import { isOperator } from "@/features/billing";
import { createServerSupabase, getCurrentUser } from "@/lib/supabase/server";
import { signOut } from "./actions";
import { getCurrentTenant } from "./current-tenant";

/**
 * The top bar (docs/design.md §4): wordmark, nav, then the flying bee with the business name, the
 * bell and sign out. On phones the nav drops to its own scrolling row.
 */
export async function AppHeader({ bell }: { bell?: React.ReactNode }) {
  const [tenant, user] = await Promise.all([getCurrentTenant(), getCurrentUser()]);
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
          <TopNav showAdmin={isOperator(user)} inboxCount={count ?? 0} />
        </div>
        <div className="ml-auto flex min-h-14 items-center gap-2">
          <span className="text-ink-2 hidden items-center gap-2 text-sm lg:inline-flex">
            <BeeStatus />
            <span className="max-w-48 truncate" title={tenant.name}>
              {tenant.name}
            </span>
          </span>
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
