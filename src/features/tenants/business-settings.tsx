import { Button } from "@/components/ui/button";
import { BUSINESS_PROFILE_MAX } from "@/lib/classifier/business-context";
import { createServerSupabase, getCurrentUser } from "@/lib/supabase/server";
import { signOut } from "./actions";
import { can } from "@/features/orgs";
import { getCurrentTenant } from "./current-tenant";
import { RoleGate } from "./role-gate";
import { ProfileForm } from "./profile-form";
import { pictureUrl } from "@/lib/pictures";
import { brandInitials } from "./brand-pick";
import { brandPicturePath } from "./brand-picture";
import { BrandPictureForm } from "./brand-picture-form";

/** Business and account (Settings). */
export async function BusinessSettings() {
  const [tenant, user] = await Promise.all([getCurrentTenant(), getCurrentUser()]);
  const supabase = await createServerSupabase();
  const [{ data }, { data: accounts }] = await Promise.all([
    supabase
      .from("tenants")
      .select("business_profile, picture_source, picture_path, picture_account_id")
      .eq("id", tenant.id)
      .single(),
    supabase
      .from("social_accounts")
      .select("id, platform, username, picture_path")
      .eq("tenant_id", tenant.id)
      .neq("status", "disconnected")
      .order("created_at"),
  ]);
  const shown = data ? pictureUrl(brandPicturePath(data, accounts ?? [])) : null;
  const source = (["account", "upload", "none"] as const).find((s) => s === data?.picture_source);
  return (
    <section className="flex flex-col gap-4" aria-labelledby="business-heading">
      <h2 id="business-heading" className="section-title">
        Business
      </h2>
      <section aria-labelledby="brand-picture" className="card flex flex-col gap-4 p-5">
        <div className="flex items-center gap-4">
          {shown ? (
            // eslint-disable-next-line @next/next/no-img-element -- our own storage, 512 px
            <img src={shown} alt="" className="size-[72px] shrink-0 rounded-full object-cover" />
          ) : (
            <span
              aria-hidden
              className="bg-subtle text-ink-2 inline-flex size-[72px] shrink-0 items-center justify-center rounded-full text-xl font-bold"
            >
              {brandInitials(tenant.name)}
            </span>
          )}
          <div className="flex flex-col">
            <h3 id="brand-picture" className="font-semibold">
              Brand picture
            </h3>
            <span className="meta">Shown in the brand menu and on the Team page.</span>
          </div>
        </div>
        <RoleGate
          allowed={can(tenant.role, "brand.settings")}
          role={tenant.role}
          what="the brand picture"
        >
          <BrandPictureForm
            source={source ?? "account"}
            accountId={data?.picture_account_id ?? null}
            accounts={(accounts ?? []).map((a) => ({
              id: a.id,
              platform: a.platform,
              username: a.username,
              hasPicture: a.picture_path !== null,
            }))}
            uploadUrl={pictureUrl(data?.picture_path)}
            initials={brandInitials(tenant.name)}
          />
        </RoleGate>
      </section>
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
      <RoleGate
        allowed={can(tenant.role, "brand.settings")}
        role={tenant.role}
        what="the business description"
      >
        <ProfileForm profile={data?.business_profile ?? ""} max={BUSINESS_PROFILE_MAX} />
      </RoleGate>
    </section>
  );
}
