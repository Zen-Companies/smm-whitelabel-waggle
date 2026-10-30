import { transitionItem } from "@/features/inbox";
import { writeAudit } from "@/lib/audit";
import type { ServiceClient } from "@/lib/supabase/service";
import { REPLY_MAX } from "./limits";

// Owner decisions on a waiting draft (PRD F8, docs/tdd.md §7.3). The Server Actions resolve the
// signed-in owner's tenant; everything here is scoped to that tenant id, so a draft or item id
// from another tenant is simply not found.

export { REPLY_MAX };

export type DecisionResult =
  { ok: true } | { ok: false; error: "not_found" | "already_decided" | "empty_reply" | "too_long" };

interface DecisionInput {
  tenantId: string;
  userId: string;
  itemId: string;
  draftId: string;
}

async function loadDecidable(db: ServiceClient, input: DecisionInput) {
  const [{ data: item }, { data: draft }] = await Promise.all([
    db
      .from("inbound_items")
      .select("id, status")
      .eq("id", input.itemId)
      .eq("tenant_id", input.tenantId)
      .maybeSingle(),
    db
      .from("drafts")
      .select("id, body, status")
      .eq("id", input.draftId)
      .eq("item_id", input.itemId)
      .eq("tenant_id", input.tenantId)
      .maybeSingle(),
  ]);
  return { item, draft };
}

/**
 * Approve (optionally with an edit): the draft is marked approved first, then the item moves to
 * `sending` for the send step. If the request dies in between, the item is still waiting with an
 * approved draft and approving again completes it.
 */
export async function approveDraft(
  db: ServiceClient,
  input: DecisionInput & { editedBody?: string | null },
): Promise<DecisionResult> {
  const { item, draft } = await loadDecidable(db, input);
  if (!item || !draft) return { ok: false, error: "not_found" };
  if (item.status !== "awaiting_approval" || !["pending", "approved"].includes(draft.status)) {
    return { ok: false, error: "already_decided" };
  }

  const edited = input.editedBody?.trim();
  if (edited !== undefined && edited.length === 0) return { ok: false, error: "empty_reply" };
  if (edited && edited.length > REPLY_MAX) return { ok: false, error: "too_long" };
  const isEdit = edited !== undefined && edited !== draft.body.trim();

  if (draft.status === "pending") {
    const { data: updated, error } = await db
      .from("drafts")
      .update({
        status: "approved",
        edited_body: isEdit ? edited : null,
        decided_by: input.userId,
        decided_at: new Date().toISOString(),
      })
      .eq("id", draft.id)
      .eq("status", "pending")
      .select("id");
    if (error) throw new Error(`approving draft failed: ${error.message}`);
    if (!updated.length) return { ok: false, error: "already_decided" };
    if (isEdit) {
      await writeAudit(db, {
        tenantId: input.tenantId,
        itemId: item.id,
        action: "draft_edited",
        actor: input.userId,
        details: { draftId: draft.id },
      });
    }
    await writeAudit(db, {
      tenantId: input.tenantId,
      itemId: item.id,
      action: "draft_approved",
      actor: input.userId,
      details: { draftId: draft.id, edited: isEdit },
    });
  }

  const { applied } = await transitionItem(db, {
    itemId: item.id,
    from: "awaiting_approval",
    event: "send",
    details: { draftId: draft.id, decidedBy: input.userId },
  });
  if (!applied) return { ok: false, error: "already_decided" };
  // Held for the undo window (design.md §4): the job runner won't pick it up before then.
  await db
    .from("inbound_items")
    .update({ next_run_at: new Date(Date.now() + UNDO_WINDOW_MS).toISOString() })
    .eq("id", item.id)
    .eq("status", "sending");
  return { ok: true };
}

