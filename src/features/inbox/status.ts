import type { ServiceClient } from "@/lib/supabase/service";

// The only module that changes inbound_items.status (CLAUDE.md rule 5). T6 adds nextStatus()
// for the processing steps; this covers the account-driven pause and resume (docs/tdd.md §6).

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

export interface AccountTransition {
  tenantId: string;
  socialAccountId: string;
  /** Stored in each item's status_changed audit row, e.g. "account_disconnected". */
  reason: string;
}

async function transition(
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
  return transition(db, input, PAUSABLE_STATUSES, "paused");
}

/** Account active again: paused items start over from `new`. */
export function resumeAccountItems(db: ServiceClient, input: AccountTransition) {
  return transition(db, input, ["paused"], "new");
}
