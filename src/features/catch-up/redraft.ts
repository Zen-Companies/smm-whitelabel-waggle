import { transitionItem } from "@/features/inbox";
import { writeAudit } from "@/lib/audit";
import type { ServiceClient } from "@/lib/supabase/service";
import { pickRedrafts } from "./reveal-rules";

// First connect (20 Nov): when the owner saves, edits or deletes an answer, the pulled drafts
// still waiting for approval that it could change are written again. Bounded (REDRAFT_MAX per
// change): the old draft is superseded and the item goes back to the draft step
// (awaiting_approval → classified, its draft request kept), which the job runs shortly after the
// new answer has been embedded.

/** Give the new answer's embedding a head start before the draft step looks for it. */
export const REDRAFT_DELAY_MS = 90_000;

export async function redraftAfterAnswerChange(
  db: ServiceClient,
  input: {
    tenantId: string;
    /** The changed or deleted answer; null for a new one. */
    kbEntryId: string | null;
    /** A changed business name: only the drafts that say this (the old name) are written again. */
    mentions?: string;
    actor: string;
    now?: Date;
  },
): Promise<number> {
  const now = input.now ?? new Date();
  const { data: items, error } = await db
    .from("inbound_items")
    .select("id")
    .eq("tenant_id", input.tenantId)
    .eq("status", "awaiting_approval")
    .not("catch_up_id", "is", null)
    .limit(200);
  if (error) throw new Error(`redraft items lookup failed: ${error.message}`);
  if (!items?.length) return 0;
  const { data: drafts, error: draftsError } = await db
    .from("drafts")
    .select("id, item_id, body, edited_body, kb_entry_ids, needs_human, created_at")
    .eq("tenant_id", input.tenantId)
    .eq("status", "pending")
    .in(
      "item_id",
      items.map((i) => i.id),
    );
  if (draftsError) throw new Error(`redraft drafts lookup failed: ${draftsError.message}`);

  const picked = pickRedrafts(
    (drafts ?? []).map((d) => ({
      id: d.id,
      itemId: d.item_id,
      kbEntryIds: d.kb_entry_ids,
      needsHuman: d.needs_human,
      createdAt: d.created_at,
      body: d.edited_body ?? d.body,
    })),
    input.kbEntryId,
    input.mentions,
  );
  let redrafted = 0;
  for (const p of picked) {
    const { data: superseded } = await db
      .from("drafts")
      .update({ status: "superseded" })
      .eq("id", p.id)
      .eq("status", "pending")
      .select("id");
    if (!superseded?.length) continue;
    const { applied } = await transitionItem(db, {
      itemId: p.itemId,
      from: "awaiting_approval",
      event: "redraft",
      details: { draftId: p.id, kbEntryId: input.kbEntryId },
    });
    if (!applied) {
      // Decided meanwhile (approved, sent): its draft stands.
      await db.from("drafts").update({ status: "pending" }).eq("id", p.id);
      continue;
    }
    await db
      .from("inbound_items")
      .update({ next_run_at: new Date(now.getTime() + REDRAFT_DELAY_MS).toISOString() })
      .eq("id", p.itemId)
      .eq("status", "classified");
    redrafted += 1;
  }
  if (redrafted > 0) {
    await writeAudit(db, {
      tenantId: input.tenantId,
      action: "catch_up_redraft",
      actor: input.actor,
      details: { kbEntryId: input.kbEntryId, redrafted, ...(input.mentions ? { why: "name" } : {}) },
    });
  }
  return redrafted;
}
