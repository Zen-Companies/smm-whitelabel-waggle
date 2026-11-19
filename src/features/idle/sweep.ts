import "server-only";
import * as Sentry from "@sentry/nextjs";
import { pauseAccountItems } from "@/features/inbox";
import { writeAudit } from "@/lib/audit";
import type { Mailer } from "@/lib/email/mailer";
import { JOB_EXTERNAL_TIMEOUT_MS } from "@/lib/jobs";
import { getPlatformPause } from "@/lib/social/platform-pause";
import { platformLabel } from "@/lib/social/platforms";
import type { SocialProvider } from "@/lib/social/types";
import type { Database } from "@/lib/supabase/database.types";
import type { ServiceClient } from "@/lib/supabase/service";
import { idleWarningEmail } from "./email";
import { idleDisconnectOn, orgIsFreeForIdle } from "./free";
import { CHECK_EVERY_MS, decideIdle, lastActiveAt, type IdleDecision } from "./idle";

// Free plan idle disconnect (decided 19 Nov), the jobs route step. Each organization with a
// connected account is checked at most once a day: day 23 sends one warning to the owners,
// day 30 disconnects every account (through the SocialProvider, so Zernio stops charging), and
// anyone using Waggle in between clears it. Ids only in logs and audit rows (rule 10).

export interface IdleSweepDeps {
  db: ServiceClient;
  social: () => SocialProvider;
  mailer: Mailer;
  appUrl: string;
  now?: Date;
  shouldContinue: () => boolean;
  /** Organizations per run (default 10). */
  limit?: number;
}

export interface IdleSweepSummary {
  off?: true;
  checked: number;
  warned: number;
  disconnected: number;
  cleared: number;
  failed: number;
}

interface OrgAccount {
  id: string;
  tenant_id: string;
  platform: string;
  username: string | null;
  zernio_account_id: string;
}

const orgAudit = (
  db: ServiceClient,
  orgId: string,
  action: string,
  details: Record<string, string | number | boolean | null>,
) =>
  db
    .from("organization_audit")
    .insert({ organization_id: orgId, action, actor: "system", details })
    .then(({ error }) => {
      if (error) throw new Error(`idle: organization_audit insert failed: ${error.message}`);
    });

async function saveState(
  db: ServiceClient,
  orgId: string,
  fields: Omit<Database["public"]["Tables"]["org_idle"]["Insert"], "organization_id">,
) {
  const { error } = await db
    .from("org_idle")
    .upsert(
      { organization_id: orgId, ...fields, updated_at: new Date().toISOString() },
      { onConflict: "organization_id" },
    );
  if (error) throw new Error(`idle: saving the state failed: ${error.message}`);
}

/**
 * The last time anyone in the organization used Waggle: the latest of each member's app visit
 * (user_activity, written by the dashboard layout at most hourly), sign-in (auth.users) and
 * action (audit_log rows they wrote), never before the organization was created.
 */
async function orgLastActive(
  db: ServiceClient,
  orgId: string,
  createdAt: string,
  tenantIds: string[],
): Promise<{ lastActive: Date; owners: { email: string; name: string | null }[] }> {
  const { data: team, error } = await db.rpc("organization_team", { p_org: orgId });
  if (error) throw new Error(`idle: reading the team failed: ${error.message}`);
  const members = team ?? [];
  const ids = members.map((m) => m.user_id);
  const [{ data: seen }, actions] = await Promise.all([
    ids.length
      ? db.from("user_activity").select("last_seen_at").in("user_id", ids)
      : Promise.resolve({ data: [] as { last_seen_at: string }[] }),
    ids.length && tenantIds.length
      ? db
          .from("audit_log")
          .select("created_at")
          .in("tenant_id", tenantIds)
          .in("actor", ids)
          .order("created_at", { ascending: false })
          .limit(1)
      : Promise.resolve({ data: [] as { created_at: string }[] }),
  ]);
  const lastActive =
    lastActiveAt([
      createdAt,
      ...members.map((m) => m.last_sign_in_at),
      ...(seen ?? []).map((s) => s.last_seen_at),
      ...(actions.data ?? []).map((a) => a.created_at),
    ]) ?? new Date(createdAt);
  const owners = members
    .filter((m) => m.role === "owner" && m.email)
    .map((m) => ({ email: m.email, name: m.full_name || null }));
  return { lastActive, owners };
}

