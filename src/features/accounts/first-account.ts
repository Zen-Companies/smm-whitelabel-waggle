import "server-only";
import type { getServiceClient } from "@/lib/supabase/service";

/**
 * Whether the brand has no active social account yet, so this connect is its first (20 Nov):
 * the sign-in then comes back to setup step 2 ("Reading your inbox…", then the reveal).
 * On a read error it answers false, so the owner simply goes back to where they started.
 */
export async function isFirstAccount(
  db: ReturnType<typeof getServiceClient>,
  tenantId: string,
): Promise<boolean> {
  const { count, error } = await db
    .from("social_accounts")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("status", "active");
  if (error) return false;
  return (count ?? 0) === 0;
}
