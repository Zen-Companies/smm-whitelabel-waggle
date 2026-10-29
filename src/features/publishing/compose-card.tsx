import { getCurrentTenant } from "@/features/tenants";
import { createServerSupabase } from "@/lib/supabase/server";
import { ComposeForm } from "./compose-form";

export async function ComposeCard() {
  const tenant = await getCurrentTenant();
  const supabase = await createServerSupabase();
  const { data: accounts } = await supabase
    .from("social_accounts")
    .select("id, platform, username")
    .eq("tenant_id", tenant.id)
    .eq("status", "active")
    .order("created_at");
  return (
    <section className="card flex flex-col gap-4 p-6" aria-labelledby="compose-heading">
      <h2 id="compose-heading" className="section-title">
        New post
      </h2>
      <ComposeForm accounts={accounts ?? []} />
    </section>
  );
}
