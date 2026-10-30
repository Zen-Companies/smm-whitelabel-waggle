"use server";

import { z } from "zod";
import { getCurrentTenant } from "@/features/tenants";
import { writeAudit } from "@/lib/audit";
import { CATEGORIES } from "@/lib/classifier/types";
import type { Json } from "@/lib/supabase/database.types";
import { getServiceClient } from "@/lib/supabase/service";
import { LAB_TEXT_MAX } from "./form";
import { practiceCard, type PracticeCard } from "./practice-copy";
import { practiceTriesLeft } from "./practice-limit";
import { loadTenantSnapshot, runVariant } from "./run";
import { currentVariant } from "./variants";

// The owner's practice box (T26): the business's own setup, real AI calls recorded as
// `practice`, nothing sent and nothing written to the inbox. Limited per business per day.

export interface PracticeTry {
  text: string;
  kind: "comment" | "dm";
  card: PracticeCard;
}

export type PracticeState = { tried?: PracticeTry; triesLeft?: number; error?: string };

const trySchema = z.object({
  kind: z.enum(["comment", "dm"]),
  text: z.string().trim().min(1, "Type a message to try.").max(LAB_TEXT_MAX),
});

export async function tryMessage(_prev: PracticeState, formData: FormData): Promise<PracticeState> {
  const parsed = trySchema.safeParse({ kind: formData.get("kind"), text: formData.get("text") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const tenant = await getCurrentTenant();
  const db = getServiceClient();
  const left = await practiceTriesLeft(db, tenant.id);
  if (left <= 0) return { error: "No tries left today. More tomorrow.", triesLeft: 0 };

  const snapshot = await loadTenantSnapshot(db, tenant.id);
  const run = await runVariant(db, {
    tenant: snapshot,
    text: parsed.data.text,
    kind: parsed.data.kind,
    variant: currentVariant(),
    source: "practice",
    stopAfter: "policy",
  });
  await db.from("lab_runs").insert({
    tenant_id: tenant.id,
    created_by: tenant.userId,
    kind: parsed.data.kind,
    text: parsed.data.text,
    origin: "owner",
    results: { practice: run } as unknown as Json,
  });
  return {
    tried: { ...parsed.data, card: practiceCard(run.result) },
    triesLeft: left - 1,
  };
}

export type CorrectionState = { saved?: boolean; error?: string };

const correctionSchema = z.object({
  kind: z.enum(["comment", "dm"]),
  text: z.string().trim().min(1).max(LAB_TEXT_MAX),
  category: z.enum(CATEGORIES),
});

/**
 * "Right" or "Not quite": the message and what it really is, as the business's own test case
 * (lab_cases, origin owner). Later these become the business's examples.
 */
export async function saveCorrection(
  _prev: CorrectionState,
  formData: FormData,
): Promise<CorrectionState> {
  const parsed = correctionSchema.safeParse({
    kind: formData.get("kind"),
    text: formData.get("text"),
    category: formData.get("category"),
  });
  if (!parsed.success) return { error: "Pick what this message is." };
  const tenant = await getCurrentTenant();
  const { error } = await getServiceClient().from("lab_cases").insert({
    tenant_id: tenant.id,
    set_name: "Owner checks",
    kind: parsed.data.kind,
    text: parsed.data.text,
    expected_category: parsed.data.category,
    origin: "owner",
    created_by: tenant.userId,
  });
  if (error) return { error: "Couldn't save that. Try again." };
  // Rule 11: an owner action. The message text stays out of the audit row.
  await writeAudit(getServiceClient(), {
    tenantId: tenant.id,
    action: "practice_correction",
    actor: tenant.userId,
    details: { category: parsed.data.category, kind: parsed.data.kind },
  });
  return { saved: true };
}
