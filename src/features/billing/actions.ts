"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import { parseCapInput } from "./ai-cap";
import { isOperator } from "./operator";

export type CapFormState = { saved?: boolean; error?: string };

/**
 * The operator sets one business's monthly AI cap (T32). Operator only, checked here too: a Server
 * Action is reachable without the page. Owners have no update grant on the column.
 */
export async function updateAiCap(_prev: CapFormState, formData: FormData): Promise<CapFormState> {
  const user = await getCurrentUser();
  if (!user || !isOperator(user)) return { error: "Not available." };
  const tenantId = z.string().uuid().safeParse(formData.get("tenantId"));
  if (!tenantId.success) return { error: "That business wasn't found." };
  const parsed = parseCapInput(formData.get("cap"));
  if ("error" in parsed) return { error: parsed.error };

  const db = getServiceClient();
  const { data: before } = await db
    .from("tenants")
    .select("ai_monthly_cap_usd")
    .eq("id", tenantId.data)
    .maybeSingle();
  if (!before) return { error: "That business wasn't found." };
  const from = before.ai_monthly_cap_usd === null ? null : Number(before.ai_monthly_cap_usd);
  if (from === parsed.cap) return { saved: true };

  const { error } = await db
    .from("tenants")
    .update({ ai_monthly_cap_usd: parsed.cap })
    .eq("id", tenantId.data);
  if (error) return { error: "Couldn't save. Please try again." };
  await writeAudit(db, {
    tenantId: tenantId.data,
    action: "ai_cap_changed",
    actor: user.id,
    details: { from, to: parsed.cap },
  });
  revalidatePath("/admin/costs");
  return { saved: true };
}
