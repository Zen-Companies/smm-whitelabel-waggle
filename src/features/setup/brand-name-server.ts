import "server-only";
import * as Sentry from "@sentry/nextjs";
import { writeAudit } from "@/lib/audit";
import type { SocialProvider } from "@/lib/social/types";
import type { ServiceClient } from "@/lib/supabase/service";
import {
  EXACT_NAME_PLATFORMS,
  exactPageName,
  nameFromLateAi,
  pickBrandName,
  profileBusinessNameFrom,
} from "./brand-name";
import { profileName, storedProfile } from "./profile";

/**
 * Names a brand made by the first Connect (decision 6; approved 24 Nov), once, right after
 * connect (asked when setup opens while the name is pending). The best source first: the
 * platform's own page name (a Facebook Page's name, a Google Business location title, through
 * SocialProvider.getAccountCategory) is sure; the setup AI profile's suggestion, else the
 * profile's display name, is a guess, kept in name_guessed_from (its platform) so step 3's facts
 * card shows it unchecked. Nothing usable leaves the name pending: step 3 asks it first.
 */
export async function nameBrandFromProfile(
  deps: { db: ServiceClient; social: () => SocialProvider },
  tenantId: string,
): Promise<{ named: boolean }> {
  const { db } = deps;
  const [{ data: tenant }, { data: accounts }] = await Promise.all([
    db
      .from("tenants")
      .select("name_pending, zernio_profile_id, ai_profile")
      .eq("id", tenantId)
      .single(),
    db
      .from("social_accounts")
      .select("platform, username, zernio_account_id")
      .eq("tenant_id", tenantId)
      .eq("status", "active")
      .order("created_at", { ascending: true }),
  ]);
  if (!tenant?.name_pending || !accounts?.length) return { named: false };

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

  // 2 and 3. The AI profile's suggestion (when it's made already), else the display name.
  const ai = exact ? null : profileName(storedProfile(tenant.ai_profile));
  let display: { name: string; platform: string } | null = null;
  if (!exact && !ai && tenant.zernio_profile_id) {
    try {
      const profiles = await deps.social().listIntegrations({
        profileId: tenant.zernio_profile_id,
        platforms: accounts.map((a) => a.platform),
      });
      display = profileBusinessNameFrom(
        profiles.filter((p) => p.active),
        accounts.map((a) => a.username),
      );
    } catch (e) {
      Sentry.captureException(e, { extra: { tenantId } });
    }
  }
  const picked = pickBrandName({ exact, ai, display: display?.name ?? null });
  if (!picked) return { named: false };
  const guessedFrom = picked.sure
    ? null
    : picked.source === "profile"
      ? (display?.platform ?? accounts[0].platform)
      : accounts[0].platform;

  const { data } = await db
    .from("tenants")
    .update({ name: picked.name, name_pending: false, name_guessed_from: guessedFrom })
    .eq("id", tenantId)
    .eq("name_pending", true)
    .select("id");
  if (!data?.length) return { named: false };
  await writeAudit(db, {
    tenantId,
    action: "brand_named",
    actor: "system",
    details: { from: picked.source, sure: picked.sure },
  });
  return { named: true };
}

/**
 * The AI profile was just made (profile-run.ts): when the brand's name is still pending or still
 * an unchecked guess, its suggestion becomes the name (still a guess). A name the owner set or
 * checked, or an exact page name, stays.
 */
export async function nameFromAiProfile(
  db: ServiceClient,
  input: { tenantId: string; ai: string | null; platform: string },
): Promise<boolean> {
  const { data: t } = await db
    .from("tenants")
    .select("name, name_pending, name_guessed_from")
    .eq("id", input.tenantId)
    .single();
  if (!t) return false;
  const next = nameFromLateAi({
    pending: t.name_pending,
    guessedFrom: t.name_guessed_from,
    current: t.name,
    ai: input.ai,
  });
  if (!next) return false;
  // Only if nobody changed it meanwhile (the owner's save clears name_guessed_from).
  const base = db
    .from("tenants")
    .update({
      name: next,
      name_pending: false,
      name_guessed_from: t.name_guessed_from ?? input.platform,
    })
    .eq("id", input.tenantId)
    .eq("name", t.name);
  const { data } = await (t.name_pending
    ? base.eq("name_pending", true)
    : base.not("name_guessed_from", "is", null)
  ).select("id");
  if (!data?.length) return false;
  await writeAudit(db, {
    tenantId: input.tenantId,
    action: "brand_named",
    actor: "system",
    details: { from: "ai", sure: false, replaced: t.name_pending ? "none" : "guess" },
  });
  return true;
}
