import "server-only";
import { redirect } from "next/navigation";
import { createServerSupabase, getCurrentUser } from "@/lib/supabase/server";

export interface CurrentTenant {
  id: string;
  name: string;
  zernioProfileId: string | null;
  userId: string;
}

/** The signed-in owner's tenant, read through RLS. No tenant yet → back to /login to set up. */
export async function getCurrentTenant(): Promise<CurrentTenant> {
  const user = await getCurrentUser();
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("tenants")
    .select("id, name, zernio_profile_id")
    .limit(1)
    .maybeSingle();
  if (!data) redirect("/login");
  return { id: data.id, name: data.name, zernioProfileId: data.zernio_profile_id, userId: user.id };
}
