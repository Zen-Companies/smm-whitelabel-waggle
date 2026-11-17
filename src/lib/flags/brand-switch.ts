import { writeAudit } from "@/lib/audit";
import type { ServiceClient } from "@/lib/supabase/service";

/**
 * Paid channels staff switch on brand by brand until billing is built (T82a Phone, T83
 * Messaging): their monthly and per-message costs bill our account, so they're off by default.
 */
export const BRAND_SWITCHES = {
  phone: {
    title: "Phone",
    note: "Numbers, calls and texts are billed to our account until billing is built, so Phone is on only for the brands listed here.",
  },
  messaging: {
    title: "Branded texts and iMessage",
    note: "RCS agents ($150 to file, $750 on US approval, $160 a month) and iMessage numbers ($200 a month) bill our account until billing is built, so they're on only for the brands listed here.",
  },
} as const;
export type BrandSwitchKey = keyof typeof BRAND_SWITCHES;

export function isBrandSwitchKey(key: unknown): key is BrandSwitchKey {
  return typeof key === "string" && Object.hasOwn(BRAND_SWITCHES, key);
}

export async function brandSwitchOn(
  db: ServiceClient,
  key: BrandSwitchKey,
  tenantId: string,
): Promise<boolean> {
  const { data } = await db
    .from("feature_flags")
    .select("enabled")
    .eq("key", key)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return data?.enabled === true;
}

/** Brands with the switch on, for the staff list. */
export async function switchedOnBrands(
  db: ServiceClient,
  key: BrandSwitchKey,
): Promise<{ id: string; name: string }[]> {
  const { data, error } = await db
    .from("feature_flags")
    .select("tenant_id, tenants!inner (name, offboarded_at)")
    .eq("key", key)
    .eq("enabled", true)
    .not("tenant_id", "is", null);
  if (error) throw new Error(`flags: reading ${key} switches failed: ${error.message}`);
  return (
    (data ?? []) as unknown as {
      tenant_id: string;
      tenants: { name: string; offboarded_at: string | null };
    }[]
  )
    .filter((r) => !r.tenants.offboarded_at)
    .map((r) => ({ id: r.tenant_id, name: r.tenants.name }));
}

export async function setBrandSwitch(
  db: ServiceClient,
  actorId: string,
  key: BrandSwitchKey,
  tenantId: string,
  on: boolean,
): Promise<boolean> {
  const { data } = await db.from("tenants").select("id").eq("id", tenantId).maybeSingle();
  if (!data) return false;
  // The unique index is on (key, coalesce(tenant_id, …)), which upsert can't target: replace.
  const { error: e1 } = await db
    .from("feature_flags")
    .delete()
    .eq("key", key)
    .eq("tenant_id", tenantId);
  if (e1) throw new Error(`flags: changing ${key} failed: ${e1.message}`);
  const { error: e2 } = await db
    .from("feature_flags")
    .insert({ key, tenant_id: tenantId, enabled: on, updated_by: actorId });
  if (e2) throw new Error(`flags: changing ${key} failed: ${e2.message}`);
  await writeAudit(db, {
    tenantId,
    action: "feature_switched",
    actor: actorId,
    details: { key, on },
  });
  return true;
}
