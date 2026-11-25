import * as Sentry from "@sentry/nextjs";
import { insertInboundItem } from "@/features/inbox";
import { writeAudit } from "@/lib/audit";
import { getPlatformPause, recordPlatformPause } from "@/lib/social/platform-pause";
import { COMMENTS_LIVE } from "@/lib/social/platforms";
import {
  isSocialPlatform,
  type AccountsHealthReport,
  type SocialPlatform,
  type SocialProvider,
} from "@/lib/social/types";
import { isPlatformPaused } from "@/lib/social/zernio";
import type { ServiceClient } from "@/lib/supabase/service";
import { handleAccountConnected, handleAccountDisconnected } from "./events";
import { syncAccountPictures } from "./pictures";

// T16 (docs/tdd.md §7.2): an hourly check with Zernio's account health endpoint catches a
// disconnect whose webhook never arrived, and a comment backfill fills the inbox after a
// connect, a recovery or a Zernio pause (inbox polling stops while Zernio is paused).

export const HEALTH_CHECK_INTERVAL_MS = 60 * 60 * 1000;

/** The audit reason for an account Zernio no longer has (deleted there, 25 Nov). */
export const REMOVED_IN_ZERNIO = "removed in Zernio";

export type HealthStep =
  | { kind: "none" }
  | { kind: "disconnect"; reason: string }
  /** Missing from a complete answer: disconnect only if Zernio answers 404 for it. */
  | { kind: "check_gone" }
  | { kind: "recover"; platform: SocialPlatform; username: string };

/**
 * What one Waggle account needs after the profile's health answer. Pure. An account missing from
 * the answer is only suspect when the answer is complete (docs/tdd.md §7.2); a partial answer
 * never changes anything. An account the owner disconnected (released) is never revived.
 */
export function healthStep(
  account: { zernio_account_id: string; status: string; released_at: string | null },
  report: AccountsHealthReport,
): HealthStep {
  const h = report.accounts.find((x) => x.accountId === account.zernio_account_id);
  if (!h) {
    return report.complete && account.status === "active"
      ? { kind: "check_gone" }
      : { kind: "none" };
  }
  const broken = h.needsReconnect || h.status === "error";
  if (broken && account.status === "active") {
    return { kind: "disconnect", reason: h.issues.join(", ") || h.status };
  }
  if (
    !broken &&
    account.status !== "active" &&
    !account.released_at &&
    isSocialPlatform(h.platform)
  ) {
    return { kind: "recover", platform: h.platform, username: h.username ?? "" };
  }
  return { kind: "none" };
}

interface Deps {
  db: ServiceClient;
  social: () => SocialProvider;
  now?: Date;
  shouldContinue?: () => boolean;
}

/** Checks tenants whose accounts weren't checked in the last hour (a few per tick). */
export async function checkAccountsHealth(
  deps: Deps,
  opts: { tenantId?: string; limit?: number } = {},
): Promise<{ checked: number; disconnected: number; recovered: number }> {
  const { db } = deps;
  const now = deps.now ?? new Date();
  const summary = { checked: 0, disconnected: 0, recovered: 0 };
  if (await getPlatformPause(db)) return summary;

  let query = db
    .from("tenants")
    .select("id, zernio_profile_id")
    .not("zernio_profile_id", "is", null)
    // An offboarded brand (T21) stays disconnected: a health check could otherwise revive it.
    .is("offboarded_at", null)
    .or(
      `health_checked_at.is.null,health_checked_at.lt.${new Date(now.getTime() - HEALTH_CHECK_INTERVAL_MS).toISOString()}`,
    )
    .order("health_checked_at", { ascending: true, nullsFirst: true })
    .limit(opts.limit ?? 5);
  if (opts.tenantId) query = query.eq("id", opts.tenantId);
  const { data: tenants, error } = await query;
  if (error) throw new Error(`health check tenants lookup failed: ${error.message}`);

  for (const tenant of tenants ?? []) {
    if (deps.shouldContinue && !deps.shouldContinue()) break;
    // Marked first: one bad tenant can't make every tick retry it.
    await db.from("tenants").update({ health_checked_at: now.toISOString() }).eq("id", tenant.id);
    let health;
    try {
      health = await deps.social().getAccountsHealth({ profileId: tenant.zernio_profile_id! });
    } catch (err) {
      if (isPlatformPaused(err)) {
        await recordPlatformPause(db, now);
        break;
      }
      Sentry.captureException(err, { extra: { tenantId: tenant.id } });
      continue;
    }
    summary.checked += 1;

    const { data: accounts } = await db
      .from("social_accounts")
      .select("id, zernio_account_id, status, released_at")
      .eq("tenant_id", tenant.id);
    for (const account of accounts ?? []) {
      const step = healthStep(account, health);
      if (step.kind === "none") continue;
      if (step.kind === "check_gone") {
        // 25 Nov: missing from a complete answer. Confirmed one by one before anything changes:
        // only Zernio's 404 for the account itself means it was removed there.
        let exists: boolean;
        try {
          exists = await deps.social().accountExists({
            accountId: account.zernio_account_id,
            signal: AbortSignal.timeout(15_000),
          });
        } catch (err) {
          Sentry.captureException(err, { extra: { tenantId: tenant.id, accountId: account.id } });
          continue;
        }
        if (exists) continue;
      }
      if (step.kind === "disconnect" || step.kind === "check_gone") {
        // Same path as the account.disconnected webhook: items pause, owner gets one email.
        await handleAccountDisconnected(db, {
          tenantId: tenant.id,
          zernioAccountId: account.zernio_account_id,
          disconnectionType: "health_check",
          reason: step.kind === "disconnect" ? step.reason : REMOVED_IN_ZERNIO,
        });
        summary.disconnected += 1;
      } else {
        await handleAccountConnected(db, {
          tenantId: tenant.id,
          zernioAccountId: account.zernio_account_id,
          platform: step.platform,
          username: step.username,
        });
        summary.recovered += 1;
      }
    }
    // T57: keep copies of the accounts' pictures (a brand can use one as its picture).
    try {
      await syncAccountPictures(
        deps,
        { id: tenant.id, zernioProfileId: tenant.zernio_profile_id! },
        now,
      );
    } catch (err) {
      Sentry.captureException(err, { extra: { tenantId: tenant.id } });
    }
  }
  return summary;
}

