import type { Json } from "@/lib/supabase/database.types";
import type { ServiceClient } from "@/lib/supabase/service";

// The only module that changes inbound_items.status (CLAUDE.md rule 5). nextStatus() holds the
// state machine (docs/tdd.md §6); every write goes through a transition below.

export const ITEM_STATUSES = [
  "new",
  "classified",
  "drafted",
  "awaiting_approval",
  "sending",
  "sent",
  "rejected",
  "ignored",
  "escalated",
  "paused",
  "failed",
] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

/**
 * Items the job would still process. awaiting_approval keeps its draft (the send step refuses a
 * non-active account), and sending/terminal items are never paused.
 */
export const PAUSABLE_STATUSES = ["new", "classified", "drafted"] as const satisfies ItemStatus[];

/** Statuses the job runner works on, each with one step (classify, draft, policy, send). */
export const PROCESSING_STATUSES = [
  "new",
  "classified",
  "drafted",
  "sending",
] as const satisfies ItemStatus[];
export type ProcessingStatus = (typeof PROCESSING_STATUSES)[number];

export type StatusEvent =
  /** classify step finished */
  | "classified"
  /** draft step finished */
  | "drafted"
  /** spam */
  | "ignore"
  /** complaint/unclear, mode off, policy failed, DM window closed */
  | "escalate"
  /** policy: approve first (also at send time, if the mode changed after an auto-approval) */
  | "await_approval"
  /** policy auto, or the owner approved */
  | "send"
  | "sent"
  | "reject"
  /** tenant unpaid or account disconnected */
  | "pause"
  | "resume"
  /** retries exhausted */
  | "fail"
  /** the platform reported a sent reply as undelivered (message.failed) */
  | "delivery_failed";

const TRANSITIONS: Record<ItemStatus, Partial<Record<StatusEvent, ItemStatus>>> = {
  new: { classified: "classified", pause: "paused", escalate: "escalated", fail: "failed" },
  classified: {
    drafted: "drafted",
    ignore: "ignored",
    escalate: "escalated",
    pause: "paused",
    fail: "failed",
  },
  drafted: {
    await_approval: "awaiting_approval",
    send: "sending",
    escalate: "escalated",
    ignore: "ignored",
    pause: "paused",
    fail: "failed",
  },
  awaiting_approval: { send: "sending", reject: "rejected", escalate: "escalated" },
  sending: {
    sent: "sent",
    escalate: "escalated",
    fail: "failed",
    await_approval: "awaiting_approval",
  },
  paused: { resume: "new" },
  sent: { delivery_failed: "failed" },
  rejected: {},
  ignored: {},
  escalated: {},
  failed: {},
};

/** The status after `event`, or null if the event isn't allowed from `current`. Pure. */
export function nextStatus(current: ItemStatus, event: StatusEvent): ItemStatus | null {
  return TRANSITIONS[current][event] ?? null;
}

export class InvalidTransitionError extends Error {
  constructor(from: ItemStatus, event: StatusEvent) {
    super(`no transition from ${from} on ${event}`);
    this.name = "InvalidTransitionError";
  }
}

/**
 * Applies `event` to one item that is in `from`: status, lock release, retry reset (attempts
 * count per step) and the status_changed audit row in one statement. Returns false if the item had already moved on (stale `from`).
 */
export async function transitionItem(
  db: ServiceClient,
  input: {
    itemId: string;
    from: ItemStatus;
    event: StatusEvent;
    details?: { [key: string]: Json | undefined };
    /** Keep the lock: the runner goes straight on to the next step. */
    keepLock?: boolean;
  },
): Promise<{ to: ItemStatus; applied: boolean }> {
  const to = nextStatus(input.from, input.event);
  if (!to) throw new InvalidTransitionError(input.from, input.event);
  const { data, error } = await db.rpc("transition_item", {
    p_item_id: input.itemId,
    p_from: input.from,
    p_to: to,
    p_reason: input.event,
    p_details: (input.details ?? {}) as Json,
    p_keep_lock: input.keepLock ?? false,
  });
  if (error) throw new Error(`transition_item failed: ${error.message}`);
  return { to, applied: data === true };
}

export interface AccountTransition {
  tenantId: string;
  socialAccountId: string;
  /** Stored in each item's status_changed audit row, e.g. "account_disconnected". */
  reason: string;
}

async function transitionAccount(
  db: ServiceClient,
  input: AccountTransition,
  from: readonly ItemStatus[],
  to: ItemStatus,
): Promise<{ itemId: string; from: ItemStatus }[]> {
  const { data, error } = await db.rpc("transition_account_items", {
    p_tenant_id: input.tenantId,
    p_social_account_id: input.socialAccountId,
    p_from: [...from],
    p_to: to,
    p_reason: input.reason,
  });
  if (error) throw new Error(`transition_account_items failed: ${error.message}`);
  return data.map((row) => ({ itemId: row.item_id, from: row.from_status as ItemStatus }));
}

/** Account disconnected: its open items wait (one audit row per item). */
export function pauseAccountItems(db: ServiceClient, input: AccountTransition) {
  return transitionAccount(db, input, PAUSABLE_STATUSES, "paused");
}

/** Account active again: paused items start over from `new`. */
export function resumeAccountItems(db: ServiceClient, input: AccountTransition) {
  return transitionAccount(db, input, ["paused"], "new");
}
