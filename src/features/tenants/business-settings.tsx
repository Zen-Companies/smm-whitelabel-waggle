import { Button } from "@/components/ui/button";
import { BUSINESS_PROFILE_MAX } from "@/lib/classifier/business-context";
import { createServerSupabase, getCurrentUser } from "@/lib/supabase/server";
import { signOut } from "./actions";
import { getCurrentTenant } from "./current-tenant";
import { ProfileForm } from "./profile-form";

/** Business and account (Settings). */
export async function BusinessSettings() {
  const [tenant, user] = await Promise.all([getCurrentTenant(), getCurrentUser()]);
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("tenants")
    .select("business_profile")
    .eq("id", tenant.id)
    .single();
  return (
    <section className="flex flex-col gap-4" aria-labelledby="business-heading">
      <h2 id="business-heading" className="section-title">
        Business
      </h2>
      <div className="card flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div className="flex flex-col">
          <span className="font-medium">{tenant.name}</span>
          <span className="meta">
            {user.email}
            {tenant.zernioProfileId ? "" : " · finishing setup: connect an account to complete it"}
          </span>
        </div>
        <form action={signOut}>
          <Button type="submit" variant="secondary">
            Sign out
          </Button>
        </form>
      </div>
      <ProfileForm profile={data?.business_profile ?? ""} max={BUSINESS_PROFILE_MAX} />
    </section>
  );
}
