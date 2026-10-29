import { LogOut } from "lucide-react";
import { Brand } from "@/components/app/brand";
import { SidebarNav } from "@/components/app/sidebar-nav";
import { Button } from "@/components/ui/button";
import { isOperatorEmail } from "@/features/billing";
import { createServerSupabase, getCurrentUser } from "@/lib/supabase/server";
import { signOut } from "./actions";
import { getCurrentTenant } from "./current-tenant";

/** White sidebar (docs/design.md §8): brand, nav, business name, sign out. */
export async function AppSidebar({ bell }: { bell?: React.ReactNode }) {
  const [tenant, user] = await Promise.all([getCurrentTenant(), getCurrentUser()]);
  const supabase = await createServerSupabase();
  const { count } = await supabase
    .from("inbound_items")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", tenant.id)
    .eq("status", "awaiting_approval");

  return (
    <aside className="bg-surface flex flex-col gap-4 border-b p-4 md:sticky md:top-0 md:h-dvh md:w-56 md:shrink-0 md:border-r md:border-b-0 md:p-5">
      <div className="flex items-center justify-between gap-2">
        <Brand />
        {bell}
      </div>
      <SidebarNav showCosts={isOperatorEmail(user.email)} inboxCount={count ?? 0} />
      <div className="mt-auto hidden flex-col gap-1 border-t pt-4 md:flex">
        <p className="truncate text-sm font-medium" title={tenant.name}>
          {tenant.name}
        </p>
        <p className="meta truncate">{user.email}</p>
        <form action={signOut}>
          <Button type="submit" variant="quiet" className="-ml-3">
            <LogOut strokeWidth={1.75} aria-hidden />
            Sign out
          </Button>
        </form>
      </div>
    </aside>
  );
}
