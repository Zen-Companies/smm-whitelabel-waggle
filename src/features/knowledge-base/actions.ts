"use server";

import * as Sentry from "@sentry/nextjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { getTenantFor, NOT_ALLOWED } from "@/features/tenants";
import { writeAudit } from "@/lib/audit";
import { getLlmClientOrNull } from "@/lib/llm";
import { createServerSupabase } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import { embedEntry } from "./embeddings";
import { BLANK, hasBlanks } from "./gap-helper";
import { KB_CONTENT_MAX, KB_TITLE_MAX } from "./limits";

export interface KbFormState {
  error?: string;
  saved?: boolean;
  /** Changes on each successful create, so the form can clear itself. */
  savedAt?: number;
}

const entrySchema = z.object({
  title: z.string().trim().min(1, "Add a title").max(KB_TITLE_MAX),
  content: z
    .string()
    .trim()
    .min(1, "Add the details")
    .max(KB_CONTENT_MAX)
    // A suggested topic (T33) has blanks for the owner's facts: they're filled in before saving.
    .refine((c) => !hasBlanks(c), `Fill in each ${BLANK} with your own details first.`),
});
/** Saving a suggested topic (T33) accepts the suggestion. */
const createSchema = entrySchema.extend({ suggestionId: z.uuid().optional() });
const idSchema = z.object({ id: z.uuid() });

/** Embeds after the response is sent; if it fails or isn't configured, the job sweep retries. */
function embedLater(entryId: string) {
  after(async () => {
    const llm = getLlmClientOrNull();
    if (!llm) return;
    try {
      await embedEntry({ db: getServiceClient(), llm }, entryId);
    } catch (error) {
      Sentry.captureException(error, { extra: { kbEntryId: entryId } });
    }
  });
}

export async function createKbEntry(_prev: KbFormState, formData: FormData): Promise<KbFormState> {
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { suggestionId, ...entry } = parsed.data;
  const tenant = await getTenantFor("brand.settings");
  if (!tenant) return { error: NOT_ALLOWED };

  // Through RLS: owners may insert title/content for their own tenant.
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("kb_entries")
    .insert({ tenant_id: tenant.id, ...entry })
    .select("id")
    .single();
  if (error) return { error: "Couldn't save. Please try again." };

  await writeAudit(getServiceClient(), {
    tenantId: tenant.id,
    action: "kb_entry_created",
    actor: tenant.userId,
    details: { kbEntryId: data.id },
  });
  if (suggestionId) {
    const { data: accepted } = await getServiceClient()
      .from("kb_suggestions")
      .update({ status: "accepted", decided_at: new Date().toISOString(), kb_entry_id: data.id })
      .eq("id", suggestionId)
      .eq("tenant_id", tenant.id)
      .eq("status", "pending")
      .select("id");
    if (accepted?.length) {
      await writeAudit(getServiceClient(), {
        tenantId: tenant.id,
        action: "kb_suggestion_accepted",
        actor: tenant.userId,
        details: { suggestionId, kbEntryId: data.id },
      });
    }
  }
  embedLater(data.id);
  revalidatePath("/teach/business-info");
  revalidatePath("/teach");
  // Open the new topic in the editor (design v2: one topic at a time).
  redirect(`/teach/business-info?topic=${data.id}`);
}

export interface AnswerState {
  error?: string;
  /** The question just answered, so the list can move on. */
  saved?: string;
  savedAt?: number;
}

const answerSchema = z.object({
  question: z.string().trim().min(1).max(2000),
  answer: z
    .string()
    .trim()
    .min(1, "Write a short answer first.")
    .max(KB_CONTENT_MAX, "Keep it shorter."),
});

/**
 * Teach Waggle (T73): a customer's question the answers don't cover, answered in place. It
 * becomes an answer titled with the question, so Waggle can use it next time.
 */
export async function answerQuestionAction(
  _prev: AnswerState,
  formData: FormData,
): Promise<AnswerState> {
  const parsed = answerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const tenant = await getTenantFor("brand.settings");
  if (!tenant) return { error: NOT_ALLOWED };
  const question = parsed.data.question.replace(/\s+/g, " ");
  const title =
    question.length > KB_TITLE_MAX ? `${question.slice(0, KB_TITLE_MAX - 1).trimEnd()}…` : question;
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("kb_entries")
    .insert({ tenant_id: tenant.id, title, content: parsed.data.answer })
    .select("id")
    .single();
  if (error) return { error: "Couldn't save. Please try again." };
  await writeAudit(getServiceClient(), {
    tenantId: tenant.id,
    action: "kb_entry_created",
    actor: tenant.userId,
    details: { kbEntryId: data.id, from: "teach_question" },
  });
  embedLater(data.id);
  revalidatePath("/teach");
  revalidatePath("/teach/business-info");
  return { saved: parsed.data.question, savedAt: Date.now() };
}

