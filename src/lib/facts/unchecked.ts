import type { SupabaseClient } from "@supabase/supabase-js";
import { writeAudit } from "@/lib/audit";
import type { Database } from "@/lib/supabase/database.types";
import type { ServiceClient } from "@/lib/supabase/service";
import { factSpans, factUsed, type FactSpan } from "./spans";

// Walter's flow (decision 7, 20 Nov): business info Waggle found on the connected account is
// saved "not checked" (kb_entries.needs_check). Shared by approvals (policy input, marking facts
// checked when a reply is sent) and the knowledge base (the UI contract, uncheckedFactsForDraft).

type AnyClient = SupabaseClient<Database>;

export type FoundKind = "price" | "hours" | "address" | "contact" | "answer";
export type FoundSource = "facebook_page" | "instagram_profile" | "post_caption";

export interface UncheckedFact {
  /** kb_entries.id */
  id: string;
  title: string;
  content: string;
  kind: FoundKind | null;
  source: FoundSource | null;
  /** Where the fact shows in the reply (to highlight); empty when it has nothing to point at. */
  spans: FactSpan[];
  /** The reply uses this fact (see factUsed). */
  used: boolean;
}

/** The ids among `kbEntryIds` still marked not checked. */
export async function uncheckedFactIds(db: AnyClient, kbEntryIds: string[]): Promise<string[]> {
  if (kbEntryIds.length === 0) return [];
  const { data, error } = await db
    .from("kb_entries")
    .select("id")
    .in("id", kbEntryIds)
    .eq("needs_check", true);
  if (error) throw new Error(`unchecked facts lookup failed: ${error.message}`);
  return (data ?? []).map((r) => r.id);
}

/** The not-checked facts among a draft's facts, with where each shows in `reply`. */
export async function loadUncheckedFacts(
  db: AnyClient,
  kbEntryIds: string[],
  reply: string,
): Promise<UncheckedFact[]> {
  if (kbEntryIds.length === 0) return [];
  const { data, error } = await db
    .from("kb_entries")
    .select("id, title, content, found_kind, found_source")
    .in("id", kbEntryIds)
    .eq("needs_check", true);
  if (error) throw new Error(`unchecked facts lookup failed: ${error.message}`);
  const order = new Map(kbEntryIds.map((id, i) => [id, i]));
  return (data ?? [])
    .map((r) => ({
      id: r.id,
      title: r.title,
      content: r.content,
      kind: r.found_kind as FoundKind | null,
      source: r.found_source as FoundSource | null,
      spans: factSpans(reply, r),
      used: factUsed(reply, r),
    }))
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

/**
 * One fact checked by a person: clears needs_check (only if still set) and writes
 * `found_fact_checked`. False when it was already checked (or isn't the tenant's).
 */
export async function markFactChecked(
  db: ServiceClient,
  input: {
    tenantId: string;
    kbEntryId: string;
    userId: string;
    via: "check_button" | "edited" | "sent_reply";
    draftId?: string;
    itemId?: string;
    now?: Date;
  },
): Promise<boolean> {
  const now = input.now ?? new Date();
  const { data, error } = await db
    .from("kb_entries")
    .update({ needs_check: false, checked_at: now.toISOString(), checked_by: input.userId })
    .eq("id", input.kbEntryId)
    .eq("tenant_id", input.tenantId)
    .eq("needs_check", true)
    .select("id");
  if (error) throw new Error(`marking a fact checked failed: ${error.message}`);
  if (!data?.length) return false;
  await writeAudit(db, {
    tenantId: input.tenantId,
    itemId: input.itemId ?? null,
    action: "found_fact_checked",
    actor: input.userId,
    details: {
      kbEntryId: input.kbEntryId,
      via: input.via,
      ...(input.draftId ? { draftId: input.draftId } : {}),
    },
  });
  return true;
}

/**
 * A reply a person approved went out: the not-checked facts it used are now checked (the owner
 * saw them highlighted and sent them). Facts the draft had but the sent text doesn't use (the
 * owner edited them out) stay not checked. Returns the ids marked.
 */
export async function markUsedFactsChecked(
  db: ServiceClient,
  input: {
    tenantId: string;
    itemId: string;
    draftId: string;
    kbEntryIds: string[];
    message: string;
    userId: string;
    now?: Date;
  },
): Promise<string[]> {
  const facts = await loadUncheckedFacts(db, input.kbEntryIds, input.message);
  const marked: string[] = [];
  for (const f of facts.filter((x) => x.used)) {
    const done = await markFactChecked(db, {
      tenantId: input.tenantId,
      kbEntryId: f.id,
      userId: input.userId,
      via: "sent_reply",
      draftId: input.draftId,
      itemId: input.itemId,
      now: input.now,
    });
    if (done) marked.push(f.id);
  }
  return marked;
}
