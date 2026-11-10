"use server";

import { z } from "zod";
import { getTenantFor, NOT_ALLOWED } from "@/features/tenants";
import { writeAudit } from "@/lib/audit";
import { CATEGORIES } from "@/lib/classifier/types";
import type { Json } from "@/lib/supabase/database.types";
import { getServiceClient } from "@/lib/supabase/service";
import { LAB_TEXT_MAX } from "./form";
import { practiceCard } from "./practice-copy";
import type { RecentTry } from "./practice-data";
import { RECENT_MESSAGES, recentMessagesFor, type RecentMessageResult } from "./recent-messages";

export type { RecentMessageResult };
import { practiceTriesLeft } from "./practice-limit";
import { loadTenantSnapshot, runVariant } from "./run";
import { currentVariant } from "./variants";

// The owner's practice box (T26): the business's own setup, real AI calls recorded as
// `practice`, nothing sent and nothing written to the inbox. Limited per business per day.

export type PracticeTry = RecentTry;

export type PracticeState = { tried?: PracticeTry; triesLeft?: number; error?: string };

const trySchema = z.object({
  kind: z.enum(["comment", "dm"]),
  text: z.string().trim().min(1, "Type a message to try.").max(LAB_TEXT_MAX),
});

export async function tryMessage(_prev: PracticeState, formData: FormData): Promise<PracticeState> {
  const parsed = trySchema.safeParse({ kind: formData.get("kind"), text: formData.get("text") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const tenant = await getTenantFor("brand.settings");
  if (!tenant) return { error: NOT_ALLOWED };
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
  const { data: saved } = await db
    .from("lab_runs")
    .insert({
      tenant_id: tenant.id,
      created_by: tenant.userId,
      kind: parsed.data.kind,
      text: parsed.data.text,
      origin: "owner",
      results: { practice: run } as unknown as Json,
    })
    .select("id, created_at")
    .single();
  return {
    tried: {
      id: saved?.id ?? crypto.randomUUID(),
      at: saved?.created_at ?? new Date().toISOString(),
      ...parsed.data,
      card: practiceCard(run.result),
    },
    triesLeft: left - 1,
  };
}

export type RecentMessagesState = {
  results?: RecentMessageResult[];
  triesLeft?: number;
  error?: string;
};

/**
 * "Your recent messages" (T36 item 3): the business's last real messages through today's setup,
 * next to what happened then. One try each; read-only on the inbox (see recent-messages.ts).
 */
export async function runRecentMessages(): Promise<RecentMessagesState> {
  const tenant = await getTenantFor("brand.settings");
  if (!tenant) return { error: NOT_ALLOWED };
  const db = getServiceClient();
  const left = await practiceTriesLeft(db, tenant.id);
  if (left <= 0) return { error: "No tries left today. More tomorrow.", triesLeft: 0 };
  const results = await recentMessagesFor(db, {
    tenantId: tenant.id,
    userId: tenant.userId,
    limit: Math.min(RECENT_MESSAGES, left),
  });
  if (!results.length) return { error: "No messages yet. They show up here once customers write." };
  return { results, triesLeft: left - results.length };
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
  const tenant = await getTenantFor("brand.settings");
  if (!tenant) return { error: NOT_ALLOWED };
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
