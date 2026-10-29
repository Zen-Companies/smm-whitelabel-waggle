import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/supabase/server";
import { signOut } from "./actions";
import { getCurrentTenant } from "./current-tenant";

/** Business and account (Settings). */
export async function BusinessSettings() {
  const [tenant, user] = await Promise.all([getCurrentTenant(), getCurrentUser()]);
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
    </section>
  );
}