/** Reject: the item is closed without sending, then the draft is marked rejected. */
export async function rejectDraft(
  db: ServiceClient,
  input: DecisionInput,
): Promise<DecisionResult> {
  const { item, draft } = await loadDecidable(db, input);
  if (!item || !draft) return { ok: false, error: "not_found" };
  if (item.status !== "awaiting_approval") return { ok: false, error: "already_decided" };

  const { applied } = await transitionItem(db, {
    itemId: item.id,
    from: "awaiting_approval",
    event: "reject",
    details: { draftId: draft.id, decidedBy: input.userId },
  });
  if (!applied) return { ok: false, error: "already_decided" };

  const { error } = await db
    .from("drafts")
    .update({ status: "rejected", decided_by: input.userId, decided_at: new Date().toISOString() })
    .eq("id", draft.id)
    .in("status", ["pending", "approved"]);
  if (error) throw new Error(`rejecting draft failed: ${error.message}`);
  await writeAudit(db, {
    tenantId: input.tenantId,
    itemId: item.id,
    action: "draft_rejected",
    actor: input.userId,
    details: { draftId: draft.id },
  });
  return { ok: true };
}

/** How long the "Sent" row offers Undo (docs/design.md §4). */
export const UNDO_WINDOW_MS = 8_000;

/**
 * Undo an approval within a few seconds, while the reply hasn't started going out: the item goes
 * back to waiting and the draft to pending. Refused once the send step has picked it up (locked
 * or an attempt recorded), so a reply that may be on its way is never "undone" in the app only.
 */
export async function undoApproval(
  db: ServiceClient,
  input: DecisionInput & { now?: Date },
): Promise<DecisionResult> {
  const now = input.now ?? new Date();
  const [{ data: item }, { data: draft }] = await Promise.all([
    db
      .from("inbound_items")
      .select("id, status, locked_at")
      .eq("id", input.itemId)
      .eq("tenant_id", input.tenantId)
      .maybeSingle(),
    db
      .from("drafts")
      .select("id, status, decided_at, send_attempted_at")
      .eq("id", input.draftId)
      .eq("item_id", input.itemId)
      .eq("tenant_id", input.tenantId)
      .maybeSingle(),
  ]);
  if (!item || !draft) return { ok: false, error: "not_found" };
  const recent =
    draft.decided_at &&
    now.getTime() - new Date(draft.decided_at).getTime() <= UNDO_WINDOW_MS + 2_000;
  if (
    item.status !== "sending" ||
    draft.status !== "approved" ||
    draft.send_attempted_at ||
    item.locked_at ||
    !recent
  ) {
    return { ok: false, error: "already_decided" };
  }
  const { applied } = await transitionItem(db, {
    itemId: item.id,
    from: "sending",
    event: "await_approval",
    details: { draftId: draft.id, undoneBy: input.userId },
  });
  if (!applied) return { ok: false, error: "already_decided" };
  await db
    .from("drafts")
    .update({ status: "pending", decided_by: null, decided_at: null, edited_body: null })
    .eq("id", draft.id)
    .eq("status", "approved");
  await writeAudit(db, {
    tenantId: input.tenantId,
    itemId: item.id,
    action: "draft_approval_undone",
    actor: input.userId,
    details: { draftId: draft.id },
  });
  return { ok: true };
}

/** The owner dealt with an escalated or failed item themselves: it leaves "Needs you". */
export async function markHandled(
  db: ServiceClient,
  /** asSpam: "It's spam: hide it" on a message Waggle wasn't sure about. */
  input: { tenantId: string; userId: string; itemId: string; asSpam?: boolean },
): Promise<DecisionResult> {
  const { data: item } = await db
    .from("inbound_items")
    .select("id, status")
    .eq("id", input.itemId)
    .eq("tenant_id", input.tenantId)
    .maybeSingle();
  if (!item) return { ok: false, error: "not_found" };
  if (item.status !== "escalated" && item.status !== "failed") {
    return { ok: false, error: "already_decided" };
  }
  const { applied } = await transitionItem(db, {
    itemId: item.id,
    from: item.status,
    event: "handle",
    details: { handledBy: input.userId, ...(input.asSpam ? { hiddenAsSpam: true } : {}) },
  });
  if (!applied) return { ok: false, error: "already_decided" };
  await writeAudit(db, {
    tenantId: input.tenantId,
    itemId: item.id,
    action: input.asSpam ? "item_hidden_as_spam" : "item_handled",
    actor: input.userId,
    details: {},
  });
  return { ok: true };
}
