import * as Sentry from "@sentry/nextjs";
import { pauseAccountItems } from "@/features/inbox";
import { writeAudit } from "@/lib/audit";
import { JOB_EXTERNAL_TIMEOUT_MS } from "@/lib/jobs";
import { getPlatformPause } from "@/lib/social/platform-pause";
import type { SocialProvider } from "@/lib/social/types";
import type { ServiceClient } from "@/lib/supabase/service";
import { type Failure, issueText, platformLabel } from "./rows";

// T21 offboarding (decided 2026-11-09): soft delete for 3 months, then the hard delete.
// Order matters: Waggle stops first (the brand is marked and its accounts disconnected here),
// then Zernio is cleaned up. A Zernio failure never undoes the stop; it shows as "Needs
// attention" with Try again.

export interface OffboardDeps {
  db: ServiceClient;
  social: () => SocialProvider;
  now?: () => Date;
}

const nowOf = (deps: OffboardDeps) => deps.now?.() ?? new Date();
const timeout = () => AbortSignal.timeout(JOB_EXTERNAL_TIMEOUT_MS);

/**
 * Disconnects every account of the brand here (its open items wait) and removes each one still
 * on Zernio. Returns the steps that failed.
 */
async function releaseAccounts(
  deps: OffboardDeps,
  tenantId: string,
  actor: string,
): Promise<Failure[]> {
  const { db } = deps;
  const { data: accounts, error } = await db
    .from("social_accounts")
    .select("id, platform, zernio_account_id, status, released_at")
    .eq("tenant_id", tenantId);
  if (error) throw new Error(`offboarding: reading accounts failed: ${error.message}`);

  for (const a of accounts ?? []) {
    if (a.status === "disconnected") continue;
    const { error: upd } = await db
      .from("social_accounts")
      .update({ status: "disconnected" })
      .eq("id", a.id);
    if (upd) throw new Error(`offboarding: disconnecting account failed: ${upd.message}`);
    const paused = await pauseAccountItems(db, {
      tenantId,
      socialAccountId: a.id,
      reason: "brand_offboarded",
    });
    await writeAudit(db, {
      tenantId,
      action: "account_disconnected",
      actor,
      details: { accountId: a.id, via: "offboarding", pausedItems: paused.length },
    });
  }

  const failures: Failure[] = [];
  const social = deps.social();
  for (const a of accounts ?? []) {
    if (a.released_at) continue;
    try {
      await social.disconnectAccount({ accountId: a.zernio_account_id, signal: timeout() });
    } catch (e) {
      failures.push({ what: platformLabel(a.platform), error: e });
      continue;
    }
    await db
      .from("social_accounts")
      .update({ released_at: nowOf(deps).toISOString() })
      .eq("id", a.id);
    await writeAudit(db, {
      tenantId,
      action: "account_released",
      actor,
      details: { accountId: a.id, zernioAccountId: a.zernio_account_id },
    });
  }
  return failures;
}

/** Saves the "Needs attention" line (or clears it) and logs what failed. */
async function recordIssue(
  deps: OffboardDeps,
  tenantId: string,
  actor: string,
  failures: Failure[],
): Promise<string | null> {
  const issue = issueText(failures);
  await deps.db.from("tenants").update({ offboard_issue: issue }).eq("id", tenantId);
  if (issue) {
    await writeAudit(deps.db, {
      tenantId,
      action: "offboarding_step_failed",
      actor,
      details: { steps: failures.map((f) => f.what) },
    });
  }
  return issue;
}

export type OffboardResult =
  { ok: true; purgeAfter: string; issue: string | null } | { error: string };

