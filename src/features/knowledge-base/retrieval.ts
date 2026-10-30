import { toVectorLiteral, type KbDeps } from "./embeddings";

export const RETRIEVAL_LIMIT = 5;

/**
 * The relevance floor (T31): topics scoring below it never reach the draft prompt, so unrelated
 * facts can't be mixed in and "Based on" can't name a topic that doesn't fit. Tuned on the live
 * test of 2026-10-30 with nvidia/nemotron-3.5-embed-1b: the right topic scored 0.48 to 0.52,
 * unrelated topics 0.07 to 0.13. Scores depend on the embedding model: retune it (KB_MIN_SIMILARITY,
 * the draft_created audit's kbSimilarities) whenever EMBEDDING_MODEL changes.
 */
export const RETRIEVAL_MIN_SIMILARITY = 0.25;

/** The floor in effect: KB_MIN_SIMILARITY (0 to 1) when set, else the default. */
export function minSimilarity(env: Record<string, string | undefined> = process.env): number {
  const raw = env.KB_MIN_SIMILARITY;
  if (raw === undefined || raw.trim() === "") return RETRIEVAL_MIN_SIMILARITY;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : RETRIEVAL_MIN_SIMILARITY;
}

export interface KbMatch {
  id: string;
  title: string;
  content: string;
  similarity: number;
}

/**
 * The tenant's top entries for a customer message, by cosine similarity (docs/tdd.md §10), above
 * the relevance floor. The only source of facts for a draft. Entries still waiting for their
 * embedding are skipped.
 */
export async function retrieveKbEntries(
  deps: KbDeps,
  input: {
    tenantId: string;
    itemId?: string | null;
    query: string;
    limit?: number;
    /** Defaults to minSimilarity(). */
    minSimilarity?: number;
    signal?: AbortSignal;
  },
): Promise<KbMatch[]> {
  if (!input.query.trim()) return [];
  const { embedding } = await deps.llm.embed({
    tenantId: input.tenantId,
    itemId: input.itemId,
    value: input.query,
    signal: input.signal,
  });
  const { data, error } = await deps.db.rpc("match_kb_entries", {
    p_tenant_id: input.tenantId,
    p_query_embedding: toVectorLiteral(embedding),
    p_limit: input.limit ?? RETRIEVAL_LIMIT,
  });
  if (error) throw new Error(`match_kb_entries failed: ${error.message}`);
  const floor = input.minSimilarity ?? minSimilarity();
  return data.filter((m) => m.similarity >= floor);
}
