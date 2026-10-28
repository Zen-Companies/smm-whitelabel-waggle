import { toVectorLiteral, type KbDeps } from "./embeddings";

export const RETRIEVAL_LIMIT = 5;

export interface KbMatch {
  id: string;
  title: string;
  content: string;
  similarity: number;
}

/**
 * The tenant's top entries for a customer message, by cosine similarity (docs/tdd.md §10).
 * The only source of facts for a draft. Entries still waiting for their embedding are skipped.
 */
export async function retrieveKbEntries(
  deps: KbDeps,
  input: {
    tenantId: string;
    itemId?: string | null;
    query: string;
    limit?: number;
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
  return data;
}
