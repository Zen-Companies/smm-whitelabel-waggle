import "server-only";
import * as Sentry from "@sentry/nextjs";
import { writeAudit } from "@/lib/audit";
import type { SocialProvider } from "@/lib/social/types";
import type { ServiceClient } from "@/lib/supabase/service";
import { EXACT_NAME_PLATFORMS, exactPageName, profileBusinessName } from "./brand-name";

export interface BrandNaming {
  /** The brand was named just now from its page's exact name. */
  named: boolean;
  /** Not named: the connected profile's display name, a guess for the name screen (or null). */
  displayName: string | null;
}

const NOT_NAMED: BrandNaming = { named: false, displayName: null };

/**
 * Names a brand made by the first Connect (decision 6; approved 24 Nov), once. First the
 * platform's own page name (a Facebook Page's name, a Google Business location title, through
 * SocialProvider.getAccountCategory): exact, so the brand is named with no question. Otherwise
 * the profile's display name comes back as a guess for "Is this your business name?". Asked when
 * setup opens while the name is pending; nothing readable leaves the question to setup.
 */
export async function nameBrandFromProfile(
  deps: { db: ServiceClient; social: () => SocialProvider },
  tenantId: string,
): Promise<BrandNaming> {
  const { db } = deps;
  const [{ data: tenant }, { data: accounts }] = await Promise.all([
    db.from("tenants").select("name_pending, zernio_profile_id").eq("id", tenantId).single(),
    db
      .from("social_accounts")
      .select("platform, username, zernio_account_id")
      .eq("tenant_id", tenantId)
      .eq("status", "active")
      .order("created_at", { ascending: true }),
  ]);
  if (!tenant?.name_pending || !accounts?.length) return NOT_NAMED;

  // 1. The exact page name. getAccountCategory never throws (failures give the empty info).
  const pages = await Promise.all(
    accounts
      .filter((a) => EXACT_NAME_PLATFORMS.has(a.platform))
      .map(async (a) => {
        try {
          const info = await deps.social().getAccountCategory({
            accountId: a.zernio_account_id,
            platform: a.platform,
          });
          return { platform: a.platform, name: info.name };
        } catch (e) {
          Sentry.captureException(e, { extra: { tenantId, step: "page-name" } });
          return { platform: a.platform, name: null };
        }
      }),
  );
  const exact = exactPageName(pages);
  if (exact) {
    const { data } = await db
      .from("tenants")
      .update({ name: exact, name_pending: false })
      .eq("id", tenantId)
      .eq("name_pending", true)
      .select("id");
    if (!data?.length) return NOT_NAMED;
    await writeAudit(db, {
      tenantId,
      action: "brand_named",
      actor: "system",
      details: { from: "page" },
    });
    return { named: true, displayName: null };
  }

  // 2. No exact name: the display name is only a guess (the owner confirms it).
  if (!tenant.zernio_profile_id) return NOT_NAMED;
  try {
    const profiles = await deps.social().listIntegrations({
      profileId: tenant.zernio_profile_id,
      platforms: accounts.map((a) => a.platform),
    });
    return {
      named: false,
      displayName: profileBusinessName(
        profiles.filter((p) => p.active),
        accounts.map((a) => a.username),
      ),
    };
  } catch (e) {
    Sentry.captureException(e, { extra: { tenantId } });
    return NOT_NAMED;
  }
}
