"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import { parseCapInput } from "./ai-cap";
import { parsePlanSettings, type PlanId } from "./plans";
import { hasPermission } from "@/features/staff";

export type CapFormState = { saved?: boolean; error?: string };

/**
 * Staff set one business's monthly AI cap (T32). Admins only (`admin.caps.manage`), checked here
 * too: a Server Action is reachable without the page. Owners have no update grant on the column.
 */
export async function updateAiCap(_prev: CapFormState, formData: FormData): Promise<CapFormState> {
  const user = await getCurrentUser();
  if (!(await hasPermission("admin.caps.manage"))) return { error: "Not available." };
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

export type PlanSettingsState = { saved?: boolean; error?: string };

/**
 * Staff → Plans (design "Billing round 2", approved 18 Nov): what each plan includes, all three
 * plans saved together. Admins only (`admin.caps.manage`), checked here too. Who and when: on
 * each row, and one audit row per changed plan.
 */
export async function updatePlanSettings(
  _prev: PlanSettingsState,
  formData: FormData,
): Promise<PlanSettingsState> {
  const user = await getCurrentUser();
  if (!(await hasPermission("admin.caps.manage"))) return { error: "Not available." };
  const ids: PlanId[] = ["solo", "business", "team"];
  const parsed = [];
  for (const id of ids) {
    const r = parsePlanSettings(id, (field) => formData.get(`${id}.${field}`));
    if ("error" in r) return { error: r.error };
    parsed.push({ id, ...r.value });
  }
  const now = new Date().toISOString();
  const { error } = await getServiceClient()
    .from("plan_settings")
    .upsert(
      parsed.map((p) => ({
        plan: p.id,
        brands_limit: p.brands,
        accounts: p.accounts,
        replies: p.replies,
        team: p.team,
        auto_reply: p.autoReply,
        leads_flagged: p.leadsFlagged,
        follow_ups: p.followUps,
        for_sale: p.forSale,
        updated_at: now,
        updated_by: user.id,
      })),
    );
  if (error) return { error: "Couldn't save. Please try again." };
  revalidatePath("/admin/plans");
  revalidatePath("/settings/billing");
  return { saved: true };
}
