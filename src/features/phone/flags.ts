import { writeAudit } from "@/lib/audit";
import type { ServiceClient } from "@/lib/supabase/service";
import { PHONE_FLAG } from "./numbers";

/** Phone is off until staff switch it on for the brand (T82a; billing isn't built yet). */
export async function phoneOn(db: ServiceClient, tenantId: string): Promise<boolean> {
  const { data } = await db
    .from("feature_flags")
    .select("enabled")
    .eq("key", PHONE_FLAG)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return data?.enabled === true;
}

/** Brands with Phone switched on, for the staff list. */
export async function phoneBrands(db: ServiceClient): Promise<{ id: string; name: string }[]> {
  const { data, error } = await db
    .from("feature_flags")
    .select("tenant_id, tenants!inner (name, offboarded_at)")
    .eq("key", PHONE_FLAG)
    .eq("enabled", true)
    .not("tenant_id", "is", null);
  if (error) throw new Error(`phone: reading switches failed: ${error.message}`);
  return (
    (data ?? []) as unknown as {
      tenant_id: string;
      tenants: { name: string; offboarded_at: string | null };
    }[]
  )
    .filter((r) => !r.tenants.offboarded_at)
    .map((r) => ({ id: r.tenant_id, name: r.tenants.name }));
}

export async function setPhoneSwitch(
  db: ServiceClient,
  actorId: string,
  tenantId: string,
  on: boolean,
): Promise<boolean> {
  const { data } = await db.from("tenants").select("id").eq("id", tenantId).maybeSingle();
  if (!data) return false;
  // The unique index is on (key, coalesce(tenant_id, …)), which upsert can't target: replace.
  const { error: e1 } = await db
    .from("feature_flags")
    .delete()
    .eq("key", PHONE_FLAG)
    .eq("tenant_id", tenantId);
  if (e1) throw new Error(`phone: changing a switch failed: ${e1.message}`);
  const { error: e2 } = await db
    .from("feature_flags")
    .insert({ key: PHONE_FLAG, tenant_id: tenantId, enabled: on, updated_by: actorId });
  if (e2) throw new Error(`phone: changing a switch failed: ${e2.message}`);
  await writeAudit(db, {
    tenantId,
    action: "feature_switched",
    actor: actorId,
    details: { key: PHONE_FLAG, on },
  });
  return true;
}
