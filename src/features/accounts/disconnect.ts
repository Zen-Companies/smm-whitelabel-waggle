import type { SocialProvider } from "@/lib/social/types";
import type { ServiceClient } from "@/lib/supabase/service";
import { handleAccountDisconnected } from "./events";

// 25 Nov: the owner disconnects a social account from Settings → Accounts. Removed from Zernio
// first (SocialProvider; an account already gone there, 404, counts as done), then marked the way
// the account.disconnected webhook does it (items pause, audit), without the "your account
// disconnected" email to the owner who just did it.

export type DisconnectOutcome =
  { ok: true } | { ok: false; error: "not_found" | "provider_failed"; cause?: unknown };

export async function disconnectSocialAccount(
  deps: { db: ServiceClient; social: () => SocialProvider },
  input: { tenantId: string; accountId: string; userId: string },
): Promise<DisconnectOutcome> {
  const { data: account, error } = await deps.db
    .from("social_accounts")
    .select("id, zernio_account_id, released_at")
    .eq("tenant_id", input.tenantId)
    .eq("id", input.accountId)
    .maybeSingle();
  if (error) throw new Error(`reading the account failed: ${error.message}`);
  if (!account) return { ok: false, error: "not_found" };
  // Already removed (a double click): nothing more to do.
  if (account.released_at) return { ok: true };

  try {
    await deps.social().disconnectAccount({
      accountId: account.zernio_account_id,
      signal: AbortSignal.timeout(15_000),
    });
  } catch (cause) {
    return { ok: false, error: "provider_failed", cause };
  }

  await handleAccountDisconnected(deps.db, {
    tenantId: input.tenantId,
    zernioAccountId: account.zernio_account_id,
    disconnectionType: "owner",
    reason: "owner",
    actor: input.userId,
    byOwner: true,
  });
  return { ok: true };
}
