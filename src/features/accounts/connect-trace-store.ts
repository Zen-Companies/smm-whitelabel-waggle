// Fix 1: record every connect (24 Nov). The connect_attempts rows: one when a sign-in starts,
// closed by the return, by the account arriving (webhook or reconcile), or by the sweep after
// 2 hours. Failed, accountless and abandoned ones are audited and told to the CRM
// (connect_failed, at most once per brand + platform per 6 hours). Database writes only.

import * as Sentry from "@sentry/nextjs";
import { writeAudit } from "@/lib/audit";
import { queueCrmEvent } from "@/lib/crm";
import type { ServiceClient } from "@/lib/supabase/service";
import {
  abandonedBefore,
  auditActionFor,
  classifyUserAgent,
  connectFailedDetails,
  mayQueueConnectFailed,
  returnOutcome,
  storedUserAgent,
  type ConnectOutcomeKind,
  type ConnectReturn,
} from "./connect-trace";

/** Look this far back for the attempt an arriving account closes. */
const CONNECTED_LOOKBACK_MS = 24 * 60 * 60 * 1000;

type AttemptRow = {
  id: string;
  tenant_id: string;
  organization_id: string | null;
  user_id: string | null;
  platform: string;
  error: string | null;
  error_reason: string | null;
  error_message: string | null;
  is_user_fixable: boolean | null;
  stage: string | null;
  user_agent_class: string | null;
  zernio_request_id: string | null;
};

const ATTEMPT_COLUMNS =
  "id, tenant_id, organization_id, user_id, platform, error, error_reason, error_message, is_user_fixable, stage, user_agent_class, zernio_request_id";

/** A sign-in is starting (where account_connect_started is audited). Returns the row id. */
export async function recordConnectStart(
  db: ServiceClient,
  input: {
    tenantId: string;
    organizationId: string | null;
    userId: string;
    platform: string;
    mode: string;
    userAgent: string | null;
    now?: Date;
  },
): Promise<string> {
  const { data, error } = await db
    .from("connect_attempts")
    .insert({
      tenant_id: input.tenantId,
      organization_id: input.organizationId,
      user_id: input.userId,
      platform: input.platform,
      mode: input.mode,
      started_at: (input.now ?? new Date()).toISOString(),
      user_agent_class: classifyUserAgent(input.userAgent),
      user_agent: storedUserAgent(input.userAgent),
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`connect_attempts insert failed: ${error?.message}`);
  return data.id;
}

/** Never let the trace stop a connect: failures go to Sentry only (ids, no text). */
export async function traceQuietly(work: () => Promise<unknown>): Promise<void> {
  try {
    await work();
  } catch (err) {
    Sentry.captureException(err, { tags: { area: "connect-trace" } });
  }
}

/** The audit row and the CRM event for a failed, accountless or abandoned attempt. */
async function reportProblem(
  db: ServiceClient,
  row: AttemptRow,
  outcome: ConnectOutcomeKind,
  actor: string,
  now: Date,
): Promise<void> {
  const action = auditActionFor(outcome);
  if (!action) return;
  await writeAudit(db, {
    tenantId: row.tenant_id,
    action,
    actor,
    details: {
      attemptId: row.id,
      platform: row.platform,
      outcome,
      error: row.error,
      errorReason: row.error_reason,
      errorMessage: row.error_message,
      isUserFixable: row.is_user_fixable,
      stage: row.stage,
      zernioRequestId: row.zernio_request_id,
      userAgentClass: row.user_agent_class,
    },
  });
  if (!row.user_id) return;
  const userId = row.user_id;
  // At most once per brand + platform per 6 hours.
  await traceQuietly(async () => {
    const { data: last, error } = await db
      .from("crm_events")
      .select("created_at")
      .eq("event", "connect_failed")
      .eq("details->>tenant_id", row.tenant_id)
      .eq("details->>platform", row.platform)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`crm: connect_failed lookup failed: ${error.message}`);
    if (!mayQueueConnectFailed(last?.created_at ?? null, now)) return;
    await queueCrmEvent(db, {
      event: "connect_failed",
      userId,
      orgId: row.organization_id,
      details: {
        tenant_id: row.tenant_id,
        ...connectFailedDetails({
          platform: row.platform,
          outcome,
          error: row.error,
          isUserFixable: row.is_user_fixable,
          userAgentClass: row.user_agent_class,
        }),
      },
      dedupeKey: `connect_failed:${row.id}`,
    });
  });
}