/**
 * First-time setup (T73b): the owner's answers to the questions their kind of business gets most,
 * saved as answers titled with the question. One already there with the same title is left alone,
 * so going back through setup never doubles them. Returns how many were saved.
 */
export async function addStarterAnswers(
  pairs: { question: string; answer: string }[],
): Promise<{ saved: number } | { error: string }> {
  const parsed = z.array(answerSchema).max(10).safeParse(pairs);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const tenant = await getTenantFor("brand.settings");
  if (!tenant) return { error: NOT_ALLOWED };
  const supabase = await createServerSupabase();
  const { data: existing } = await supabase
    .from("kb_entries")
    .select("title")
    .eq("tenant_id", tenant.id);
  const have = new Set((existing ?? []).map((e) => e.title.trim().toLowerCase()));
  let saved = 0;
  for (const p of parsed.data) {
    const title = p.question.slice(0, KB_TITLE_MAX);
    if (have.has(title.toLowerCase())) continue;
    const { data, error } = await supabase
      .from("kb_entries")
      .insert({ tenant_id: tenant.id, title, content: p.answer })
      .select("id")
      .single();
    if (error) return { error: "Couldn't save. Please try again." };
    await writeAudit(getServiceClient(), {
      tenantId: tenant.id,
      action: "kb_entry_created",
      actor: tenant.userId,
      details: { kbEntryId: data.id, from: "setup" },
    });
    embedLater(data.id);
    have.add(title.toLowerCase());
    saved += 1;
  }
  revalidatePath("/teach");
  revalidatePath("/teach/business-info");
  return { saved };
}

/**
 * "Add an answer" under a practice try (approved 17 Nov): one answer, made searchable before this
 * returns so the same message can be tried again right away (a new answer is otherwise embedded
 * after the response). A question already in Business info is refused in place.
 */
export async function addAnswerNow(pair: {
  question: string;
  answer: string;
}): Promise<{ id: string; title: string } | { error: string }> {
  const parsed = answerSchema.safeParse(pair);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const tenant = await getTenantFor("brand.settings");
  if (!tenant) return { error: NOT_ALLOWED };
  const supabase = await createServerSupabase();
  const title = parsed.data.question.slice(0, KB_TITLE_MAX);
  const { data: same } = await supabase
    .from("kb_entries")
    .select("id")
    .eq("tenant_id", tenant.id)
    .ilike(
      "title",
      title.replace(/[\\%_]/g, (c) => `\\${c}`),
    )
    .limit(1);
  if (same?.length) {
    return { error: "There's already an answer with this question. Change the question a little." };
  }
  const { data, error } = await supabase
    .from("kb_entries")
    .insert({ tenant_id: tenant.id, title, content: parsed.data.answer })
    .select("id")
    .single();
  if (error) return { error: "Couldn't save. Please try again." };
  await writeAudit(getServiceClient(), {
    tenantId: tenant.id,
    action: "kb_entry_created",
    actor: tenant.userId,
    details: { kbEntryId: data.id, from: "practice" },
  });
  const llm = getLlmClientOrNull();
  try {
    if (llm) await embedEntry({ db: getServiceClient(), llm }, data.id);
  } catch (e) {
    // The sweep embeds it later; the try again just won't find it yet.
    Sentry.captureException(e, { extra: { kbEntryId: data.id } });
  }
  revalidatePath("/teach");
  revalidatePath("/teach/business-info");
  return { id: data.id, title };
}

export async function updateKbEntry(_prev: KbFormState, formData: FormData): Promise<KbFormState> {
  const parsed = entrySchema.merge(idSchema).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { id, title, content } = parsed.data;
  const tenant = await getTenantFor("brand.settings");
  if (!tenant) return { error: NOT_ALLOWED };

  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("kb_entries")
    .update({ title, content })
    .eq("id", id)
    .eq("tenant_id", tenant.id)
    .select("id, embedding");
  if (error || !data?.length) return { error: "Couldn't save. Please try again." };

  await writeAudit(getServiceClient(), {
    tenantId: tenant.id,
    action: "kb_entry_updated",
    actor: tenant.userId,
    details: { kbEntryId: id },
  });
  // Unchanged text keeps its embedding; changed text was cleared by the T1 trigger.
  if (data[0].embedding === null) embedLater(id);
  revalidatePath("/teach/business-info");
  revalidatePath("/teach");
  return { saved: true };
}

export async function deleteKbEntry(formData: FormData): Promise<void> {
  const { id } = idSchema.parse(Object.fromEntries(formData));
  const tenant = await getTenantFor("brand.settings");
  if (!tenant) return;
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("kb_entries")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenant.id)
    .select("id");
  if (data?.length) {
    await writeAudit(getServiceClient(), {
      tenantId: tenant.id,
      action: "kb_entry_deleted",
      actor: tenant.userId,
      details: { kbEntryId: id },
    });
  }
  revalidatePath("/teach/business-info");
  revalidatePath("/teach");
  redirect("/teach/business-info");
}
