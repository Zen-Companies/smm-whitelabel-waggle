import { writeAudit } from "@/lib/audit";
import type { SocialProvider } from "@/lib/social";
import type { ServiceClient } from "@/lib/supabase/service";
import { handleAccountConnected } from "./events";

// Telegram (T60): Zernio's bot joins the owner's channel or group as an admin, and the owner
// sends it a code we show. The page checks the code every few seconds until Zernio says it's
// connected. The code is posted in the channel, so anyone there can see it: the account is only
// recorded once Zernio lists it on this brand's own profile.

/** How often the setup card asks whether the code arrived. */
export const TELEGRAM_POLL_MS = 4_000;

export interface TelegramCode {
  code: string;
  expiresAt: string;
  botUsername: string;
}

export type TelegramCheck =
  | { status: "pending" }
  | { status: "expired" }
  /** Recorded now (`username` set), or Zernio didn't name the account and the webhook will. */
  | { status: "connected"; username: string | null }
  /** The code connected an account that isn't on this brand's profile. */
  | { status: "foreign" };

export async function startTelegramFor(
  deps: { db: ServiceClient; social: SocialProvider },
  input: { tenantId: string; actor: string; profileId: string },
): Promise<TelegramCode> {
  const code = await deps.social.startTelegramConnect({
    profileId: input.profileId,
    signal: AbortSignal.timeout(15_000),
  });
  await writeAudit(deps.db, {
    tenantId: input.tenantId,
    action: "account_connect_started",
    actor: input.actor,
    details: { platform: "telegram" },
  });
  return code;
}

export async function checkTelegramFor(
  deps: { db: ServiceClient; social: SocialProvider },
  input: { tenantId: string; profileId: string; code: string },
): Promise<TelegramCheck> {
  const result = await deps.social.checkTelegramConnect({
    code: input.code,
    signal: AbortSignal.timeout(15_000),
  });
  if (result.status !== "connected") return result;
  if (!result.accountId) return { status: "connected", username: null };

  // Someone else's code (seen in their channel) must not attach their channel to this brand.
  const onProfile = await deps.social.listAccountPictures({ profileId: input.profileId });
  if (!onProfile.some((a) => a.accountId === result.accountId)) return { status: "foreign" };

  const username = result.username ?? "Telegram";
  const { outcome } = await handleAccountConnected(deps.db, {
    tenantId: input.tenantId,
    zernioAccountId: result.accountId,
    platform: "telegram",
    username,
  });
  return outcome === "foreign" ? { status: "foreign" } : { status: "connected", username };
}
