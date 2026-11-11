import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import {
  can,
  isOrgRole,
  listMyOrgs,
  ORG_COOKIE,
  type Ability,
  type OrgRole,
} from "@/features/orgs";
import { requireBeta } from "@/features/beta";
import { createServerSupabase, getCurrentUser } from "@/lib/supabase/server";
import { BRAND_COOKIE, pickOpenBrand } from "./brand-pick";
import { closedBrandFor } from "./closed";

export interface CurrentTenant {
  id: string;
  name: string;
  zernioProfileId: string | null;
  userId: string;
  organizationId: string;
  /** The user's role here (T55 checks abilities against it). */
  role: OrgRole;
}

/**
 * The open brand (T47, T54): within the open organization (organization cookie, if it is one of
 * the user's), the brand in the brand cookie, else that organization's first. Tenants are read
 * through RLS, so a cookie can't open someone else's. Every dashboard query filters on this id,
 * which keeps one brand's data out of another's pages. No brand to open (a new login, or an
 * organization with no brands yet) → /welcome, "Add your first brand". Cached per request.
 */
export const getCurrentTenant = cache(async (): Promise<CurrentTenant> => {
  const user = await getCurrentUser();
  await requireBeta();
  const supabase = await createServerSupabase();
  const [{ data }, orgs, store] = await Promise.all([
    supabase
      .from("tenants")
      .select("id, name, zernio_profile_id, organization_id")
      .order("created_at")
      .order("id"),
    listMyOrgs(),
    cookies(),
  ]);
  const brandCookie = store.get(BRAND_COOKIE)?.value;
  const open = pickOpenBrand(
    data ?? [],
    orgs.map((o) => o.id),
    brandCookie,
    store.get(ORG_COOKIE)?.value,
  );
  const tenant = open.brand;
  // T21: the open brand (or the only one) was offboarded: say so instead of switching silently.
  if (!tenant || (brandCookie && tenant.id !== brandCookie)) {
    const closed = await closedBrandFor(user.id, brandCookie);
    if (closed && (!tenant || closed.id === brandCookie)) redirect("/brands/closed");
  }
  if (!tenant || !tenant.organization_id) redirect("/welcome");

  const { data: member } = await supabase
    .from("tenant_members")
    .select("role")
    .eq("tenant_id", tenant.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!member || !isOrgRole(member.role)) redirect("/welcome");

  return {
    id: tenant.id,
    name: tenant.name,
    zernioProfileId: tenant.zernio_profile_id,
    userId: user.id,
    organizationId: tenant.organization_id,
    role: member.role,
  };
});

/** What a Server Action answers when the user's role can't do it (T55). */
export const NOT_ALLOWED = "Your role here can't do that. Ask an Owner or Admin.";

/**
 * The open brand, if the user's role there allows `ability` (T55); else null. Every Server
 * Action that changes something calls this: an action is reachable without its button.
 */
export async function getTenantFor(ability: Ability): Promise<CurrentTenant | null> {
  const tenant = await getCurrentTenant();
  return can(tenant.role, ability) ? tenant : null;
}
