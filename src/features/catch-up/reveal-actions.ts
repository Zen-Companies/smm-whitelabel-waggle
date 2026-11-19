"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getTenantFor } from "@/features/tenants";
import { writeAudit } from "@/lib/audit";
import { getServiceClient } from "@/lib/supabase/service";

const idSchema = z.uuid();

/**
 * The owner saw the finished reveal: Today stops offering "Your inbox catch-up is ready" (board
 * #18 shows it only until seen). Same as dismissing Today's card, audited as seen.
 */
export async function markRevealSeen(catchUpId: string): Promise<void> {
  const parsed = idSchema.safeParse(catchUpId);
  if (!parsed.success) return;
  const tenant = await getTenantFor("inbox.read");
  if (!tenant) return;
  const db = getServiceClient();
  const { data } = await db
    .from("catch_ups")
    .update({ dismissed_at: new Date().toISOString(), dismissed_by: tenant.userId })
    .eq("id", parsed.data)
    .eq("tenant_id", tenant.id)
    .is("dismissed_at", null)
    .select("id");
  if (data?.length) {
    await writeAudit(db, {
      tenantId: tenant.id,
      action: "catch_up_reveal_seen",
      actor: tenant.userId,
      details: { catchUpId: parsed.data },
    });
    revalidatePath("/today");
  }
}