/**
 * The sign-in came back (any page with the connect's params). Closes the brand's most recent
 * open attempt for that platform with the outcome and every error field Zernio sent. A repeat
 * (a reload) finds nothing open and does nothing. Returns the outcome, or null.
 */
export async function recordConnectReturn(
  db: ServiceClient,
  input: {
    tenantId: string;
    userId: string;
    ret: ConnectReturn;
    userAgent: string | null;
    now?: Date;
  },
): Promise<ConnectOutcomeKind | null> {
  const now = input.now ?? new Date();
  const { ret } = input;
  const { data: open, error } = await db
    .from("connect_attempts")
    .select("id, user_agent_class")
    .eq("tenant_id", input.tenantId)
    .eq("platform", ret.platform)
    .is("outcome", null)
    .is("returned_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`connect_attempts lookup failed: ${error.message}`);
  if (!open) return null;

  const { count } = await db
    .from("social_accounts")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", input.tenantId)
    .eq("platform", ret.platform)
    .eq("status", "active");
  const outcome = returnOutcome(ret, (count ?? 0) > 0);

  const { data: updated, error: updateError } = await db
    .from("connect_attempts")
    .update({
      returned_at: now.toISOString(),
      outcome,
      outcome_at: now.toISOString(),
      error: ret.error,
      error_reason: ret.errorReason,
      error_message: ret.errorMessage,
      is_user_fixable: ret.isUserFixable,
      stage: ret.stage,
      step: ret.step,
      platform_error: ret.platformError,
      zernio_request_id: ret.requestId,
      zernio_account_id: ret.accountId,
      zernio_profile_id: ret.profileId,
      connect_token: ret.connectToken,
      // The start's browser is the one that matters; the return's fills a gap only.
      ...(open.user_agent_class
        ? {}
        : {
            user_agent_class: classifyUserAgent(input.userAgent),
            user_agent: storedUserAgent(input.userAgent),
          }),
    })
    .eq("id", open.id)
    .is("outcome", null)
    .select(ATTEMPT_COLUMNS);
  if (updateError) throw new Error(`connect_attempts update failed: ${updateError.message}`);
  const row = updated?.[0] as AttemptRow | undefined;
  if (!row) return null; // another request closed it first
  await reportProblem(db, row, outcome, input.userId, now);
  return outcome;
}

/**
 * The account arrived (webhook, reconcile, health check): the brand's most recent attempt for
 * the platform in the last day that isn't closed as connected or failed becomes connected.
 */
export async function markConnectConnected(
  db: ServiceClient,
  input: { tenantId: string; platform: string; zernioAccountId: string; now?: Date },
): Promise<void> {
  const now = input.now ?? new Date();
  const since = new Date(now.getTime() - CONNECTED_LOOKBACK_MS).toISOString();
  const { data: open, error } = await db
    .from("connect_attempts")
    .select("id")
    .eq("tenant_id", input.tenantId)
    .eq("platform", input.platform)
    .gte("started_at", since)
    .or("outcome.is.null,outcome.in.(returned_without_account,abandoned)")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`connect_attempts lookup failed: ${error.message}`);
  if (!open) return;
  await db
    .from("connect_attempts")
    .update({
      outcome: "connected",
      outcome_at: now.toISOString(),
      zernio_account_id: input.zernioAccountId,
    })
    .eq("id", open.id);
}

/** Sweep (jobs route): attempts with no return after 2 hours are abandoned. */
export async function sweepAbandonedConnects(
  db: ServiceClient,
  now: Date = new Date(),
): Promise<number> {
  const { data: due, error } = await db
    .from("connect_attempts")
    .select("id")
    .is("outcome", null)
    .is("returned_at", null)
    .lt("started_at", abandonedBefore(now).toISOString())
    .order("started_at")
    .limit(100);
  if (error) throw new Error(`connect_attempts sweep failed: ${error.message}`);
  let marked = 0;
  for (const { id } of due ?? []) {
    const { data: updated } = await db
      .from("connect_attempts")
      .update({ outcome: "abandoned", outcome_at: now.toISOString() })
      .eq("id", id)
      .is("outcome", null)
      .select(ATTEMPT_COLUMNS);
    const row = updated?.[0] as AttemptRow | undefined;
    if (!row) continue;
    await reportProblem(db, row, "abandoned", "system", now);
    marked += 1;
  }
  return marked;
}
