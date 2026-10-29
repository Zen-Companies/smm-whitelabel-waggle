"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentTenant } from "@/features/tenants";
import { writeAudit } from "@/lib/audit";
import { createServerSupabase } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import { AUTONOMY_MODES, CONFIGURABLE_CATEGORIES } from "./autonomy";
import { approveDraft, rejectDraft, REPLY_MAX, type DecisionResult } from "./decisions";

export interface AutonomyFormState {
  error?: string;
  saved?: boolean;
}

const schema = z.object({
  category: z.enum(CONFIGURABLE_CATEGORIES),
  mode: z.enum(AUTONOMY_MODES),
});

/** Owner changes a category's mode (PRD F9). Applies to the next item in that category. */
export async function updateAutonomyMode(
  _prev: AutonomyFormState,
  formData: FormData,
): Promise<AutonomyFormState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Choose a valid mode." };
  const { category, mode } = parsed.data;
  const tenant = await getCurrentTenant();

  // Through RLS: the owner may update `mode` on their own tenant's rows only.
  const supabase = await createServerSupabase();
  const { data: before } = await supabase
    .from("autonomy_settings")
    .select("mode")
    .eq("tenant_id", tenant.id)
    .eq("category", category)
    .single();
  const { data, error } = await supabase
    .from("autonomy_settings")
    .update({ mode })
    .eq("tenant_id", tenant.id)
    .eq("category", category)
    .select("mode");
  if (error || !data?.length) return { error: "Couldn't save. Please try again." };

  if (before?.mode !== mode) {
    await writeAudit(getServiceClient(), {
      tenantId: tenant.id,
      action: "autonomy_mode_changed",
      actor: tenant.userId,
      details: { category, from: before?.mode ?? null, to: mode },
    });
  }
  revalidatePath("/settings");
  return { saved: true };
}

export interface DecisionFormState {
  error?: string;
}

const decisionSchema = z.object({
  intent: z.enum(["approve", "reject"]),
  itemId: z.uuid(),
  draftId: z.uuid(),
  body: z.string().optional(),
});

const DECISION_ERRORS: Record<Exclude<DecisionResult, { ok: true }>["error"], string> = {
  not_found: "This message is no longer here.",
  already_decided: "This reply was already handled.",
  empty_reply: "The reply can't be empty.",
  too_long: `Keep the reply under ${REPLY_MAX} characters.`,
};

/** Approve as is, approve an edited reply, or reject (PRD F8). Tenant from the session only. */
export async function decideDraft(
  _prev: DecisionFormState,
  formData: FormData,
): Promise<DecisionFormState> {
  const parsed = decisionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Something went wrong. Please reload." };
  const { intent, itemId, draftId, body } = parsed.data;
  const tenant = await getCurrentTenant();
  const db = getServiceClient();
  const input = { tenantId: tenant.id, userId: tenant.userId, itemId, draftId };

  const result =
    intent === "approve"
      ? await approveDraft(db, { ...input, editedBody: body ?? null })
      : await rejectDraft(db, input);
  revalidatePath("/inbox", "layout");
  return result.ok ? {} : { error: DECISION_ERRORS[result.error] };
}
