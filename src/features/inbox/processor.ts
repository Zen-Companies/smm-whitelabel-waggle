import * as Sentry from "@sentry/nextjs";
import { writeAudit } from "@/lib/audit";
import {
  backoffDelayMs,
  claimItems,
  JOB_BATCH_SIZE,
  JOB_EXTERNAL_TIMEOUT_MS,
  MAX_ATTEMPTS,
  releaseItems,
  RetryLaterError,
  type ClaimedItem,
  type Deadline,
} from "@/lib/jobs";
import type { Json } from "@/lib/supabase/database.types";
import type { ServiceClient } from "@/lib/supabase/service";
import {
  nextStatus,
  PAUSABLE_STATUSES,
  transitionItem,
  type ItemStatus,
  type ProcessingStatus,
  type StatusEvent,
} from "./status";

// Runs each due item's next step (docs/tdd.md §7.2). Steps do the work and return an event;
// only this module (via status.ts) moves the status.

export interface StepContext {
  db: ServiceClient;
  deadline: Deadline;
  /**
   * Signal for one Zernio or LLM call: aborts after JOB_EXTERNAL_TIMEOUT_MS (20 s) or when the
   * item's share of the run is used up, whichever is first. Jev keeps its own 3 s.
   */
  callSignal(): AbortSignal;
}

export interface StepResult {
  event: StatusEvent;
  /** Merged into the status_changed audit row: ids, scores, reasons. Never message text. */
  details?: { [key: string]: Json | undefined };
}

export type Step = (item: ClaimedItem, ctx: StepContext) => Promise<StepResult>;

/** One step per processing status: new → classify, classified → draft, drafted → policy, sending → send. */
export type Steps = Partial<Record<ProcessingStatus, Step>>;

export interface ProcessDeps {
  db: ServiceClient;
  steps: Steps;
  deadline: Deadline;
  now?: () => Date;
  /**
   * Defaults to claimItems (all tenants). Gets the statuses that have a step, so items waiting
   * for an unconfigured step don't take a tenant's slots (T6b). Tests narrow it to their tenant.
   */
  claim?: (db: ServiceClient, limit: number, statuses: string[]) => Promise<ClaimedItem[]>;
}

export interface ProcessSummary {
  claimed: number;
  advanced: number;
  retried: number;
  failed: number;
  paused: number;
  /** No step for that status yet (later tasks), or not enough time left to start it. */
  released: number;
}

export async function processDueItems(deps: ProcessDeps): Promise<ProcessSummary> {
  const summary: ProcessSummary = {
    claimed: 0,
    advanced: 0,
    retried: 0,
    failed: 0,
    paused: 0,
    released: 0,
  };
  const { db, deadline } = deps;
  // Items released for lack of a step would be claimed again in the same run; skip them.
  const seen = new Set<string>();

  const statuses = Object.keys(deps.steps);
  if (statuses.length === 0) return summary;
  const claim =
    deps.claim ??
    ((client: ServiceClient, limit: number, s: string[]) =>
      claimItems(client, limit, { statuses: s }));
  while (deadline.canClaim()) {
    const claimed = await claim(db, JOB_BATCH_SIZE, statuses);
    // An item handled earlier in this run (advanced to a status that is due again, or released)
    // waits for the next run: unlock it again instead of leaving it locked for 5 minutes.
    const again = claimed.filter((item) => seen.has(item.id)).map((item) => item.id);
    await releaseItems(db, again);
    const batch = claimed.filter((item) => !seen.has(item.id));
    if (batch.length === 0) break;
    summary.claimed += batch.length;

    for (let i = 0; i < batch.length; i++) {
      const item = batch[i];
      seen.add(item.id);
      if (!deadline.canStartItem()) {
        const rest = batch.slice(i).map((b) => b.id);
        await releaseItems(db, rest);
        summary.released += rest.length;
        return summary;
      }
      const outcome = await processItem(deps, item);
      summary[outcome] += 1;
    }
  }
  return summary;
}

