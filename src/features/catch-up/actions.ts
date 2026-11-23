"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import * as Sentry from "@sentry/nextjs";
import { getProductionSteps } from "@/features/inbox";
import { getTenantFor } from "@/features/tenants";
import { writeAudit } from "@/lib/audit";
import { getServiceClient } from "@/lib/supabase/service";
import { draftOnOpen, redraftNow, type DraftOnOpenOutcome } from "./draft-on-open";

const idSchema = z.object({ id: z.uuid() });

/**
 * First connect (20 Nov), "draft on open": call when the owner opens a pulled item that has no
 * draft yet (status awaiting_draft). Drafts it now (up to ~40 s; the AI cap and the plan's reply
 * limit apply as for any message) or leaves it to the job ("queued": show it as being written and
 * refresh). Anything else answers not_waiting / not_allowed / failed, and the item stays as it is.
 */
export async function draftPulledItem(
  itemId: string,
): Promise<DraftOnOpenOutcome | { outcome: "not_allowed" | "failed" }> {
  const parsed = z.uuid().safeParse(itemId);
  if (!parsed.success) return { outcome: "not_waiting" };
  const tenant = await getTenantFor("replies.approve");
  if (!tenant) return { outcome: "not_allowed" };
  try {
    const result = await draftOnOpen(
      { db: getServiceClient(), steps: getProductionSteps() },
      { tenantId: tenant.id, itemId: parsed.data, actor: tenant.userId },
    );
    if (result.outcome === "drafted") revalidatePath("/inbox");
    return result;
  } catch (error) {
    Sentry.captureException(error, { extra: { itemId: parsed.data } });
    return { outcome: "failed" };
  }
}

/**
 * Setup's "customers still waiting" (20 Nov): after the owner's facts were saved as an answer,
 * write the reply to this pulled message again now (redraftNow). Same outcomes as draftPulledItem.
 */
export async function redraftPulledItem(
  itemId: string,
): Promise<DraftOnOpenOutcome | { outcome: "not_allowed" | "failed" }> {
  const parsed = z.uuid().safeParse(itemId);
  if (!parsed.success) return { outcome: "not_waiting" };
  const tenant = await getTenantFor("replies.approve");
  if (!tenant) return { outcome: "not_allowed" };
  try {
    return await redraftNow(
      { db: getServiceClient(), steps: getProductionSteps() },
      { tenantId: tenant.id, itemId: parsed.data, actor: tenant.userId },
    );
  } catch (error) {
    Sentry.captureException(error, { extra: { itemId: parsed.data } });
    return { outcome: "failed" };
  }
}

/** Hides Today's catch-up card (the missed list stays in the Inbox). */
export async function dismissCatchUp(formData: FormData): Promise<void> {
  const parsed = idSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const tenant = await getTenantFor("inbox.read");
  if (!tenant) return;
  const db = getServiceClient();
  const { data } = await db
    .from("catch_ups")
    .update({ dismissed_at: new Date().toISOString(), dismissed_by: tenant.userId })
    .eq("id", parsed.data.id)
    .eq("tenant_id", tenant.id)
    .is("dismissed_at", null)
    .select("id");
  if (data?.length) {
    await writeAudit(db, {
      tenantId: tenant.id,
      action: "catch_up_dismissed",
      actor: tenant.userId,
      details: { catchUpId: parsed.data.id },
    });
  }
  revalidatePath("/today");
}

/** Hides "Your customers' top 3 questions are ready" (Today and setup step 3), in place. */
export async function dismissTopQuestionsNotice(formData: FormData): Promise<void> {
  const parsed = idSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const tenant = await getTenantFor("brand.settings");
  if (!tenant) return;
  const db = getServiceClient();
  const { data } = await db
    .from("catch_ups")
    .update({
      top_questions_notice_dismissed_at: new Date().toISOString(),
      top_questions_notice_dismissed_by: tenant.userId,
    })
    .eq("id", parsed.data.id)
    .eq("tenant_id", tenant.id)
    .is("top_questions_notice_dismissed_at", null)
    .select("id");
  if (data?.length) {
    await writeAudit(db, {
      tenantId: tenant.id,
      action: "catch_up_top_questions_notice_dismissed",
      actor: tenant.userId,
      details: { catchUpId: parsed.data.id },
    });
  }
  revalidatePath("/today");
  revalidatePath("/setup");
}
