"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { getTenantFor, NOT_ALLOWED } from "@/features/tenants";
import { writeAudit } from "@/lib/audit";
import { createServerSupabase } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import { AUTONOMY_MODES, CONFIGURABLE_CATEGORIES } from "./autonomy";
import { getSocialProvider } from "@/lib/social";
import {
  approveDraft,
  hideSpamComment,
  markHandled,
  markNotSpam,
  replyPublicly,
  unhideComment,
  rejectDraft,
  REPLY_MAX,
  undoApproval,
  writeTemplateReply,
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
  const tenant = await getTenantFor("brand.settings");
  if (!tenant) return { error: NOT_ALLOWED };

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
  replyVia: z.enum(["public", "dm"]).optional(),
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
  const { intent, itemId, draftId, body, replyVia } = parsed.data;
  const tenant = await getTenantFor("replies.approve");
  if (!tenant) return { error: NOT_ALLOWED };
  const db = getServiceClient();
  const input = { tenantId: tenant.id, userId: tenant.userId, itemId, draftId };

  if (intent === "reject") {
    const result = await rejectDraft(db, input);
    revalidatePath("/inbox", "layout");
    return result.ok ? { rejected: true } : { error: DECISION_ERRORS[result.error] };
  }
  const result = await approveDraft(db, { ...input, editedBody: body ?? null, replyVia });
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
  const tenant = await getTenantFor("replies.approve");
  if (!tenant) return { error: NOT_ALLOWED };
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
  const tenant = await getTenantFor("replies.approve");
  if (!tenant) return { error: NOT_ALLOWED };
  const ids = { tenantId: tenant.id, userId: tenant.userId, itemId: parsed.data.itemId };
  // "It's spam: hide it" on a comment also hides it on the post (T40). A DM can't be hidden, so
  // it only leaves the inbox (hideSpamComment answers not_found for anything but a comment).
  if (parsed.data.asSpam === "1") {
    const hidden = await hideSpamComment(
      { db: getServiceClient(), social: getSocialProvider() },
      ids,
    );
    if (hidden.ok || hidden.error !== "not_found") {
      revalidatePath("/inbox", "layout");
      if (hidden.ok) return {};
      return {
        error:
          hidden.error === "hide_failed"
            ? "Couldn't hide it just now. Please try again in a minute."
            : DECISION_ERRORS[hidden.error],
      };
    }
  }
  const result = await markHandled(getServiceClient(), {
    ...ids,
    asSpam: parsed.data.asSpam === "1",
  });
  revalidatePath("/inbox", "layout");
  return result.ok ? {} : { error: DECISION_ERRORS[result.error] };
}

export interface SpamFormState {
  error?: string;
  /** "gone": the platform says the comment no longer exists. */
  outcome?: "hidden" | "gone" | "unhidden" | "not_spam";
}

const itemOnly = z.object({ itemId: z.uuid() });

/** "Hide on Instagram/Facebook" on a spam comment (T40). Feedback in place, never a toast. */
export async function hideSpamAction(
  _prev: SpamFormState,
  formData: FormData,
): Promise<SpamFormState> {
  const parsed = itemOnly.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Something went wrong. Please reload." };
  const tenant = await getTenantFor("replies.approve");
  if (!tenant) return { error: NOT_ALLOWED };
  const result = await hideSpamComment(
    { db: getServiceClient(), social: getSocialProvider() },
    { tenantId: tenant.id, userId: tenant.userId, itemId: parsed.data.itemId },
  );
  revalidatePath("/inbox", "layout");
  if (result.ok) return { outcome: result.outcome };
  return {
    error:
      result.error === "hide_failed"
        ? "Couldn't hide it just now. Please try again in a minute."
        : DECISION_ERRORS[result.error],
  };
}

/** "Unhide" (T40): the comment shows on the post again. */
export async function unhideAction(
  _prev: SpamFormState,
  formData: FormData,
): Promise<SpamFormState> {
  const parsed = itemOnly.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Something went wrong. Please reload." };
  const tenant = await getTenantFor("replies.approve");
  if (!tenant) return { error: NOT_ALLOWED };
  const result = await unhideComment(
    { db: getServiceClient(), social: getSocialProvider() },
    { tenantId: tenant.id, userId: tenant.userId, itemId: parsed.data.itemId },
  );
  revalidatePath("/inbox", "layout");
  if (result.ok) return { outcome: "unhidden" };
  return {
    error:
      result.error === "unhide_failed"
        ? "Couldn't unhide it just now. Please try again in a minute."
        : DECISION_ERRORS.not_found,
  };
}

