import "server-only";
import type { ServiceClient } from "@/lib/supabase/service";

// Facts in Waggle's drafts that were found on the connected profile and not checked by the owner
// yet (decision 7): setup's money batch highlights them, with the note "Highlighted facts came
// from your Instagram. Sending one counts as checking it."

/**
 * Build C's contract (branch walter-facts, exported from `@/features/knowledge-base` once merged).
 * `spans` are ranges in the reply body (`edited_body ?? body`) to highlight.
 */
export interface UncheckedFact {
  id: string;
  title: string;
  content: string;
  kind: string;
  source: string;
  spans: { start: number; end: number; text: string }[];
  used: boolean;
}

/**
 * TODO(build C): replace with `import { uncheckedFactsForDraft } from "@/features/knowledge-base"`
 * at merge (same signature). Until then nothing is unchecked, so no highlight or note shows.
 */
export async function uncheckedFactsForDraft(
  db: ServiceClient,
  draftId: string,
): Promise<UncheckedFact[]> {
  void db;
  void draftId;
  return [];
}

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
