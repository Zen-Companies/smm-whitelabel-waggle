import "server-only";
import { orgOnFree, roomForAnotherAccount } from "@/features/billing";
import { queueForOwners, queueQuietly } from "@/lib/crm";
import type { ServiceClient } from "@/lib/supabase/service";
import { connectErrorHref } from "./connect-return";
import { freeFullHref } from "./free-full";

/**
 * The plan's connected accounts (Pricing Bible) for a connect that doesn't go through Zernio's
 * sign-in (Bluesky's password, Telegram's code, WhatsApp's and LINE's own keys). Null when
 * there's room. Otherwise where the refusal shows, the same as the sign-in connects
 * (actions.ts, start-connect.ts): on Free the upgrade pop-up over the page naming the platform,
 * on a paid plan the "accounts all in use" line in place. Queues the CRM event like they do.
 */
export async function accountsFullHref(
  db: ServiceClient,
  tenant: { id: string; organizationId: string },
  origin: string,
  platform: string,
): Promise<string | null> {
  if (await roomForAnotherAccount(db, tenant.id)) return null;
  // CRM: a connect blocked by the plan's accounts (once a day per organization).
  await queueQuietly(() =>
    queueForOwners(db, tenant.organizationId, {
      event: "account_limit",
      dedupeKey: `account_limit:${tenant.organizationId}:${new Date().toISOString().slice(0, 10)}`,
    }),
  );
  if (await orgOnFree(db, tenant.organizationId)) {
    return freeFullHref(db, tenant.id, origin, platform);
  }
  return connectErrorHref(origin, "accounts_full", platform);
}
