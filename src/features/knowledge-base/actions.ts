"use server";

import * as Sentry from "@sentry/nextjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { getCurrentTenant } from "@/features/tenants";
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
  const tenant = await getCurrentTenant();

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
  revalidatePath("/knowledge-base");
  // Open the new topic in the editor (design v2: one topic at a time).
  redirect(`/knowledge-base?topic=${data.id}`);
}

export async function updateKbEntry(_prev: KbFormState, formData: FormData): Promise<KbFormState> {
  const parsed = entrySchema.merge(idSchema).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { id, title, content } = parsed.data;
  const tenant = await getCurrentTenant();

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
  revalidatePath("/knowledge-base");
  return { saved: true };
}

export async function deleteKbEntry(formData: FormData): Promise<void> {
  const { id } = idSchema.parse(Object.fromEntries(formData));
  const tenant = await getCurrentTenant();
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
  revalidatePath("/knowledge-base");
  redirect("/knowledge-base");
}
