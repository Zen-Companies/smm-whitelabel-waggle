import "server-only";
import * as Sentry from "@sentry/nextjs";
import { writeAudit } from "@/lib/audit";
import type { SocialProvider } from "@/lib/social/types";
import type { ServiceClient } from "@/lib/supabase/service";
import { profileBusinessName } from "./brand-name";

/**
 * Names a brand made by the first Connect from its connected profile (decision 6), once: true
 * when it did. Asked when setup opens while the name is pending; a profile with no usable name
 * (or the profile not readable) leaves the question to setup.
 */
export async function nameBrandFromProfile(
  deps: { db: ServiceClient; social: () => SocialProvider },
  tenantId: string,
): Promise<boolean> {
  const { db } = deps;
  const [{ data: tenant }, { data: accounts }] = await Promise.all([
    db.from("tenants").select("name_pending, zernio_profile_id").eq("id", tenantId).single(),
    db.from("social_accounts").select("platform, username").eq("tenant_id", tenantId),
  ]);
  if (!tenant?.name_pending || !tenant.zernio_profile_id || !accounts?.length) return false;
  let name: string | null = null;
  try {
    const profiles = await deps.social().listIntegrations({
      profileId: tenant.zernio_profile_id,
      platforms: accounts.map((a) => a.platform),
    });
    name = profileBusinessName(
      profiles.filter((p) => p.active),
      accounts.map((a) => a.username),
    );
  } catch (e) {
    Sentry.captureException(e, { extra: { tenantId } });
    return false;
  }
  if (!name) return false;
  const { data } = await db
    .from("tenants")
    .update({ name, name_pending: false })
    .eq("id", tenantId)
    .eq("name_pending", true)
    .select("id");
  if (!data?.length) return false;
  await writeAudit(db, {
    tenantId,
    action: "brand_named",
    actor: "system",
    details: { from: "profile" },
  });
  return true;
}
