"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getTenantFor, NOT_ALLOWED } from "@/features/tenants";
import { writeAudit } from "@/lib/audit";
import { getLlmClientOrNull } from "@/lib/llm";
import { getServiceClient } from "@/lib/supabase/service";
import { requestSuggestions } from "./gap-run";

// The owner's side of the gap helper (T33): ask for suggestions, or dismiss one. Using one is
// saving the topic (createKbEntry with the suggestion id).

export type SuggestState = { error?: string; added?: number; at?: number };

const REASONS = {
  too_few_questions: "Not enough questions yet. Try again when a few more come in.",
  daily_limit: "That's all for today. Try again tomorrow.",
  ai_cap_reached: "This month's AI allowance is used up, so I can't suggest topics right now.",
  failed: "Something went wrong. Try again in a minute.",
} as const;

export async function suggestTopics(): Promise<SuggestState> {
  const tenant = await getTenantFor("brand.settings");
  if (!tenant) return { error: NOT_ALLOWED };
  const llm = getLlmClientOrNull();
  if (!llm) return { error: REASONS.failed };
  const result = await requestSuggestions(
    { db: getServiceClient(), llm },
    { tenantId: tenant.id, businessName: tenant.name, actor: tenant.userId },
  );
  if (!result.ok) return { error: REASONS[result.reason] };
  revalidatePath("/knowledge-base");
  return { added: result.added, at: Date.now() };
}

const idSchema = z.object({ id: z.uuid() });

export async function dismissSuggestion(formData: FormData): Promise<void> {
  const { id } = idSchema.parse(Object.fromEntries(formData));
  const tenant = await getTenantFor("brand.settings");
  if (!tenant) return;
  const db = getServiceClient();
  const { data } = await db
    .from("kb_suggestions")
    .update({ status: "dismissed", decided_at: new Date().toISOString() })
    .eq("id", id)
    .eq("tenant_id", tenant.id)
    .eq("status", "pending")
    .select("id");
  if (data?.length) {
    await writeAudit(db, {
      tenantId: tenant.id,
      action: "kb_suggestion_dismissed",
      actor: tenant.userId,
      details: { suggestionId: id },
    });
  }
  revalidatePath("/knowledge-base");
}
