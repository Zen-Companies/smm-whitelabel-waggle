import type { SupabaseClient } from "@supabase/supabase-js";
import { loadUncheckedFacts, type UncheckedFact } from "@/lib/facts";
import type { Database } from "@/lib/supabase/database.types";

// Walter's flow (decision 7, 20 Nov): the contract for the screens that show a draft (setup step
// 3, the Inbox). Which facts in a draft Waggle found on the account and the owner hasn't checked
// yet, with where each shows in the reply, so the reply can highlight them. Works with the
// signed-in user's client (RLS: their own brand's drafts only) or the service client.

/**
 * A draft's not-checked facts, in the order the draft used them. Each has `spans` (character
 * ranges in the draft's current text, edited text when the owner edited it) to highlight, and
 * `used` (the reply really uses it; only those become checked when the reply is sent). Empty
 * when the draft doesn't exist or used none.
 */
export async function uncheckedFactsForDraft(
  db: SupabaseClient<Database>,
  draftId: string,
): Promise<UncheckedFact[]> {
  const { data, error } = await db
    .from("drafts")
    .select("body, edited_body, kb_entry_ids")
    .eq("id", draftId)
    .maybeSingle();
  if (error) throw new Error(`draft lookup failed: ${error.message}`);
  if (!data) return [];
  return loadUncheckedFacts(db, data.kb_entry_ids ?? [], data.edited_body ?? data.body);
}

/** The same for a text not saved yet (the owner editing a reply): pass the draft's fact ids. */
export function uncheckedFactsForText(
  db: SupabaseClient<Database>,
  kbEntryIds: string[],
  text: string,
): Promise<UncheckedFact[]> {
  return loadUncheckedFacts(db, kbEntryIds, text);
}
