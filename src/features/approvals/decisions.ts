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
  return applied ? { ok: true } : { ok: false, error: "already_decided" };
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
