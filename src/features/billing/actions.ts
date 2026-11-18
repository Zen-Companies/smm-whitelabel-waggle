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
 * each changed row, and each change kept in plan_settings_changes (before and after).
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
  const db = getServiceClient();
  const { data: rows } = await db
    .from("plan_settings")
    .select(
      "plan, brands_limit, accounts, replies, team, auto_reply, leads_flagged, follow_ups, for_sale",
    );
  const now = new Date().toISOString();
  for (const p of parsed) {
    const after = {
      brands_limit: p.brands,
      accounts: p.accounts,
      replies: p.replies,
      team: p.team,
      auto_reply: p.autoReply,
      leads_flagged: p.leadsFlagged,
      follow_ups: p.followUps,
      for_sale: p.forSale,
    };
    const old = (rows ?? []).find((r) => r.plan === p.id);
    const before = old
      ? {
          brands_limit: old.brands_limit,
          accounts: old.accounts,
          replies: old.replies,
          team: old.team,
          auto_reply: old.auto_reply,
          leads_flagged: old.leads_flagged,
          follow_ups: old.follow_ups,
          for_sale: old.for_sale,
        }
      : null;
    // Only plans that changed are saved and recorded.
    if (before && JSON.stringify(before) === JSON.stringify(after)) continue;
    const { error } = await db
      .from("plan_settings")
      .upsert({ plan: p.id, ...after, updated_at: now, updated_by: user.id });
    if (error) return { error: "Couldn't save. Please try again." };
    await db
      .from("plan_settings_changes")
      .insert({ plan: p.id, changed_by: user.id, before: before ?? {}, after });
  }
  revalidatePath("/admin/plans");
  revalidatePath("/plan");
  return { saved: true };
}
