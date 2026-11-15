import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

// "Questions your info didn't answer" (design v2): items still waiting for the owner whose draft
// said the business info doesn't cover them. Shown on Business info, and read by the gap helper
// (T33). Works through RLS (the page) or the service role (the helper).

export interface GapRow {
  itemId: string;
  createdAt: string;
  text: string;
  authorName: string | null;
}

export async function loadGaps(
  db: SupabaseClient<Database>,
  tenantId: string,
  limit: number,
): Promise<GapRow[]> {
  const { data } = await db
    .from("drafts")
    .select("item_id, created_at, inbound_items!inner (text, author_name, status)")
    .eq("tenant_id", tenantId)
    .eq("needs_human", true)
    .eq("inbound_items.status", "escalated")
    .order("created_at", { ascending: false })
    .limit(limit);
  const rows = (data ?? []) as unknown as {
    item_id: string;
    created_at: string;
    inbound_items: { text: string; author_name: string | null };
  }[];
  return rows.map((r) => ({
    itemId: r.item_id,
    createdAt: r.created_at,
    text: r.inbound_items.text,
    authorName: r.inbound_items.author_name,
  }));
}

export interface PendingSuggestion {
  id: string;
  title: string;
  content: string;
  questions: number;
}

export async function loadPendingSuggestions(
  db: SupabaseClient<Database>,
  tenantId: string,
): Promise<PendingSuggestion[]> {
  const { data } = await db
    .from("kb_suggestions")
    .select("id, title, content, item_ids")
    .eq("tenant_id", tenantId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(10);
  return (data ?? []).map((s) => ({
    id: s.id,
    title: s.title,
    content: s.content,
    questions: s.item_ids.length,
  }));
}

/**
 * Questions the owner's answers don't cover, the same question once with how often it was
 * asked, most asked first ("Do buyers pay you anything?" · asked 3 times).
 */
export function groupGaps(rows: { text: string }[], limit = 3): { text: string; times: number }[] {
  const groups = new Map<string, { text: string; times: number; order: number }>();
  rows.forEach((r, order) => {
    const text = r.text.trim();
    if (!text) return;
    const key = text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
    const g = groups.get(key);
    if (g) g.times += 1;
    else groups.set(key, { text, times: 1, order });
  });
  return [...groups.values()]
    .sort((a, b) => b.times - a.times || a.order - b.order)
    .slice(0, limit)
    .map(({ text, times }) => ({
      text: text.length > 120 ? `${text.slice(0, 117)}…` : text,
      times,
    }));
}
