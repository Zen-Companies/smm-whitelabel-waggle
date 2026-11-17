"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getTenantFor, NOT_ALLOWED } from "@/features/tenants";
import { writeAudit } from "@/lib/audit";
import { getServiceClient } from "@/lib/supabase/service";
import { LEAD_STAGES } from "./lead-stage";

export type MoveLeadState = { error?: string };

const schema = z.object({
  leadId: z.uuid(),
  stage: z.enum(LEAD_STAGES.map((s) => s.key) as [string, ...string[]]),
});

/** Move a lead on the board (T74d). Members and up; only this brand's leads; audited. */
export async function moveLeadAction(
  _prev: MoveLeadState,
  formData: FormData,
): Promise<MoveLeadState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Something went wrong. Reload the page." };
  const tenant = await getTenantFor("replies.approve");
  if (!tenant) return { error: NOT_ALLOWED };
  const db = getServiceClient();
  const { data, error } = await db
    .from("leads")
    .update({ stage: parsed.data.stage, stage_changed_at: new Date().toISOString() })
    .eq("id", parsed.data.leadId)
    .eq("tenant_id", tenant.id)
    .select("id");
  if (error || !data?.length) return { error: "Couldn't move it. Try again." };
  await writeAudit(db, {
    tenantId: tenant.id,
    action: "lead_stage_changed",
    actor: tenant.userId,
    details: { leadId: parsed.data.leadId, stage: parsed.data.stage },
  });
  revalidatePath("/contacts/leads");
  return {};
}