export async function offboardBrand(
  deps: OffboardDeps,
  input: { tenantId: string; actorId: string },
): Promise<OffboardResult> {
  const { data: purgeAfter, error } = await deps.db.rpc("offboard_tenant", {
    p_tenant_id: input.tenantId,
    p_actor: input.actorId,
  });
  if (error) throw new Error(`offboard_tenant failed: ${error.message}`);
  if (!purgeAfter) return { error: "That brand isn't active any more. Refresh the page." };
  const failures = await releaseAccounts(deps, input.tenantId, input.actorId);
  const issue = await recordIssue(deps, input.tenantId, input.actorId, failures);
  return { ok: true, purgeAfter, issue };
}

/** Try again on a brand that needs attention: the account removals, and the hard delete if due. */
export async function retryOffboarding(
  deps: OffboardDeps,
  input: { tenantId: string; actorId: string },
): Promise<{ ok: true; issue: string | null } | { error: string }> {
  const { data: t } = await deps.db
    .from("tenants")
    .select("offboarded_at, purged_at")
    .eq("id", input.tenantId)
    .maybeSingle();
  if (!t?.offboarded_at || t.purged_at) return { error: "That brand isn't offboarded." };
  const failures = await releaseAccounts(deps, input.tenantId, input.actorId);
  const issue = await recordIssue(deps, input.tenantId, input.actorId, failures);
  // A due hard delete that failed is picked up by the next job run.
  await deps.db.from("tenants").update({ purge_tried_at: null }).eq("id", input.tenantId);
  return { ok: true, issue };
}

export async function restoreBrand(
  db: ServiceClient,
  input: { tenantId: string; actorId: string },
): Promise<{ ok: true } | { error: string }> {
  const { data, error } = await db.rpc("restore_tenant", {
    p_tenant_id: input.tenantId,
    p_actor: input.actorId,
  });
  if (error) throw new Error(`restore_tenant failed: ${error.message}`);
  return data ? { ok: true } : { error: "That brand can't be restored any more." };
}

/** Hard deletes tried at most this often per brand (a failing Zernio isn't hammered). */
export const PURGE_RETRY_MS = 60 * 60 * 1000;

/**
 * The hard delete of brands offboarded 3 months ago (job runner, every minute). Accounts still
 * on Zernio and the profile go first; the content is deleted only when Zernio is clean.
 */
export async function purgeDueBrands(
  deps: OffboardDeps & { shouldContinue: () => boolean },
  limit = 2,
): Promise<{ purged: number; failed: number }> {
  const { db } = deps;
  const summary = { purged: 0, failed: 0 };
  if (await getPlatformPause(db)) return summary;
  const now = nowOf(deps);
  const { data: due, error } = await db
    .from("tenants")
    .select("id, zernio_profile_id")
    .not("offboarded_at", "is", null)
    .is("purged_at", null)
    .lte("purge_after", now.toISOString())
    .or(
      `purge_tried_at.is.null,purge_tried_at.lt.${new Date(now.getTime() - PURGE_RETRY_MS).toISOString()}`,
    )
    .order("purge_after")
    .limit(limit);
  if (error) throw new Error(`offboarding: reading due brands failed: ${error.message}`);

  for (const t of due ?? []) {
    if (!deps.shouldContinue()) break;
    await db.from("tenants").update({ purge_tried_at: now.toISOString() }).eq("id", t.id);
    try {
      const failures = await releaseAccounts(deps, t.id, "system");
      if (!failures.length && t.zernio_profile_id) {
        try {
          await deps.social().deleteProfile({ profileId: t.zernio_profile_id, signal: timeout() });
        } catch (e) {
          failures.push({ what: "profile", error: e });
        }
      }
      if (failures.length) {
        await recordIssue(deps, t.id, "system", failures);
        summary.failed += 1;
        continue;
      }
      const { data: purged, error: pErr } = await db.rpc("purge_tenant", { p_tenant_id: t.id });
      if (pErr) throw new Error(`purge_tenant failed: ${pErr.message}`);
      if (purged) summary.purged += 1;
    } catch (e) {
      summary.failed += 1;
      Sentry.captureException(e, { extra: { tenantId: t.id } });
    }
  }
  return summary;
}
