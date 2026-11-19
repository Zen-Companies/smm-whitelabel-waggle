"use server";

import { revalidatePath } from "next/cache";
import { getCurrentTenant } from "@/features/tenants";
import { getServiceClient } from "@/lib/supabase/service";

/** Dismiss on the Today note: hides it for the organization until a later disconnect. */
export async function dismissIdleNotice(): Promise<void> {
  const tenant = await getCurrentTenant();
  const db = getServiceClient();
  const { error } = await db
    .from("org_idle")
    .update({ notice_dismissed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("organization_id", tenant.organizationId);
  if (error) throw new Error(`idle: dismissing the note failed: ${error.message}`);
  const { error: auditError } = await db.from("organization_audit").insert({
    organization_id: tenant.organizationId,
    action: "idle.notice_dismissed",
    actor: tenant.userId,
    details: { tenantId: tenant.id },
  });
  if (auditError) throw new Error(`idle: audit failed: ${auditError.message}`);
  revalidatePath("/today");
}
