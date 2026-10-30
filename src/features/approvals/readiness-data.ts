import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { AutonomyMode } from "./policy";
import {
  changesByTopic,
  countDecisions,
  READINESS_DAYS,
  readiness,
  readinessProgress,
  type Readiness,
  type TopicChanges,
} from "./readiness";

export interface CategoryReadiness extends Readiness {
  /** The category's current setting, so "Turn on Auto-send" shows only when it isn't on. */
  mode: AutonomyMode;
  progress: { done: number; of: number };
  /** Where the owner changed replies, by Business info topic (T36 item 2). */
  changes: TopicChanges[];
  /** Drafts the owner changed before sending: what was suggested next to what went out. */
  edits: { id: string; suggested: string; sent: string; at: string }[];
}

/** Readiness for faq and lead from the owner's own decisions (read through RLS). */
export async function loadReadiness(
  supabase: SupabaseClient<Database>,
  tenantId: string,
): Promise<Record<"faq" | "lead", CategoryReadiness>> {
  const since = new Date(Date.now() - READINESS_DAYS * 24 * 3_600_000).toISOString();
  const [{ data }, { data: modes }] = await Promise.all([
    supabase
      .from("drafts")
      .select(
        "id, status, body, edited_body, decided_by, kb_entry_ids, created_at, inbound_items!inner (category)",
      )
      .eq("tenant_id", tenantId)
      .gte("created_at", since)
      .not("decided_by", "is", null)
      .order("created_at", { ascending: false })
      .limit(500),
    supabase.from("autonomy_settings").select("category, mode").eq("tenant_id", tenantId),
  ]);
  const rows = (data ?? []) as unknown as {
    id: string;
    status: string;
    body: string;
    edited_body: string | null;
    decided_by: string | null;
    kb_entry_ids: string[];
    created_at: string;
    inbound_items: { category: string | null };
  }[];

  const topicIds = [...new Set(rows.flatMap((r) => r.kb_entry_ids.slice(0, 1)))];
  const { data: topics } = topicIds.length
    ? await supabase.from("kb_entries").select("id, title").in("id", topicIds)
    : { data: [] };
  const titles = new Map((topics ?? []).map((t) => [t.id, t.title]));
  const modeOf = new Map((modes ?? []).map((m) => [m.category, m.mode as AutonomyMode]));

  const forCategory = (category: "faq" | "lead"): CategoryReadiness => {
    const mine = rows.filter((r) => r.inbound_items.category === category);
    const counts = countDecisions(mine);
    return {
      ...readiness(counts),
      mode: modeOf.get(category) ?? "off",
      progress: readinessProgress(counts),
      changes: changesByTopic(mine, titles),
      edits: mine
        .filter((r) => r.edited_body !== null && r.status !== "rejected")
        .slice(0, 5)
        .map((r) => ({ id: r.id, suggested: r.body, sent: r.edited_body!, at: r.created_at })),
    };
  };
  return { faq: forCategory("faq"), lead: forCategory("lead") };
}