/**
 * Comments received since `backfill_from` on accounts that asked for it, inserted the same way
 * the webhook does (unique platform comment id, so nothing duplicates). Reconnects and recoveries
 * only; a first connect gets the 30-day catch-up instead (features/catch-up), which also pulls
 * DMs, deduplicated on Meta's message id.
 */
export async function backfillComments(
  deps: Deps,
  opts: { tenantId?: string; limit?: number } = {},
): Promise<{ accounts: number; created: number }> {
  const { db } = deps;
  const summary = { accounts: 0, created: 0 };
  if (await getPlatformPause(db)) return summary;

  let query = db
    .from("social_accounts")
    .select("id, tenant_id, zernio_account_id, backfill_from")
    .eq("status", "active")
    .in("platform", COMMENTS_LIVE)
    .not("backfill_from", "is", null)
    .limit(opts.limit ?? 3);
  if (opts.tenantId) query = query.eq("tenant_id", opts.tenantId);
  const { data: accounts, error } = await query;
  if (error) throw new Error(`backfill accounts lookup failed: ${error.message}`);

  for (const account of accounts ?? []) {
    if (deps.shouldContinue && !deps.shouldContinue()) break;
    const since = new Date(account.backfill_from!);
    let created = 0;
    try {
      const posts = await deps
        .social()
        .listCommentedPosts({ accountId: account.zernio_account_id, since, limit: 20 });
      for (const { postId } of posts) {
        const comments = await deps
          .social()
          .listPostComments({ accountId: account.zernio_account_id, postId, limit: 50 });
        for (const c of comments) {
          if (c.fromOwner || !c.createdAt || new Date(c.createdAt) < since) continue;
          const result = await insertInboundItem(db, {
            kind: "comment",
            tenantId: account.tenant_id,
            socialAccountId: account.id,
            zernioCommentId: c.id,
            zernioPostId: postId,
            authorName: c.authorName,
            text: c.text,
            receivedAt: c.createdAt,
          });
          if (result.created) created += 1;
        }
      }
    } catch (err) {
      if (isPlatformPaused(err)) {
        await recordPlatformPause(db);
        break;
      }
      Sentry.captureException(err, { extra: { socialAccountId: account.id } });
      continue;
    }
    await db
      .from("social_accounts")
      .update({ backfill_from: null })
      .eq("id", account.id)
      .eq("backfill_from", account.backfill_from!);
    await writeAudit(db, {
      tenantId: account.tenant_id,
      action: "inbox_backfilled",
      actor: "system",
      details: { accountId: account.id, since: since.toISOString(), created },
    });
    summary.accounts += 1;
    summary.created += created;
  }
  return summary;
}

/** Ask for a backfill of every active account, e.g. after a Zernio pause ended. */
export async function requestBackfillForAll(db: ServiceClient, since: Date): Promise<void> {
  const { error } = await db
    .from("social_accounts")
    .update({ backfill_from: since.toISOString() })
    .eq("status", "active")
    .in("platform", COMMENTS_LIVE)
    .is("backfill_from", null);
  if (error) throw new Error(`requesting backfill failed: ${error.message}`);
}
