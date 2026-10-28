import type { Json } from "@/lib/supabase/database.types";
import type { ServiceClient } from "@/lib/supabase/service";

// Every state change and owner action writes one row (CLAUDE.md rule 11).
// `details` holds ids, scores and reasons only, never customer message text (rule 10).
export interface AuditEntry {
  tenantId: string;
  itemId?: string | null;
  action: string;
  /** "system" or the acting user's id. */
  actor: string;
  details?: { [key: string]: Json | undefined };
}

export async function writeAudit(db: ServiceClient, entry: AuditEntry): Promise<void> {
  const { error } = await db.from("audit_log").insert({
    tenant_id: entry.tenantId,
    item_id: entry.itemId ?? null,
    action: entry.action,
    actor: entry.actor,
    details: entry.details ?? {},
  });
  // Throwing fails the step, so the job retries it instead of losing the audit row.
  if (error) throw new Error(`audit_log insert failed (${entry.action}): ${error.message}`);
}
