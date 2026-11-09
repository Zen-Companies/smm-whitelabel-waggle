import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createServerSupabase, getCurrentUser } from "@/lib/supabase/server";
import { BRAND_COOKIE, pickBrand } from "./brand-pick";
import { closedBrandFor } from "./closed";

export interface CurrentTenant {
  id: string;
  name: string;
  zernioProfileId: string | null;
  userId: string;
}

/**
 * The open brand (T47): the tenant named by the brand cookie, if the signed-in user belongs to it,
 * else their first. Tenants are read through RLS, so a cookie can't open someone else's. Every
 * dashboard query filters on this id, which keeps one brand's data out of another's pages.
 * No tenant yet → back to /login to set up. Cached per request.
 */
export const getCurrentTenant = cache(async (): Promise<CurrentTenant> => {
  const user = await getCurrentUser();
  const supabase = await createServerSupabase();
  const [{ data }, store] = await Promise.all([
    supabase.from("tenants").select("id, name, zernio_profile_id").order("created_at").order("id"),
    cookies(),
  ]);
  const cookie = store.get(BRAND_COOKIE)?.value;
  const tenant = pickBrand(data ?? [], cookie);
  // T21: the open brand (or the only one) was offboarded: say so instead of switching silently.
  if (!tenant || (cookie && tenant.id !== cookie)) {
    const closed = await closedBrandFor(user.id, cookie);
    if (closed && (!tenant || closed.id === cookie)) redirect("/brands/closed");
  }
  if (!tenant) redirect("/login");
  return {
    id: tenant.id,
    name: tenant.name,
    zernioProfileId: tenant.zernio_profile_id,
    userId: user.id,
  };
});
