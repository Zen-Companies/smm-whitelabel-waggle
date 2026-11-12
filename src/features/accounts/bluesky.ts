import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import type { SocialProvider } from "@/lib/social";
import { SocialProviderError } from "@/lib/social/types";
import type { ServiceClient } from "@/lib/supabase/service";
import { handleAccountConnected } from "./events";

// Bluesky connects with a handle and an app password typed in Waggle (T60), not Zernio's hosted
// sign-in. The password goes straight to Zernio: never stored, logged, audited or sent to Sentry.

const ZERNIO_TIMEOUT_MS = 20_000;

export const blueskyInputSchema = z.object({
  identifier: z
    .string()
    .trim()
    .transform((v) => v.replace(/^@/, ""))
    .pipe(z.string().min(3, "Type your Bluesky handle.").max(253, "That handle is too long.")),
  appPassword: z
    .string()
    .trim()
    .min(1, "Paste the app password.")
    .max(100, "That's longer than an app password."),
});

export type BlueskyError = "bad_credentials" | "plan_limit" | "taken" | "unavailable";

export type BlueskyResult =
  { ok: true; username: string | null } | { ok: false; error: BlueskyError };

export function blueskyErrorText(error: BlueskyError): string {
  switch (error) {
    case "bad_credentials":
      return "Bluesky didn't accept that handle and app password. Check both, and use an app password, not your main password.";
    case "plan_limit":
      return "We can't add Bluesky for this brand right now: our connection limit is full. We've been alerted; please try again later.";
    case "taken":
      return "That Bluesky account is already connected to another brand in Waggle.";
    case "unavailable":
      return "Couldn't connect Bluesky. Please try again.";
  }
}

/** Zernio's refusal → what the owner can do about it. 4xx other than 402 is the credentials. */
export function blueskyErrorFor(error: unknown): BlueskyError {
  if (!(error instanceof SocialProviderError)) return "unavailable";
  const status = error.details.status;
  if (status === 402) return "plan_limit";
  if (status === 400 || status === 401 || status === 403) return "bad_credentials";
  return "unavailable";
}

/**
 * Connects the brand's Bluesky account and records it now (the webhook that follows finds it
 * already there). Unexpected failures are thrown to the caller, which reports them.
 */
export async function connectBlueskyFor(
  deps: { db: ServiceClient; social: SocialProvider },
  input: {
    tenantId: string;
    actor: string;
    profileId: string;
    identifier: string;
    appPassword: string;
  },
): Promise<BlueskyResult> {
  await writeAudit(deps.db, {
    tenantId: input.tenantId,
    action: "account_connect_started",
    actor: input.actor,
    details: { platform: "bluesky" },
  });

  let account: { accountId: string; username: string | null } | null;
  try {
    ({ account } = await deps.social.connectBluesky({
      profileId: input.profileId,
      identifier: input.identifier,
      appPassword: input.appPassword,
      signal: AbortSignal.timeout(ZERNIO_TIMEOUT_MS),
    }));
  } catch (error) {
    const reason = blueskyErrorFor(error);
    if (reason === "unavailable") throw error;
    return { ok: false, error: reason };
  }

  // No account in the response: account.connected brings it in a moment.
  if (!account) return { ok: true, username: null };

  const { outcome } = await handleAccountConnected(deps.db, {
    tenantId: input.tenantId,
    zernioAccountId: account.accountId,
    platform: "bluesky",
    username: account.username ?? input.identifier,
  });
  if (outcome === "foreign") return { ok: false, error: "taken" };
  return { ok: true, username: account.username ?? input.identifier };
}
