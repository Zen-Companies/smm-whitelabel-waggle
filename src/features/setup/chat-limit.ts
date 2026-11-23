import "server-only";
import { loadTenantAiSpend } from "@/lib/llm/spend";
import type { ServiceClient } from "@/lib/supabase/service";

// The typing box's rate limit (board "Step 3 is a conversation with Waggle", 23 Nov): per brand,
// counted from its audit rows (one per typed message), and never past the AI cap. Not in
// chat-actions.ts: every export of a "use server" file is callable from the browser.

/** Typed messages a brand may send Waggle in an hour. */
export const TYPED_PER_HOUR = 30;

/** Outcomes that never reached the AI: not counted, or a rested box would lock itself. */
export const NOT_AI_OUTCOMES = ["secret", "limited"] as const;

export async function typingAllowed(db: ServiceClient, tenantId: string): Promise<boolean> {
  const since = new Date(Date.now() - 3_600_000).toISOString();
  const [{ count, error }, spend] = await Promise.all([
    db
      .from("audit_log")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("action", "setup_chat_typed")
      .not("details->>outcome", "in", `(${NOT_AI_OUTCOMES.join(",")})`)
      .gte("created_at", since),
    loadTenantAiSpend(db, tenantId, new Date()),
  ]);
  if (error) return false;
  return (count ?? 0) < TYPED_PER_HOUR && spend.level !== "reached";
}
