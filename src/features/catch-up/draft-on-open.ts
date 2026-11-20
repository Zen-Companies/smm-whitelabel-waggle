import { processDueItems, transitionItem, type Steps } from "@/features/inbox";
import { writeAudit } from "@/lib/audit";
import { claimItem, createDeadline } from "@/lib/jobs";
import type { ServiceClient } from "@/lib/supabase/service";
import { requestDraft } from "./finish";

// First connect (20 Nov): "draft on open". A pulled question or lead past the reveal's
// REVEAL_DRAFTS drafts waits undrafted (status awaiting_draft). When the owner opens it, the
// screen calls the server action draftPulledItem (actions.ts), which comes here: the item's draft
// is asked for and the ordinary draft step runs on it at once (same AI cap, plan reply limit,
// policy and knowledge-base-only rules), then the policy step. Without an LLM, or when the item
// is busy, the job drafts it within a minute instead.

export type DraftOnOpenOutcome =
  /** Drafted now: the item is awaiting approval (or went on per policy). */
  | { outcome: "drafted"; status: string }
  /** Asked for; the job will draft it shortly (no LLM here, or it was busy). */
  | { outcome: "queued" }
  /** Not an undrafted pulled item of this brand (already drafted, answered, or not pulled). */
  | { outcome: "not_waiting" };

/** How long the inline draft may take before the job takes over. */
const INLINE_MS = 40_000;

export async function draftOnOpen(
  deps: { db: ServiceClient; steps: Steps; now?: Date },
  input: { tenantId: string; itemId: string; actor: string },
): Promise<DraftOnOpenOutcome> {
  const { db } = deps;
  const now = deps.now ?? new Date();
  const { data: item, error } = await db
    .from("inbound_items")
    .select("id, status, catch_up_id")
    .eq("id", input.itemId)
    .eq("tenant_id", input.tenantId)
    .maybeSingle();
  if (error) throw new Error(`item lookup failed: ${error.message}`);
  if (!item || item.status !== "awaiting_draft" || !item.catch_up_id) {
    return { outcome: "not_waiting" };
  }
  if (!(await requestDraft(db, item.id, now, "opened"))) return { outcome: "not_waiting" };
  await writeAudit(db, {
    tenantId: input.tenantId,
    itemId: item.id,
    action: "draft_requested",
    actor: input.actor,
    details: { from: "opened", catchUpId: item.catch_up_id },
  });

  return draftInline(deps, item.id);
}

/**
 * Runs the draft and policy steps on one `classified` item now (up to INLINE_MS), as the job
 * would. "queued" when there's no draft step here or the item is busy: the job drafts it soon.
 */
async function draftInline(
  deps: { db: ServiceClient; steps: Steps },
  itemId: string,
): Promise<{ outcome: "drafted"; status: string } | { outcome: "queued" }> {
  const { db } = deps;
  const steps: Steps = {
    ...(deps.steps.classified ? { classified: deps.steps.classified } : {}),
    ...(deps.steps.drafted ? { drafted: deps.steps.drafted } : {}),
  };
  if (!steps.classified) return { outcome: "queued" };
  const claimed = await claimItem(db, itemId, "classified");
  if (!claimed) return { outcome: "queued" };

  let handedOut = false;
  await processDueItems({
    db,
    steps,
    deadline: createDeadline({ maxMs: INLINE_MS, claimUntilMs: INLINE_MS, minItemMs: 1_000 }),
    // Just this item, once.
    claim: async () => {
      if (handedOut) return [];
      handedOut = true;
      return [claimed];
    },
  });
  const { data: after } = await db.from("inbound_items").select("status").eq("id", itemId).single();
  const status = after?.status ?? "classified";
  return status === "classified" ? { outcome: "queued" } : { outcome: "drafted", status };
}

/**
 * Setup's "customers still waiting" (20 Nov): the owner typed the facts Waggle was missing (saved
 * as an answer first), so a pulled message handed over for want of an answer, or one whose draft
 * still waits for approval, is written again now: its pending draft is superseded, the item goes
 * back to the draft step (`redraft`) and the draft and policy steps run on it at once.
 */
export async function redraftNow(
  deps: { db: ServiceClient; steps: Steps },
  input: { tenantId: string; itemId: string; actor: string },
): Promise<DraftOnOpenOutcome> {
  const { db } = deps;
  const { data: item, error } = await db
    .from("inbound_items")
    .select("id, status, catch_up_id")
    .eq("id", input.itemId)
    .eq("tenant_id", input.tenantId)
    .maybeSingle();
  if (error) throw new Error(`item lookup failed: ${error.message}`);
  if (
    !item ||
    !item.catch_up_id ||
    (item.status !== "escalated" && item.status !== "awaiting_approval")
  ) {
    return { outcome: "not_waiting" };
  }
  const { data: superseded } = await db
    .from("drafts")
    .update({ status: "superseded" })
    .eq("item_id", item.id)
    .eq("status", "pending")
    .select("id");
  const { applied } = await transitionItem(db, {
    itemId: item.id,
    from: item.status,
    event: "redraft",
    details: { from: "setup_facts", draftIds: (superseded ?? []).map((d) => d.id) },
  });
  if (!applied) {
    // Decided meanwhile (approved, sent): its draft stands.
    for (const d of superseded ?? []) {
      await db.from("drafts").update({ status: "pending" }).eq("id", d.id);
    }
    return { outcome: "not_waiting" };
  }
  await writeAudit(db, {
    tenantId: input.tenantId,
    itemId: item.id,
    action: "draft_requested",
    actor: input.actor,
    details: { from: "setup_facts", catchUpId: item.catch_up_id },
  });
  return draftInline(deps, item.id);
}
