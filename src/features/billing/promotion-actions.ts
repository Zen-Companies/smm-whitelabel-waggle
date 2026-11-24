"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { hasPermission } from "@/features/staff";
import type { Json } from "@/lib/supabase/database.types";
import { getCurrentUser } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import {
  changedFields,
  newPromotionFields,
  parsePromotionForm,
  PROMOTION_ID,
  type PromotionFields,
} from "./promotion-records";
import { clearPromotionsCache } from "./promotions-store";

// Staff → Promotions (docs/plans/promotions.md, 24 Nov), on the Staff → Plans pattern: admins only
// (`admin.caps.manage`, checked here too: a Server Action is reachable without the page), every
// change kept in promotion_changes (who, when, before and after). Promotions are global, so there
// is no brand to file an audit_log row under: promotion_changes is their audit trail, like
// plan_settings_changes is for plans.

export type PromotionFormState = { saved?: boolean; error?: string };

const PATH = "/admin/promotions";

/** Every promotion surface reads the promotions: refresh them all. */
function refresh(id: string) {
  clearPromotionsCache();
  revalidatePath(PATH);
  revalidatePath(`${PATH}/${id}`);
  revalidatePath("/", "layout");
}

async function record(
  id: string,
  by: string,
  action: "created" | "updated" | "enabled" | "disabled",
  before: Record<string, unknown>,
  after: Record<string, unknown>,
) {
  const { error } = await getServiceClient()
    .from("promotion_changes")
    .insert({
      promotion_id: id,
      changed_by: by,
      action,
      before: before as Json,
      after: after as Json,
    });
  if (error) console.error("billing: recording a promotion change failed", { id, action });
}

const createSchema = z.object({
  kind: z.enum(["seasonal", "referral"], { error: "Pick seasonal or referral." }),
  id: z
    .string()
    .trim()
    .toLowerCase()
    .regex(PROMOTION_ID, "Short name: 3–40 lowercase letters, digits or dashes."),
  name: z.string().trim().min(1, "Name: give it a name.").max(60, "Name: 60 characters at most."),
});

/** New promotion, off until staff switch it on; then its edit page. */
export async function createPromotion(
  _prev: PromotionFormState,
  formData: FormData,
): Promise<PromotionFormState> {
  if (!(await hasPermission("admin.caps.manage"))) return { error: "Not available." };
  const user = await getCurrentUser();
  const parsed = createSchema.safeParse({
    kind: formData.get("kind"),
    id: formData.get("id"),
    name: formData.get("name"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check." };
  const { kind, id, name } = parsed.data;
  const db = getServiceClient();
  const { data: taken } = await db.from("promotions").select("id").eq("id", id).maybeSingle();
  if (taken) return { error: "That short name is taken. Pick another." };
  const fields = newPromotionFields(kind, id, name);
  const { error } = await db
    .from("promotions")
    .insert({ ...fields, updated_by: user.id, updated_at: new Date().toISOString() });
  if (error) return { error: "Couldn't create it. Please try again." };
  await record(id, user.id, "created", {}, fields);
  refresh(id);
  redirect(`${PATH}/${id}`);
}

const idSchema = z.string().regex(PROMOTION_ID);

/** The edit form: every field, checked; only a real change is saved and recorded. */
export async function updatePromotion(
  _prev: PromotionFormState,
  formData: FormData,
): Promise<PromotionFormState> {
  if (!(await hasPermission("admin.caps.manage"))) return { error: "Not available." };
  const user = await getCurrentUser();
  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return { error: "That promotion wasn't found." };
  const parsed = parsePromotionForm((f) => formData.get(f));
  if ("error" in parsed) return { error: parsed.error };
  const db = getServiceClient();
  const { data: row } = await db.from("promotions").select("*").eq("id", id.data).maybeSingle();
  if (!row) return { error: "That promotion wasn't found." };
  const after: Partial<PromotionFields> = parsed.value;
  const keys = changedFields(row, after);
  if (!keys.length) return { saved: true };
  const before = Object.fromEntries(keys.map((k) => [k, row[k as keyof typeof row] ?? null]));
  const changed = Object.fromEntries(keys.map((k) => [k, after[k as keyof typeof after] ?? null]));
  const { error } = await db
    .from("promotions")
    .update({ ...parsed.value, updated_by: user.id, updated_at: new Date().toISOString() })
    .eq("id", id.data);
  if (error) return { error: "Couldn't save. Please try again." };
  await record(id.data, user.id, "updated", before, changed);
  refresh(id.data);
  return { saved: true };
}

/** The on/off switch on the list and the edit page. */
export async function setPromotionEnabled(
  _prev: PromotionFormState,
  formData: FormData,
): Promise<PromotionFormState> {
  if (!(await hasPermission("admin.caps.manage"))) return { error: "Not available." };
  const user = await getCurrentUser();
  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return { error: "That promotion wasn't found." };
  const enabled = formData.get("enabled") === "on";
  const db = getServiceClient();
  const { data: row } = await db
    .from("promotions")
    .select("enabled")
    .eq("id", id.data)
    .maybeSingle();
  if (!row) return { error: "That promotion wasn't found." };
  if (row.enabled === enabled) return { saved: true };
  const { error } = await db
    .from("promotions")
    .update({ enabled, updated_by: user.id, updated_at: new Date().toISOString() })
    .eq("id", id.data);
  if (error) return { error: "Couldn't switch it. Please try again." };
  await record(
    id.data,
    user.id,
    enabled ? "enabled" : "disabled",
    { enabled: row.enabled },
    { enabled },
  );
  refresh(id.data);
  return { saved: true };
}
