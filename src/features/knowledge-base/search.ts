import type { ServiceClient } from "@/lib/supabase/service";

// Keyword search over a business's facts, for callers that must not call an embedding model
// (MCP tools: the user's own AI does the reasoning). The drafting pipeline keeps using
// retrieveKbEntries (embeddings).

export const KB_SEARCH_MAX_WORDS = 5;

/** Pure: the search words, letters and digits only (safe inside a PostgREST filter). */
export function searchWords(query: string | null | undefined): string[] {
  return (query ?? "")
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2)
    .slice(0, KB_SEARCH_MAX_WORDS);
}

export interface KbSearchHit {
  id: string;
  title: string;
  content: string;
  updatedAt: string;
}

/** Entries containing every word (title or content), newest first; no query lists them all. */
export async function searchKbEntries(
  db: ServiceClient,
  tenantId: string,
  input: { query?: string | null; limit: number; offset: number },
): Promise<{ entries: KbSearchHit[]; more: boolean }> {
  let q = db.from("kb_entries").select("id, title, content, updated_at").eq("tenant_id", tenantId);
  for (const word of searchWords(input.query)) {
    q = q.or(`title.ilike.%${word}%,content.ilike.%${word}%`);
  }
  const { data, error } = await q
    .order("updated_at", { ascending: false })
    .range(input.offset, input.offset + input.limit);
  if (error) throw new Error(`kb search failed: ${error.message}`);
  const rows = data ?? [];
  return {
    entries: rows.slice(0, input.limit).map((r) => ({
      id: r.id,
      title: r.title,
      content: r.content,
      updatedAt: r.updated_at,
    })),
    more: rows.length > input.limit,
  };
}
