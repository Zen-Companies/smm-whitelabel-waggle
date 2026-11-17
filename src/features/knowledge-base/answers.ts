import { writeAudit } from "@/lib/audit";
import type { ServiceClient } from "@/lib/supabase/service";
import { KB_CONTENT_MAX, KB_TITLE_MAX } from "./limits";

// Business info answers written for a known brand and person, without the browser session: for
// AI assistants (MCP add_answer / update_answer). No AI call here: a new or changed answer has no
// embedding yet, and the jobs route embeds it on its next run (embedPendingEntries), so drafting
// can use it within minutes.

export type SaveAnswerResult =
  | { ok: true; id: string; title: string; created: boolean }
  | { ok: false; error: "duplicate" | "not_found" | "invalid" | "save_failed"; message: string };

const like = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export async function saveAnswer(
  db: ServiceClient,
  input: {
    tenantId: string;
    actor: string;
    /** For AI assistants: who made the change (audit). */
    via?: Record<string, string>;
    /** An existing answer to change; without it a new answer is added. */
    id?: string;
    question: string;
    answer: string;
  },
): Promise<SaveAnswerResult> {
  const title = input.question.trim().slice(0, KB_TITLE_MAX);
  const content = input.answer.trim();
  if (!title || !content || content.length > KB_CONTENT_MAX) {
    return {
      ok: false,
      error: "invalid",
      message: `Give a question and an answer (up to ${KB_CONTENT_MAX} characters).`,
    };
  }
  const { data: same } = await db
    .from("kb_entries")
    .select("id")
    .eq("tenant_id", input.tenantId)
    .ilike("title", like(title))
    .limit(2);
  const clash = (same ?? []).find((r) => r.id !== input.id);
  if (clash) {
    return {
      ok: false,
      error: "duplicate",
      message: `There's already an answer to this question (entry_id ${clash.id}). Change that one instead.`,
    };
  }

  if (input.id) {
    const { data, error } = await db
      .from("kb_entries")
      .update({ title, content })
      .eq("id", input.id)
      .eq("tenant_id", input.tenantId)
      .select("id");
    if (error) return { ok: false, error: "save_failed", message: "Couldn't save. Try again." };
    if (!data?.length) {
      return {
        ok: false,
        error: "not_found",
        message: "No answer with this entry_id for this brand. Use search_knowledge to find it.",
      };
    }
    await writeAudit(db, {
      tenantId: input.tenantId,
      action: "kb_entry_updated",
      actor: input.actor,
      details: { kbEntryId: input.id, ...(input.via ? { via: input.via } : {}) },
    });
    return { ok: true, id: input.id, title, created: false };
  }

  const { data, error } = await db
    .from("kb_entries")
    .insert({ tenant_id: input.tenantId, title, content })
    .select("id")
    .single();
  if (error || !data)
    return { ok: false, error: "save_failed", message: "Couldn't save. Try again." };
  await writeAudit(db, {
    tenantId: input.tenantId,
    action: "kb_entry_created",
    actor: input.actor,
    details: { kbEntryId: data.id, ...(input.via ? { via: input.via } : {}) },
  });
  return { ok: true, id: data.id, title, created: true };
}