async function checkOrg(
  deps: IdleSweepDeps,
  orgId: string,
  now: Date,
): Promise<IdleDecision["kind"] | "unsent"> {
  const { db } = deps;
  const [{ data: org }, { data: brands }, { data: state }, free] = await Promise.all([
    db.from("organizations").select("name, created_at").eq("id", orgId).maybeSingle(),
    db.from("tenants").select("id").eq("organization_id", orgId).is("offboarded_at", null),
    db.from("org_idle").select("*").eq("organization_id", orgId).maybeSingle(),
    orgIsFreeForIdle(db, orgId),
  ]);
  if (!org) return "none";
  const tenantIds = (brands ?? []).map((b) => b.id);
  const { data: accountRows, error: accErr } = tenantIds.length
    ? await db
        .from("social_accounts")
        .select("id, tenant_id, platform, username, zernio_account_id")
        .in("tenant_id", tenantIds)
        .eq("status", "active")
        .order("created_at")
    : { data: [] as OrgAccount[], error: null };
  if (accErr) throw new Error(`idle: reading accounts failed: ${accErr.message}`);
  const accounts: OrgAccount[] = accountRows ?? [];

  const { lastActive, owners } = await orgLastActive(db, orgId, org.created_at, tenantIds);
  const toDate = (s: string | null | undefined) => (s ? new Date(s) : null);
  const decision = decideIdle({
    now,
    lastActive,
    free,
    hasActiveAccounts: accounts.length > 0,
    state: {
      warnedAt: toDate(state?.warned_at),
      warnedForActiveAt: toDate(state?.warned_for_active_at),
    },
  });
  const checked = { checked_at: now.toISOString(), last_active_at: lastActive.toISOString() };

  switch (decision.kind) {
    case "none":
      await saveState(db, orgId, checked);
      return "none";

    case "clear":
      await saveState(db, orgId, {
        ...checked,
        warned_at: null,
        warned_for_active_at: null,
        disconnect_on: null,
      });
      await orgAudit(db, orgId, "idle.warning_cleared", {
        reason: free ? (accounts.length ? "came_back" : "nothing_connected") : "on_a_plan",
      });
      return "clear";

    case "warn": {
      // No owner to tell: never disconnect without a warning, so wait.
      if (!owners.length) {
        await saveState(db, orgId, checked);
        return "unsent";
      }
      const named = accounts.map((a) => ({
        platformLabel: platformLabel(a.platform),
        username: a.username,
      }));
      for (const owner of owners) {
        const email = idleWarningEmail({
          orgName: org.name,
          firstName: owner.name?.trim().split(/\s+/)[0] ?? null,
          accounts: named,
          daysAway: decision.days,
          disconnectOn: decision.disconnectOn,
          now,
          appUrl: deps.appUrl,
        });
        await deps.mailer.send({
          to: [owner.email],
          ...email,
          // Once per stretch away, per owner, even if the row below fails to save.
          idempotencyKey: `idle-warning:${orgId}:${lastActive.toISOString()}:${owner.email}`,
        });
      }
      await saveState(db, orgId, {
        ...checked,
        warned_at: now.toISOString(),
        warned_for_active_at: lastActive.toISOString(),
        disconnect_on: decision.disconnectOn.toISOString(),
      });
      await orgAudit(db, orgId, "idle.warning_sent", {
        days: decision.days,
        accounts: accounts.length,
        owners: owners.length,
        disconnectOn: decision.disconnectOn.toISOString(),
      });
      for (const tenantId of new Set(accounts.map((a) => a.tenant_id))) {
        await writeAudit(db, {
          tenantId,
          action: "idle_warning_sent",
          actor: "system",
          details: { days: decision.days, disconnectOn: decision.disconnectOn.toISOString() },
        });
      }
      return "warn";
    }

    case "disconnect": {
      // Zernio paused on our side: nothing can be removed now; try again tomorrow.
      if (await getPlatformPause(db)) {
        await saveState(db, orgId, checked);
        return "none";
      }
      const social = deps.social();
      const done: string[] = [];
      let failed = 0;
      for (const a of accounts) {
        try {
          // Removed from Zernio first (it stops charging). Already gone counts as done, so a
          // failure below is safe to repeat tomorrow.
          await social.disconnectAccount({
            accountId: a.zernio_account_id,
            signal: AbortSignal.timeout(JOB_EXTERNAL_TIMEOUT_MS),
          });
        } catch (e) {
          failed += 1;
          Sentry.captureException(e, {
            extra: { orgId, accountId: a.id, step: "idle-disconnect" },
          });
          continue;
        }
        const { error } = await db
          .from("social_accounts")
          .update({ status: "disconnected" })
          .eq("id", a.id);
        if (error) throw new Error(`idle: marking the account failed: ${error.message}`);
        const paused = await pauseAccountItems(db, {
          tenantId: a.tenant_id,
          socialAccountId: a.id,
          reason: "idle_disconnect",
        });
        await writeAudit(db, {
          tenantId: a.tenant_id,
          action: "account_disconnected",
          actor: "system",
          details: {
            accountId: a.id,
            zernioAccountId: a.zernio_account_id,
            via: "idle",
            reason: "free_plan_30_days_away",
            daysAway: decision.days,
            pausedItems: paused.length,
          },
        });
        done.push(a.id);
      }
      // Some failed: the warning stays, so the rest are tried on tomorrow's check.
      const sameRun =
        !!state?.disconnected_at &&
        !!state.warned_at &&
        Date.parse(state.disconnected_at) >= Date.parse(state.warned_at);
      const ids = [
        ...new Set([...(sameRun ? (state?.disconnected_account_ids ?? []) : []), ...done]),
      ];
      await saveState(db, orgId, {
        ...checked,
        ...(done.length
          ? {
              disconnected_at: now.toISOString(),
              disconnected_account_ids: ids,
              notice_dismissed_at: null,
            }
          : {}),
        ...(failed === 0
          ? { warned_at: null, warned_for_active_at: null, disconnect_on: null }
          : {}),
      });
      await orgAudit(db, orgId, "idle.disconnected", {
        days: decision.days,
        disconnected: done.length,
        failed,
      });
      return done.length ? "disconnect" : "unsent";
    }
  }
}

