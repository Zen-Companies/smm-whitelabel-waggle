"use server";

import * as Sentry from "@sentry/nextjs";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getTenantFor, NOT_ALLOWED } from "@/features/tenants";
import { writeAudit } from "@/lib/audit";
import { getSocialProvider } from "@/lib/social";
import { getServiceClient } from "@/lib/supabase/service";
import { parseCommentDmForm } from "./comment-dm";

export type AutomationFormState = { error?: string; field?: string; savedAt?: number };

const UNAVAILABLE = "That couldn't be saved right now. Try again in a moment.";

/**
 * Create or edit a comment-to-DM automation (T77a). It answers comments on its own, so only
 * people who can change the brand's settings may set one up (owner, admin).
 */
export async function saveCommentDm(
  _prev: AutomationFormState,
  formData: FormData,
): Promise<AutomationFormState> {
  const tenant = await getTenantFor("brand.settings");
  if (!tenant) return { error: NOT_ALLOWED };
  if (!tenant.zernioProfileId) return { error: "Connect an account first." };
  const parsed = parseCommentDmForm(formData);
  if (!parsed.ok) return { error: parsed.error, field: parsed.field };

  const db = getServiceClient();
  // The account must be this brand's own (Zernio accepts any account of the team).
  const { data: account } = await db
    .from("social_accounts")
    .select("id")
    .eq("tenant_id", tenant.id)
    .eq("zernio_account_id", parsed.value.accountId)
    .eq("status", "active")
    .maybeSingle();
  if (!account) return { error: "Pick one of this brand's connected accounts.", field: "accountId" };

  const id = String(formData.get("id") ?? "") || null;
  const turnOn = formData.get("intent") !== "draft";
  try {
    if (id) {
      await getSocialProvider().updateCommentAutomation({
        id,
        automation: parsed.value,
        isActive: turnOn,
        signal: AbortSignal.timeout(15_000),
      });
    } else {
      await getSocialProvider().createCommentAutomation({
        profileId: tenant.zernioProfileId,
        automation: parsed.value,
        isActive: turnOn,
        signal: AbortSignal.timeout(15_000),
      });
    }
  } catch (error) {
    Sentry.captureException(error, { extra: { tenantId: tenant.id, step: "saveCommentDm" } });
    return { error: UNAVAILABLE };
  }
  await writeAudit(db, {
    tenantId: tenant.id,
    action: id ? "automation_updated" : "automation_created",
    actor: tenant.userId,
    details: { kind: "comment_dm", active: turnOn, keywords: parsed.value.keywords.length },
  });
  revalidatePath("/automations");
  return { savedAt: Date.now() };
}

const toggleSchema = z.object({ id: z.string().min(1), on: z.enum(["yes", "no"]) });

/** Turn an automation on or off. */
export async function toggleCommentDm(
  _prev: AutomationFormState,
  formData: FormData,
): Promise<AutomationFormState> {
  const tenant = await getTenantFor("brand.settings");
  if (!tenant) return { error: NOT_ALLOWED };
  const parsed = toggleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success || !(await ownsAutomation(tenant.zernioProfileId, parsed.data.id))) {
    return { error: "Something went wrong. Reload the page." };
  }
  try {
    await getSocialProvider().updateCommentAutomation({
      id: parsed.data.id,
      isActive: parsed.data.on === "yes",
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    Sentry.captureException(error, { extra: { tenantId: tenant.id, step: "toggleCommentDm" } });
    return { error: UNAVAILABLE };
  }
  await writeAudit(getServiceClient(), {
    tenantId: tenant.id,
    action: parsed.data.on === "yes" ? "automation_turned_on" : "automation_turned_off",
    actor: tenant.userId,
    details: { kind: "comment_dm", automationId: parsed.data.id },
  });
  revalidatePath("/automations");
  return { savedAt: Date.now() };
}

/** Delete an automation for good. */
export async function deleteCommentDm(
  _prev: AutomationFormState,
  formData: FormData,
): Promise<AutomationFormState> {
  const tenant = await getTenantFor("brand.settings");
  if (!tenant) return { error: NOT_ALLOWED };
  const id = String(formData.get("id") ?? "");
  if (!id || !(await ownsAutomation(tenant.zernioProfileId, id))) {
    return { error: "Something went wrong. Reload the page." };
  }
  try {
    await getSocialProvider().deleteCommentAutomation({ id, signal: AbortSignal.timeout(15_000) });
  } catch (error) {
    Sentry.captureException(error, { extra: { tenantId: tenant.id, step: "deleteCommentDm" } });
    return { error: UNAVAILABLE };
  }
  await writeAudit(getServiceClient(), {
    tenantId: tenant.id,
    action: "automation_deleted",
    actor: tenant.userId,
    details: { kind: "comment_dm", automationId: id },
  });
  revalidatePath("/automations");
  return { savedAt: Date.now() };
}

/** Zernio ids aren't scoped to a brand: only act on one listed under this brand's profile. */
async function ownsAutomation(profileId: string | null, id: string): Promise<boolean> {
  if (!profileId) return false;
  const list = await getSocialProvider().listCommentAutomations({
    profileId,
    signal: AbortSignal.timeout(10_000),
  });
  return list.some((a) => a.id === id);
}
