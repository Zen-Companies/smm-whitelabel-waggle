import * as Sentry from "@sentry/nextjs";
import { writeAudit } from "@/lib/audit";
import type { SocialProvider } from "@/lib/social/types";
import type { ServiceClient } from "@/lib/supabase/service";
import { zernioProfileName } from "./profile-name";

export interface TenantDeps {
  db: ServiceClient;
  /** Lazy, so missing Zernio config fails only the profile step, not tenant creation. */
  social: () => SocialProvider;
}

/** The owner's tenant, created (with member + audit row) on the first call only. */
export async function ensureOwnerTenant(
  db: ServiceClient,
  input: { userId: string; businessName: string },
): Promise<{ tenantId: string; created: boolean }> {
  const { data, error } = await db.rpc("create_owner_tenant", {
    p_user_id: input.userId,
    p_name: input.businessName.trim() || "My business",
  });
  if (error || !data?.[0]) throw new Error(`create_owner_tenant failed: ${error?.message}`);
  return { tenantId: data[0].tenant_id, created: data[0].created };
}

/**
 * Links the tenant's Zernio profile, creating it if needed. Safe to call any number of times:
 * Zernio rejects a second profile with the same externalId (= tenant id) and the adapter returns
 * the existing one, so a retry after a lost response adopts the profile instead of duplicating it.
 */
export async function ensureZernioProfile(
  deps: TenantDeps,
  tenantId: string,
): Promise<{ profileId: string; linked: boolean }> {
  const { db, social } = deps;
  const { data: tenant, error } = await db
    .from("tenants")
    .select("name, zernio_profile_id")
    .eq("id", tenantId)
    .single();
  if (error) throw new Error(`tenant lookup failed: ${error.message}`);
  if (tenant.zernio_profile_id) return { profileId: tenant.zernio_profile_id, linked: false };

  const { profileId, alreadyExisted } = await social().createProfile({
    name: zernioProfileName(tenant.name, tenantId),
    externalId: tenantId,
  });

  const { data: updated, error: updateError } = await db
    .from("tenants")
    .update({ zernio_profile_id: profileId })
    .eq("id", tenantId)
    .is("zernio_profile_id", null)
    .select("id");
  if (updateError) throw new Error(`linking Zernio profile failed: ${updateError.message}`);

  if (updated.length === 0) {
    // A concurrent call linked it first; it must be the same profile (one per externalId).
    const { data: current } = await db
      .from("tenants")
      .select("zernio_profile_id")
      .eq("id", tenantId)
      .single();
    if (current?.zernio_profile_id !== profileId) {
      throw new Error(`tenant ${tenantId} is linked to a different Zernio profile`);
    }
    return { profileId, linked: false };
  }

  await writeAudit(db, {
    tenantId,
    action: "zernio_profile_linked",
    actor: "system",
    details: { profileId, alreadyExisted },
  });
  return { profileId, linked: true };
}

/**
 * Signup, login and email confirmation all call this, so a step that failed earlier is
 * completed on the next attempt. A Zernio failure doesn't block the tenant: it is reported and
 * retried on the next login or connect.
 */
export async function setupOwnerTenant(
  deps: TenantDeps,
  input: { userId: string; businessName: string },
): Promise<{ tenantId: string; profileId: string | null }> {
  const { tenantId } = await ensureOwnerTenant(deps.db, input);
  try {
    const { profileId } = await ensureZernioProfile(deps, tenantId);
    return { tenantId, profileId };
  } catch (error) {
    Sentry.captureException(error, { extra: { tenantId } });
    return { tenantId, profileId: null };
  }
}

export async function getOwnerTenantId(db: ServiceClient, userId: string): Promise<string | null> {
  const { data, error } = await db
    .from("tenant_members")
    .select("tenant_id")
    .eq("user_id", userId)
    .eq("role", "owner")
    .maybeSingle();
  if (error) throw new Error(`membership lookup failed: ${error.message}`);
  return data?.tenant_id ?? null;
}
