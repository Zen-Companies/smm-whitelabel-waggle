import "server-only";
import { getServiceClient } from "@/lib/supabase/service";

// T21: an owner's brand that our team offboarded. RLS hides it from the owner (it is gone from
// every page and the brand menu), so this one lookup uses the service role, for this user only.

export interface ClosedBrand {
  id: string;
  name: string;
  offboardedAt: string;
  purgeAfter: string;
}

/**
 * The user's offboarded brand (not yet deleted for good): `preferId` if it is one, else the most
 * recently offboarded. Null when they have none.
 */
export async function closedBrandFor(
  userId: string,
  preferId?: string | null,
): Promise<ClosedBrand | null> {
  const { data, error } = await getServiceClient()
    .from("tenant_members")
    .select("tenants!inner (id, name, offboarded_at, purge_after, purged_at)")
    .eq("user_id", userId)
    .not("tenants.offboarded_at", "is", null)
    .is("tenants.purged_at", null);
  if (error) throw new Error(`closed brand lookup failed: ${error.message}`);
  const brands = (data ?? [])
    .map((m) => m.tenants)
    .flatMap((t) =>
      t?.offboarded_at && t.purge_after
        ? [{ id: t.id, name: t.name, offboardedAt: t.offboarded_at, purgeAfter: t.purge_after }]
        : [],
    )
    .sort((a, b) => b.offboardedAt.localeCompare(a.offboardedAt));
  return brands.find((b) => b.id === preferId) ?? brands[0] ?? null;
}
