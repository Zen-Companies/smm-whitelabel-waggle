import { writeAudit } from "@/lib/audit";
import type { ServiceClient } from "@/lib/supabase/service";

// Staff Brands: mark a business as a test business (MCP Try it, usage reports skip it).

/** Sets tenants.is_test and writes the audit row. False when the business doesn't exist. */
export async function setTestBusiness(
  db: ServiceClient,
  input: { tenantId: string; actorId: string; on: boolean },
): Promise<boolean> {
  const { data: before } = await db
    .from("tenants")
    .select("is_test")
    .eq("id", input.tenantId)
    .maybeSingle();
  if (!before) return false;
  if (before.is_test === input.on) return true;
  const { error } = await db.from("tenants").update({ is_test: input.on }).eq("id", input.tenantId);
  if (error) throw new Error(`brands: saving the test switch failed: ${error.message}`);
  await writeAudit(db, {
    tenantId: input.tenantId,
    action: "test_business_changed",
    actor: input.actorId,
    details: { from: before.is_test, to: input.on },
  });
  return true;
}
