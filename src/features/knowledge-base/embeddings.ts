import * as Sentry from "@sentry/nextjs";
import type { LlmClient } from "@/lib/llm/client";
import type { ServiceClient } from "@/lib/supabase/service";

// KB embeddings (docs/tdd.md §10). The column is vector(1536): openai/text-embedding-3-small.
export const EMBEDDING_DIMENSIONS = 1536;

export interface KbDeps {
  db: ServiceClient;
  llm: LlmClient;
}

/** What gets embedded: the title carries the topic ("Opening hours"), the content the facts. */
export function kbEmbeddingText(entry: { title: string; content: string }): string {
  return `${entry.title.trim()}\n\n${entry.content.trim()}`;
}

/** pgvector's text format. */
export function toVectorLiteral(embedding: number[]): string {
  if (embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `embedding has ${embedding.length} dimensions, expected ${EMBEDDING_DIMENSIONS} (EMBEDDING_MODEL changed?)`,
    );
  }
  if (!embedding.every(Number.isFinite)) throw new Error("embedding has non-finite values");
  return `[${embedding.join(",")}]`;
}

/**
 * Embeds one entry and stores it, unless the entry changed meanwhile: the write is conditional
 * on the `updated_at` that was read, so a stale embedding never lands on newer text (the T1
 * trigger has already cleared it, and the next sweep embeds the new text).
 */
export async function embedEntry(deps: KbDeps, entryId: string): Promise<"embedded" | "stale"> {
  const { data: entry, error } = await deps.db
    .from("kb_entries")
    .select("id, tenant_id, title, content, updated_at")
    .eq("id", entryId)
    .single();
  if (error) throw new Error(`kb entry lookup failed: ${error.message}`);

  const { embedding } = await deps.llm.embed({
    tenantId: entry.tenant_id,
    value: kbEmbeddingText(entry),
  });
  const { data: updated, error: updateError } = await deps.db
    .from("kb_entries")
    .update({ embedding: toVectorLiteral(embedding) })
    .eq("id", entryId)
    .eq("updated_at", entry.updated_at)
    .select("id");
  if (updateError) throw new Error(`storing embedding failed: ${updateError.message}`);
  return updated.length > 0 ? "embedded" : "stale";
}

/** Re-embedding sweep: entries whose embedding is null (new, edited, or a failed embed). */
export async function embedPendingEntries(
  deps: KbDeps,
  opts: { limit?: number; shouldContinue?: () => boolean; tenantId?: string } = {},
): Promise<{ embedded: number; failed: number }> {
  let query = deps.db.from("kb_entries").select("id").is("embedding", null);
  if (opts.tenantId) query = query.eq("tenant_id", opts.tenantId);
  const { data, error } = await query.order("updated_at").limit(opts.limit ?? 20);
  if (error) throw new Error(`pending kb entries lookup failed: ${error.message}`);

  let embedded = 0;
  let failed = 0;
  for (const { id } of data) {
    if (opts.shouldContinue && !opts.shouldContinue()) break;
    try {
      if ((await embedEntry(deps, id)) === "embedded") embedded += 1;
    } catch (err) {
      failed += 1;
      Sentry.captureException(err, { extra: { kbEntryId: id } });
    }
  }
  return { embedded, failed };
}
