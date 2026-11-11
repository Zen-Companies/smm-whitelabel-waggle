"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { hasPermission } from "@/features/staff";
import { getCurrentUser } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import { generateBetaCode, normalizeBetaCode, REDEEM_ERRORS, type RedeemStatus } from "./codes";
import { announceBetaJoin, BETA_FLAG } from "./server";

export type RedeemState = { error?: string; code?: string };

/** "Enter your beta code" (/beta). Accepted: GHL hears about it, then /welcome with a thank-you. */
export async function redeemBetaCode(_prev: RedeemState, formData: FormData): Promise<RedeemState> {
  const raw = String(formData.get("code") ?? "");
  const code = normalizeBetaCode(raw);
  if (!code) return { error: REDEEM_ERRORS.not_found, code: raw };
  const user = await getCurrentUser();
  const db = getServiceClient();
  const { data, error } = await db.rpc("redeem_beta_code", { p_user: user.id, p_code: code });
  if (error) return { error: "Couldn't check the code. Try again in a moment.", code: raw };
  const status = data as RedeemStatus;
  if (status !== "ok" && status !== "already") return { error: REDEEM_ERRORS[status], code: raw };
  await announceBetaJoin(db, user.id);
  redirect("/welcome?beta=1");
}

// ── Staff → Beta codes (admins: beta.manage) ─────────────────────────────────────────────────

export type CodeFormState = { error?: string; created?: string };

async function staffUser() {
  if (!(await hasPermission("beta.manage"))) return null;
  return getCurrentUser();
}

const codeSchema = z.object({
  label: z.string().trim().max(120),
  maxUses: z.union([z.literal(""), z.coerce.number().int().min(1).max(100000)]),
  until: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]),
});

/** New code: generated (WAGGLE-XXXX) or typed; label, use limit and end date are optional. */
export async function createBetaCode(
  _prev: CodeFormState,
  formData: FormData,
): Promise<CodeFormState> {
  const user = await staffUser();
  if (!user) return { error: "Only admins manage beta codes." };
  const parsed = codeSchema.safeParse({
    label: formData.get("label") ?? "",
    maxUses: formData.get("maxUses") ?? "",
    until: formData.get("until") ?? "",
  });
  if (!parsed.success) return { error: "Check the uses (a whole number) and the date." };
  const own = formData.get("kind") === "own";
  const typed = normalizeBetaCode(String(formData.get("code") ?? ""));
  if (own && !typed) return { error: "Codes are 3–32 letters, numbers or dashes." };
  const db = getServiceClient();
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = own ? typed! : generateBetaCode();
    const { error } = await db.from("beta_codes").insert({
      code,
      label: parsed.data.label,
      max_uses: parsed.data.maxUses === "" ? null : parsed.data.maxUses,
      expires_at: parsed.data.until === "" ? null : `${parsed.data.until}T23:59:59+08:00`,
      created_by: user.id,
    });
    if (!error) {
      revalidatePath("/admin/beta");
      return { created: code };
    }
    if (error.code !== "23505") return { error: "Couldn't create the code. Try again." };
    if (own) return { error: `${code} already exists. Pick another.` };
  }
  return { error: "Couldn't create a unique code. Try again." };
}

/** Turn a code off or back on. */
export async function setBetaCodeActive(formData: FormData): Promise<void> {
  if (!(await staffUser())) return;
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return;
  await getServiceClient()
    .from("beta_codes")
    .update({ active: formData.get("active") === "true" })
    .eq("id", id.data);
  revalidatePath("/admin/beta");
}

/** Edit a code's label, use limit or end date. */
export async function updateBetaCode(
  _prev: CodeFormState,
  formData: FormData,
): Promise<CodeFormState> {
  if (!(await staffUser())) return { error: "Only admins manage beta codes." };
  const id = z.uuid().safeParse(formData.get("id"));
  const parsed = codeSchema.safeParse({
    label: formData.get("label") ?? "",
    maxUses: formData.get("maxUses") ?? "",
    until: formData.get("until") ?? "",
  });
  if (!id.success || !parsed.success)
    return { error: "Check the uses (a whole number) and the date." };
  const { error } = await getServiceClient()
    .from("beta_codes")
    .update({
      label: parsed.data.label,
      max_uses: parsed.data.maxUses === "" ? null : parsed.data.maxUses,
      expires_at: parsed.data.until === "" ? null : `${parsed.data.until}T23:59:59+08:00`,
    })
    .eq("id", id.data);
  if (error) return { error: "Couldn't save. Try again." };
  revalidatePath("/admin/beta");
  return { created: "saved" };
}

/** "Beta code required": off opens sign-up to everyone. */
export async function setBetaRequired(formData: FormData): Promise<void> {
  const user = await staffUser();
  if (!user) return;
  const on = formData.get("on") === "true";
  const db = getServiceClient();
  const { data: row } = await db
    .from("feature_flags")
    .select("id")
    .eq("key", BETA_FLAG)
    .is("tenant_id", null)
    .maybeSingle();
  if (row) {
    await db
      .from("feature_flags")
      .update({ enabled: on, updated_by: user.id, updated_at: new Date().toISOString() })
      .eq("id", row.id);
  } else {
    await db
      .from("feature_flags")
      .insert({ key: BETA_FLAG, tenant_id: null, enabled: on, updated_by: user.id });
  }
  revalidatePath("/admin/beta");
}
