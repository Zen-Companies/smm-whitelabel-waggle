// Job runner helpers (docs/tdd.md §7.2, §14). Pure except claimItems/enqueue.
import type { ServiceClient } from "@/lib/supabase/service";

/** Vercel maxDuration for /api/jobs/process. Cron fires every minute, so runs don't overlap. */
export const JOB_MAX_DURATION_MS = 60_000;
/** Stop claiming new batches after this much of the run. */
export const JOB_CLAIM_UNTIL_MS = 45_000;
/** Only start an item if at least this much of the run is left. */
export const JOB_MIN_ITEM_MS = 20_000;
/** Cap for any Zernio or LLM call made by a job step (Jev keeps its own 3 s). */
export const JOB_EXTERNAL_TIMEOUT_MS = 20_000;
export const JOB_BATCH_SIZE = 20;
/** Attempts per item before it fails and escalates (§14). */
export const MAX_ATTEMPTS = 3;

export interface Deadline {
  elapsedMs(): number;
  remainingMs(): number;
  canClaim(): boolean;
  canStartItem(): boolean;
}

export function createDeadline(
  opts: {
    maxMs?: number;
    claimUntilMs?: number;
    minItemMs?: number;
    now?: () => number;
  } = {},
): Deadline {
  const now = opts.now ?? Date.now;
  const maxMs = opts.maxMs ?? JOB_MAX_DURATION_MS;
  const claimUntilMs = opts.claimUntilMs ?? JOB_CLAIM_UNTIL_MS;
  const minItemMs = opts.minItemMs ?? JOB_MIN_ITEM_MS;
  const startedAt = now();
  const elapsedMs = () => now() - startedAt;
  const remainingMs = () => Math.max(0, maxMs - elapsedMs());
  return {
    elapsedMs,
    remainingMs,
    canStartItem: () => remainingMs() >= minItemMs,
    canClaim: () => elapsedMs() < claimUntilMs && remainingMs() >= minItemMs,
  };
}

/** next_run_at delay after a failed attempt: 2^attempts minutes (§14). */
export function backoffDelayMs(attempts: number): number {
  return 2 ** attempts * 60_000;
}

/**
 * Thrown by a step when an external service asks us to wait (429 Retry-After). The item is
 * rescheduled without counting an attempt (§14).
 */
export class RetryLaterError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super(`retry after ${retryAfterSeconds}s`);
    this.name = "RetryLaterError";
  }
}

export interface ClaimedItem {
  id: string;
  tenantId: string;
  socialAccountId: string;
  kind: "comment" | "dm";
  status: string;
  attempts: number;
  accountStatus: string;
}

export async function claimItems(
  db: ServiceClient,
  limit = JOB_BATCH_SIZE,
): Promise<ClaimedItem[]> {
  const { data, error } = await db.rpc("claim_items", { p_limit: limit });
  if (error) throw new Error(`claim_items failed: ${error.message}`);
  return data.map((r) => ({
    id: r.id,
    tenantId: r.tenant_id,
    socialAccountId: r.social_account_id,
    kind: r.kind as ClaimedItem["kind"],
    status: r.status,
    attempts: r.attempts,
    accountStatus: r.account_status,
  }));
}

/** Releases locks without touching status, so the next tick picks the items up at once. */
export async function releaseItems(db: ServiceClient, itemIds: string[]): Promise<void> {
  if (itemIds.length === 0) return;
  const { error } = await db.from("inbound_items").update({ locked_at: null }).in("id", itemIds);
  if (error) throw new Error(`releasing items failed: ${error.message}`);
}

/** Schedules an item's next step (sets next_run_at). Temporal can replace this later. */
export async function enqueue(
  db: ServiceClient,
  itemId: string,
  opts: { runAt?: Date } = {},
): Promise<void> {
  const { error } = await db
    .from("inbound_items")
    .update({ next_run_at: (opts.runAt ?? new Date()).toISOString(), locked_at: null })
    .eq("id", itemId);
  if (error) throw new Error(`enqueue failed: ${error.message}`);
}
