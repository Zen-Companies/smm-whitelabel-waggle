import { kickCatchUp, startCatchUp } from "@/features/catch-up";
import { pauseAccountItems, resumeAccountItems } from "@/features/inbox";
import { writeAudit } from "@/lib/audit";
import { queueForOwners, queueQuietly } from "@/lib/crm";
import { hasLiveComments } from "@/lib/social/platforms";
import { isSocialPlatform, SOCIAL_PLATFORMS, type SocialPlatform } from "@/lib/social/types";
import type { ServiceClient } from "@/lib/supabase/service";

// account.connected / account.disconnected, called by the webhook mapping (T5) with a tenant it
// has already verified. Both are safe to run twice for the same event.

/** On a reconnect or recovery, look this far back for comments (T16 backfill). */
export const BACKFILL_WINDOW_MS = 24 * 60 * 60 * 1000;

export const SUPPORTED_PLATFORMS = SOCIAL_PLATFORMS;
export const isSupportedPlatform = isSocialPlatform;

export type ConnectOutcome = "created" | "existing" | "reconnected" | "foreign";

export async function handleAccountConnected(
  db: ServiceClient,
  input: { tenantId: string; zernioAccountId: string; platform: SocialPlatform; username: string },
): Promise<{ accountId: string; outcome: ConnectOutcome; resumedItems: number }> {
  const { data, error } = await db.rpc("upsert_connected_account", {
    p_tenant_id: input.tenantId,
    p_zernio_account_id: input.zernioAccountId,
    p_platform: input.platform,
    p_username: input.username,
  });
  if (error || !data?.[0]) throw new Error(`upsert_connected_account failed: ${error?.message}`);
  const row = data[0];
  const outcome = row.outcome as ConnectOutcome;

  // Another tenant's account id: never touch it (the caller records the event as an error).
  if (outcome === "foreign") return { accountId: row.account_id, outcome, resumedItems: 0 };

  if (outcome !== "existing" || row.previous_status !== "active") {
    // First connect (19 Nov): a catch-up of the last 30 days of comments and DMs replaces the
    // 24-hour backfill. A reconnect or a recovery keeps the 24-hour backfill (T16).
    const caughtUp =
      outcome === "created" &&
      (await startCatchUp(db, {
        tenantId: input.tenantId,
        socialAccountId: row.account_id,
        platform: input.platform,
        zernioAccountId: input.zernioAccountId,
        username: input.username,
      }));
    // 20 Nov: start reading right away instead of at the next once-a-minute job run. Only asks
    // the catch-up jobs route to run after this response (no AI here: CLAUDE.md rule 3).
    if (caughtUp) kickCatchUp(input.tenantId);
    // T16: pull comments that arrived while the account was away.
    // Only where Waggle's inbox covers the platform today.
    if (!caughtUp && hasLiveComments(input.platform)) {
      await db
        .from("social_accounts")
        .update({ backfill_from: new Date(Date.now() - BACKFILL_WINDOW_MS).toISOString() })
        .eq("id", row.account_id);
    }
    await writeAudit(db, {
      tenantId: input.tenantId,
      action: "account_connected",
      actor: "system",
      details: {
        accountId: row.account_id,
        zernioAccountId: input.zernioAccountId,
        platform: input.platform,
        outcome,
        previousStatus: row.previous_status,
        previousZernioAccountId: row.previous_zernio_account_id,
      },
    });
  }

  // CRM: the organization's first connected account (once; the dedupe key holds it).
  if (outcome === "created") {
    await queueQuietly(async () => {
      const { data: t } = await db
        .from("tenants")
        .select("organization_id")
        .eq("id", input.tenantId)
        .maybeSingle();
      if (!t?.organization_id) return;
      await queueForOwners(db, t.organization_id, {
        event: "account_connected",
        details: { platform: input.platform },
        dedupeKey: `account_connected:${t.organization_id}`,
      });
    });
  }

  const resumed = await resumeAccountItems(db, {
    tenantId: input.tenantId,
    socialAccountId: row.account_id,
    reason: "account_connected",
  });
  return { accountId: row.account_id, outcome, resumedItems: resumed.length };
}

export async function handleAccountDisconnected(
  db: ServiceClient,
  input: {
    tenantId: string;
    zernioAccountId: string;
    disconnectionType?: string;
    reason?: string;
  },
): Promise<{ accountId: string | null; pausedItems: number }> {
  const { data: account, error } = await db
    .from("social_accounts")
    .update({ status: "disconnected" })
    .eq("tenant_id", input.tenantId)
    .eq("zernio_account_id", input.zernioAccountId)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`disconnecting account failed: ${error.message}`);
  if (!account) return { accountId: null, pausedItems: 0 };

  const paused = await pauseAccountItems(db, {
    tenantId: input.tenantId,
    socialAccountId: account.id,
    reason: "account_disconnected",
  });
  await writeAudit(db, {
    tenantId: input.tenantId,
    action: "account_disconnected",
    actor: "system",
    details: {
      accountId: account.id,
      zernioAccountId: input.zernioAccountId,
      disconnectionType: input.disconnectionType,
      reason: input.reason,
      pausedItems: paused.length,
    },
  });
  // The owner email with a reconnect link is T13 (PRD F2).
  return { accountId: account.id, pausedItems: paused.length };
}
