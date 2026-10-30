import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { countDecisions, READINESS_DAYS, readiness, type Readiness } from "./readiness";

export interface CategoryReadiness extends Readiness {
  /** Drafts the owner changed before sending: what was suggested next to what went out. */
  edits: { id: string; suggested: string; sent: string; at: string }[];
}

/** Readiness for faq and lead from the owner's own decisions (read through RLS). */
export async function loadReadiness(
  supabase: SupabaseClient<Database>,
  tenantId: string,
): Promise<Record<"faq" | "lead", CategoryReadiness>> {
  const since = new Date(Date.now() - READINESS_DAYS * 24 * 3_600_000).toISOString();
  const { data } = await supabase
    .from("drafts")
    .select("id, status, body, edited_body, decided_by, created_at, inbound_items!inner (category)")
    .eq("tenant_id", tenantId)
    .gte("created_at", since)
    .not("decided_by", "is", null)
    .order("created_at", { ascending: false })
    .limit(500);
  const rows = (data ?? []) as unknown as {
    id: string;
    status: string;
    body: string;
    edited_body: string | null;
    decided_by: string | null;
    created_at: string;
    inbound_items: { category: string | null };
  }[];

  const forCategory = (category: "faq" | "lead"): CategoryReadiness => {
    const mine = rows.filter((r) => r.inbound_items.category === category);
    return {
      ...readiness(countDecisions(mine)),
      edits: mine
        .filter((r) => r.edited_body !== null && r.status !== "rejected")
        .slice(0, 5)
        .map((r) => ({ id: r.id, suggested: r.body, sent: r.edited_body!, at: r.created_at })),
    };
  };
  return { faq: forCategory("faq"), lead: forCategory("lead") };
}