/** The jobs route step: a few organizations per run, each at most once a day. */
export async function sweepIdleOrgs(deps: IdleSweepDeps): Promise<IdleSweepSummary> {
  const summary: IdleSweepSummary = {
    checked: 0,
    warned: 0,
    disconnected: 0,
    cleared: 0,
    failed: 0,
  };
  const { db } = deps;
  if (!(await idleDisconnectOn(db))) return { ...summary, off: true };
  const now = deps.now ?? new Date();
  const { data, error } = await db.rpc("idle_check_candidates", {
    p_checked_before: new Date(now.getTime() - CHECK_EVERY_MS).toISOString(),
    p_limit: deps.limit ?? 10,
  });
  if (error) throw new Error(`idle: finding organizations failed: ${error.message}`);
  for (const { organization_id: orgId } of data ?? []) {
    if (!deps.shouldContinue()) break;
    try {
      const kind = await checkOrg(deps, orgId, now);
      summary.checked += 1;
      if (kind === "warn") summary.warned += 1;
      if (kind === "disconnect") summary.disconnected += 1;
      if (kind === "clear") summary.cleared += 1;
    } catch (e) {
      summary.failed += 1;
      Sentry.captureException(e, { extra: { orgId, step: "idle-sweep" } });
      // Checked anyway, so one broken organization isn't retried every minute.
      await saveState(db, orgId, { checked_at: now.toISOString() }).catch(() => undefined);
    }
  }
  return summary;
}
