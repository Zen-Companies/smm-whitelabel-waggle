"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { getCurrentTenant } from "@/features/tenants";
import { writeAudit } from "@/lib/audit";
import { createServerSupabase } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import { AUTONOMY_MODES, CONFIGURABLE_CATEGORIES } from "./autonomy";
import {
  approveDraft,
  markHandled,
  rejectDraft,
  REPLY_MAX,
  undoApproval,
  type DecisionResult,
} from "./decisions";
import { sendApprovedReplyAfterUndoWindow } from "./send-now";

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
  /** Approved: the card collapses into "Sent to [name]" with Undo (design.md §4). */
  approved?: { at: string };
  rejected?: boolean;
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

/** Approve as is, approve an edited reply, or don't reply (PRD F8). Tenant from the session. */
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

  if (intent === "reject") {
    const result = await rejectDraft(db, input);
    revalidatePath("/inbox", "layout");
    return result.ok ? { rejected: true } : { error: DECISION_ERRORS[result.error] };
  }
  const result = await approveDraft(db, { ...input, editedBody: body ?? null });
  if (!result.ok) return { error: DECISION_ERRORS[result.error] };
  // Sent right after the undo window rather than on the next cron tick.
  after(() => sendApprovedReplyAfterUndoWindow(db, itemId));
  // No revalidate here: the card shows the Sent row with Undo first, then refreshes itself.
  return { approved: { at: new Date().toISOString() } };
}

/** Undo within the window: the reply goes back to waiting (design.md §4). */
export async function undoApprovalAction(
  _prev: DecisionFormState,
  formData: FormData,
): Promise<DecisionFormState> {
  const parsed = decisionSchema
    .pick({ itemId: true, draftId: true })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Something went wrong. Please reload." };
  const tenant = await getCurrentTenant();
  const result = await undoApproval(getServiceClient(), {
    tenantId: tenant.id,
    userId: tenant.userId,
    ...parsed.data,
  });
  revalidatePath("/inbox", "layout");
  return result.ok ? {} : { error: "Too late to undo: the reply is already on its way." };
}

/** The owner replied on the platform (or nothing is needed): it leaves "Needs you". */
export async function markHandledAction(
  _prev: DecisionFormState,
  formData: FormData,
): Promise<DecisionFormState> {
  const parsed = z
    .object({ itemId: z.uuid(), asSpam: z.literal("1").optional() })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Something went wrong. Please reload." };
  const tenant = await getCurrentTenant();
  const result = await markHandled(getServiceClient(), {
    tenantId: tenant.id,
    userId: tenant.userId,
    itemId: parsed.data.itemId,
    asSpam: parsed.data.asSpam === "1",
  });
  revalidatePath("/inbox", "layout");
  return result.ok ? {} : { error: DECISION_ERRORS[result.error] };
}

export type PauseFormState = { error?: string };

/**
 * "Pause all replies" (T27): nothing goes out until the owner turns replies back on. Doesn't
 * change any item's status: policy() and the send step read the switch.
 */
export async function setRepliesPaused(
  _prev: PauseFormState,
  formData: FormData,
): Promise<PauseFormState> {
  const paused = formData.get("paused") === "true";
  const tenant = await getCurrentTenant();
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("tenants")
    .update({ replies_paused: paused })
    .eq("id", tenant.id)
    .select("id");
  if (error || !data?.length) return { error: "Couldn't change that. Please try again." };
  await writeAudit(getServiceClient(), {
    tenantId: tenant.id,
    action: paused ? "replies_paused" : "replies_resumed",
    actor: tenant.userId,
  });
  revalidatePath("/settings");
  revalidatePath("/inbox");
  return {};
}