/** "It's not spam" (T40): it stays in For you, to answer like any other message. */
export async function notSpamAction(
  _prev: SpamFormState,
  formData: FormData,
): Promise<SpamFormState> {
  const parsed = itemOnly.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Something went wrong. Please reload." };
  const tenant = await getTenantFor("replies.approve");
  if (!tenant) return { error: NOT_ALLOWED };
  const result = await markNotSpam(getServiceClient(), {
    tenantId: tenant.id,
    userId: tenant.userId,
    itemId: parsed.data.itemId,
  });
  revalidatePath("/inbox", "layout");
  return result.ok ? { outcome: "not_spam" } : { error: DECISION_ERRORS[result.error] };
}

/** "Reply publicly" (T41): a comment's DM couldn't go out, so it waits for approval again. */
export async function replyPubliclyAction(
  _prev: DecisionFormState,
  formData: FormData,
): Promise<DecisionFormState> {
  const parsed = itemOnly.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Something went wrong. Please reload." };
  const tenant = await getTenantFor("replies.approve");
  if (!tenant) return { error: NOT_ALLOWED };
  const result = await replyPublicly(getServiceClient(), {
    tenantId: tenant.id,
    userId: tenant.userId,
    itemId: parsed.data.itemId,
  });
  revalidatePath("/inbox", "layout");
  return result.ok ? {} : { error: DECISION_ERRORS[result.error] };
}

export type AutoHideFormState = { error?: string; saved?: boolean };

/** "Hide spam comments for me" (T40), Settings → Replies. Off by default. */
export async function setAutoHideSpam(
  _prev: AutoHideFormState,
  formData: FormData,
): Promise<AutoHideFormState> {
  const on = formData.get("autoHide") === "on";
  const tenant = await getTenantFor("brand.settings");
  if (!tenant) return { error: NOT_ALLOWED };
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("tenants")
    .update({ auto_hide_spam: on })
    .eq("id", tenant.id)
    .select("id");
  if (error || !data?.length) return { error: "Couldn't change that. Please try again." };
  await writeAudit(getServiceClient(), {
    tenantId: tenant.id,
    action: on ? "auto_hide_spam_on" : "auto_hide_spam_off",
    actor: tenant.userId,
    details: {},
  });
  revalidatePath("/settings");
  return { saved: true };
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
  const tenant = await getTenantFor("brand.settings");
  if (!tenant) return { error: NOT_ALLOWED };
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

const TEMPLATE_ERRORS: Record<string, string> = {
  not_found: "This message is gone. Reload the page.",
  already_decided: "This message was already dealt with.",
  not_whatsapp: "Templates are for WhatsApp chats only.",
  template_not_ready: "That template isn't approved by Meta (any more). Pick another.",
  needs_more: "That template needs more details than a name. Send it from WhatsApp instead.",
};

/** T67: restart a WhatsApp chat after the 24-hour window with an approved template. */
export async function sendTemplateAction(
  _prev: DecisionFormState,
  formData: FormData,
): Promise<DecisionFormState> {
  const parsed = z
    .object({ itemId: z.uuid(), templateId: z.string().min(1).max(100) })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Pick a template." };
  const tenant = await getTenantFor("replies.approve");
  if (!tenant) return { error: NOT_ALLOWED };
  const db = getServiceClient();
  let result;
  try {
    result = await writeTemplateReply(
      { db, social: getSocialProvider() },
      { tenantId: tenant.id, userId: tenant.userId, ...parsed.data },
    );
  } catch {
    return { error: "Couldn't reach WhatsApp just now. Try again in a minute." };
  }
  if (!result.ok) return { error: TEMPLATE_ERRORS[result.error] };
  after(() => sendApprovedReplyAfterUndoWindow(db, parsed.data.itemId));
  return { approved: { at: new Date().toISOString() } };
}
