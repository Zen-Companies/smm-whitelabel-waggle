import "server-only";
import { uncheckedFactsForDraft } from "@/features/knowledge-base";
import type { ServiceClient } from "@/lib/supabase/service";

// Facts in Waggle's drafts that were found on the connected profile and not checked by the owner
// yet (decision 7): setup's money batch highlights them, with the note "Highlighted facts came
// from your Instagram. Sending one counts as checking it."

/** Setup's view of it: draft id → the highlighted texts, for drafts with any. */
export async function uncheckedFactsByDraft(
  db: ServiceClient,
  draftIds: readonly string[],
): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {};
  const facts = await Promise.all(draftIds.map((id) => uncheckedFactsForDraft(db, id)));
  draftIds.forEach((id, i) => {
    const texts = facts[i].flatMap((f) => f.spans.map((s) => s.text)).filter(Boolean);
    if (texts.length) out[id] = texts;
  });
  return out;
}
