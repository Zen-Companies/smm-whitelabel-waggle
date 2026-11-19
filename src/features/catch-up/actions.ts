"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getTenantFor } from "@/features/tenants";
import { writeAudit } from "@/lib/audit";
import { getServiceClient } from "@/lib/supabase/service";

const idSchema = z.object({ id: z.uuid() });

/** Hides Today's catch-up card (the missed list stays in the Inbox). */
export async function dismissCatchUp(formData: FormData): Promise<void> {
  const parsed = idSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const tenant = await getTenantFor("inbox.read");
  if (!tenant) return;
  const db = getServiceClient();
  const { data } = await db
    .from("catch_ups")
    .update({ dismissed_at: new Date().toISOString(), dismissed_by: tenant.userId })
    .eq("id", parsed.data.id)
    .eq("tenant_id", tenant.id)
    .is("dismissed_at", null)
    .select("id");
  if (data?.length) {
    await writeAudit(db, {
      tenantId: tenant.id,
      action: "catch_up_dismissed",
      actor: tenant.userId,
      details: { catchUpId: parsed.data.id },
    });
  }
  revalidatePath("/today");
}
