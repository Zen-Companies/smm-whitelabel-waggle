import { writeAudit } from "@/lib/audit";
import type { ServiceClient } from "@/lib/supabase/service";

// "Setup passed" (Setup first, then free, approved 20 Nov): one durable flag per brand. Shared by
// setup (finish, Skip for now, Finish later) and accounts (the brand's account connected).

export type SetupPassedHow = "finished" | "skipped" | "finish_later" | "connected";

/** Audit action for a brand passing setup. */
export const SETUP_PASSED_ACTION = "setup_passed";

/**
 * Marks the brand as through setup, once: true when this call did it (and wrote the audit row),
 * false when it already had. Service role: owners have no update grant on these columns.
 */
export async function markSetupPassed(
  db: ServiceClient,
  input: { tenantId: string; how: SetupPassedHow; userId: string | null },
): Promise<boolean> {
  const { data, error } = await db
    .from("tenants")
    .update({
      setup_passed_at: new Date().toISOString(),
      setup_passed_how: input.how,
      setup_passed_by: input.userId,
    })
    .eq("id", input.tenantId)
    .is("setup_passed_at", null)
    .select("id");
  if (error) throw new Error(`marking setup passed failed: ${error.message}`);
  if (!data?.length) return false;
  await writeAudit(db, {
    tenantId: input.tenantId,
    action: SETUP_PASSED_ACTION,
    actor: input.userId ?? "system",
    details: { how: input.how },
  });
  return true;
}

/**
 * Whether the brand is through setup: the flag, or any account row (connected now or before),
 * so an account that landed before the flag was written still counts.
 */
export async function isSetupPassed(db: ServiceClient, tenantId: string): Promise<boolean> {
  const [{ data: t }, { count }] = await Promise.all([
    db.from("tenants").select("setup_passed_at").eq("id", tenantId).maybeSingle(),
    db
      .from("social_accounts")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId),
  ]);
  return !!t?.setup_passed_at || (count ?? 0) > 0;
}