type Outcome = "advanced" | "retried" | "failed" | "paused" | "released";

/**
 * Runs the item's steps back to back while there is time (new → classified → drafted → …), so a
 * message gets its draft within one run (PRD §7: about a minute). The item stays locked between
 * steps and is released when it reaches a status with no step, fails, or time runs short.
 */
async function processItem(deps: ProcessDeps, item: ClaimedItem): Promise<Outcome> {
  const { db, deadline } = deps;
  let status = item.status as ItemStatus;
  let attempts = item.attempts;

  // Policy step 1 (§11): a disconnected account's open items wait instead of being processed.
  if (
    item.accountStatus !== "active" &&
    (PAUSABLE_STATUSES as readonly string[]).includes(status)
  ) {
    await transitionItem(db, {
      itemId: item.id,
      from: status,
      event: "pause",
      details: { accountStatus: item.accountStatus },
    });
    return "paused";
  }

  let advanced = false;
  for (;;) {
    const step = deps.steps[status as ProcessingStatus];
    if (!step) {
      // Only reachable before the first step: transitions release the lock otherwise.
      if (!advanced) await releaseItems(db, [item.id]);
      return advanced ? "advanced" : "released";
    }

    const itemSignal = AbortSignal.timeout(Math.max(1, deadline.remainingMs()));
    const ctx: StepContext = {
      db,
      deadline,
      callSignal: () => AbortSignal.any([itemSignal, AbortSignal.timeout(JOB_EXTERNAL_TIMEOUT_MS)]),
    };

    let result: StepResult;
    try {
      result = await step({ ...item, status, attempts }, ctx);
    } catch (error) {
      return recordFailure(deps, { ...item, status, attempts }, status, error);
    }

    const to = nextStatus(status, result.event);
    const goOn =
      to !== null && deps.steps[to as ProcessingStatus] !== undefined && deadline.canStartItem();
    const { applied } = await transitionItem(db, {
      itemId: item.id,
      from: status,
      event: result.event,
      details: { ...result.details, attempts },
      keepLock: goOn,
    });
    advanced = true;
    // Moved by someone else meanwhile (stale status): stop here.
    if (!applied || !goOn || !to) return "advanced";
    status = to;
    attempts = 0;
  }
}

async function recordFailure(
  deps: ProcessDeps,
  item: ClaimedItem,
  status: ItemStatus,
  error: unknown,
): Promise<Outcome> {
  const { db } = deps;
  const now = deps.now?.() ?? new Date();

  if (error instanceof RetryLaterError) {
    // Rate limited: wait as asked, don't count an attempt (§14).
    await db
      .from("inbound_items")
      .update({
        next_run_at: new Date(now.getTime() + error.retryAfterSeconds * 1000).toISOString(),
        locked_at: null,
      })
      .eq("id", item.id);
    return "retried";
  }

  // Error messages come from our code and adapters (ids, status codes), never message text.
  const message = (
    error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  ).slice(0, 500);
  const attempts = item.attempts + 1;
  Sentry.captureException(error, { extra: { itemId: item.id, status, attempts } });

  if (attempts >= MAX_ATTEMPTS) {
    await transitionItem(db, {
      itemId: item.id,
      from: status,
      event: "fail",
      details: { attempts, step: status },
    });
    // After the transition, which resets the retry state, so the failed row keeps both.
    await db.from("inbound_items").update({ attempts, last_error: message }).eq("id", item.id);
    // The owner email is T13; the audit row marks the escalation.
    await writeAudit(db, {
      tenantId: item.tenantId,
      itemId: item.id,
      action: "escalated",
      actor: "system",
      details: { reason: "retries_exhausted", attempts, step: status },
    });
    return "failed";
  }

  await db
    .from("inbound_items")
    .update({
      attempts,
      last_error: message,
      next_run_at: new Date(now.getTime() + backoffDelayMs(attempts)).toISOString(),
      locked_at: null,
    })
    .eq("id", item.id);
  return "retried";
}
