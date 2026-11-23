import "server-only";
import { upgradeHref } from "@/features/billing";
import type { ServiceClient } from "@/lib/supabase/service";
import { connectErrorHref } from "./connect-return";

/**
 * Free with its account in use, on a connect (pop-ups plan, approved 23 Nov): the upgrade pop-up
 * over the page the connect started from. Anywhere: "Add <Platform> with Solo". Setup step 1:
 * Free's card in place and, over it, "Connect <first> and <Platform> with Solo" (Keep one).
 */
export async function freeFullHref(
  db: ServiceClient,
  tenantId: string,
  origin: string,
  platform: string,
): Promise<string> {
  if (new URL(origin, "http://waggle.local").pathname !== "/welcome") {
    return upgradeHref("accounts", origin, { platform });
  }
  const { data } = await db
    .from("social_accounts")
    .select("platform")
    .eq("tenant_id", tenantId)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const picked = [...new Set([data?.platform, platform].filter((p): p is string => !!p))];
  return upgradeHref("accounts", connectErrorHref(origin, "free_full", platform), {
    platforms: picked.length > 1 ? picked.join(",") : null,
    platform,
  });
}
