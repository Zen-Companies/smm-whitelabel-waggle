import { isSocialPlatform, type AccountHealth, type SocialPlatform } from "@/lib/social/types";
import type { SocialProvider } from "@/lib/social/types";
import type { ServiceClient } from "@/lib/supabase/service";
import { handleAccountConnected } from "./events";

// Setup's connecting screen (approved 23 Nov): when the account.connected webhook hasn't arrived
// ~20 s after the sign-in came back, ask Zernio which accounts the brand's profile has (through
// SocialProvider, the health endpoint) and add any Waggle doesn't know yet, the same way the
// webhook does. Safe to run twice: handleAccountConnected is idempotent.

export interface AccountToAdopt {
  zernioAccountId: string;
  platform: SocialPlatform;
  username: string;
}

/** Pure: the profile's working social accounts Waggle has no row for yet. */
export function accountsToAdopt(
  health: readonly AccountHealth[],
  known: ReadonlySet<string>,
): AccountToAdopt[] {
  const out: AccountToAdopt[] = [];
  for (const h of health) {
    if (known.has(h.accountId) || h.needsReconnect || h.status === "error") continue;
    if (!isSocialPlatform(h.platform)) continue;
    out.push({ zernioAccountId: h.accountId, platform: h.platform, username: h.username ?? "" });
  }
  return out;
}

/** A brand asks Zernio at most this often, however many tabs or requests poll. */
export const RECONCILE_EVERY_MS = 15_000;

/**
 * Takes the brand's turn to ask Zernio: one conditional update on tenants.accounts_reconciled_at,
 * so two requests at once can't both win. False when it asked less than 15 s ago.
 */
async function claimReconcile(db: ServiceClient, tenantId: string, now: Date): Promise<boolean> {
  const since = new Date(now.getTime() - RECONCILE_EVERY_MS).toISOString();
  const { data, error } = await db
    .from("tenants")
    .update({ accounts_reconciled_at: now.toISOString() })
    .eq("id", tenantId)
    .or(`accounts_reconciled_at.is.null,accounts_reconciled_at.lt.${since}`)
    .select("id");
  if (error) throw new Error(`reconcile claim failed: ${error.message}`);
  return (data ?? []).length > 0;
}

/**
 * Adds what the webhook missed. True when the brand now has an account it didn't have. Asks
 * Zernio at most once every 15 s per brand (false without asking otherwise).
 */
export async function reconcileConnectedAccounts(
  deps: { db: ServiceClient; social: () => SocialProvider; now?: Date },
  tenantId: string,
): Promise<boolean> {
  const { db } = deps;
  const { data: tenant } = await db
    .from("tenants")
    .select("zernio_profile_id, offboarded_at")
    .eq("id", tenantId)
    .maybeSingle();
  if (!tenant?.zernio_profile_id || tenant.offboarded_at) return false;
  if (!(await claimReconcile(db, tenantId, deps.now ?? new Date()))) return false;
  const health = await deps.social().getAccountsHealth({ profileId: tenant.zernio_profile_id });
  const { data: rows } = await db
    .from("social_accounts")
    .select("zernio_account_id")
    .eq("tenant_id", tenantId);
  const known = new Set((rows ?? []).map((r) => r.zernio_account_id));
  let added = false;
  for (const a of accountsToAdopt(health, known)) {
    const { outcome } = await handleAccountConnected(db, { tenantId, ...a });
    if (outcome !== "foreign") added = true;
  }
  return added;
}
