import "server-only";
import * as Sentry from "@sentry/nextjs";
import { writeAudit } from "@/lib/audit";
import { loadTenantAiSpend } from "@/lib/llm/spend";
import type { KbDeps } from "./embeddings";
import {
  GAP_HELPER_MIN_QUESTIONS,
  GAP_HELPER_VERSION,
  GAP_QUESTIONS_MAX,
  runGapHelper,
} from "./gap-helper";
import { gapHelperRunsLeft } from "./gap-limit";
import { loadGaps } from "./gaps";

export type GapRunResult =
  | { ok: true; added: number }
  | {
      ok: false;
      reason: "too_few_questions" | "daily_limit" | "ai_cap_reached" | "failed";
    };

/**
 * The owner pressed "Suggest topics" (T33): checks the limits, runs the helper on the questions
 * still waiting (minus ones a pending suggestion already covers), stores its suggestions as
 * pending and audits the run (ids and counts only, never text). Calls count as the business's
 * own (source live), so the monthly AI cap applies.
 */
export async function requestSuggestions(
  deps: KbDeps,
  input: { tenantId: string; businessName: string; actor: string; now?: Date },
): Promise<GapRunResult> {
  const { db } = deps;
  const now = input.now ?? new Date();
  const [{ data: pending }, gaps, topics, left, spend] = await Promise.all([
    db
      .from("kb_suggestions")
      .select("title, item_ids")
      .eq("tenant_id", input.tenantId)
      .eq("status", "pending"),
    loadGaps(db, input.tenantId, GAP_QUESTIONS_MAX),
    db.from("kb_entries").select("title, content").eq("tenant_id", input.tenantId),
    gapHelperRunsLeft(db, input.tenantId),
    loadTenantAiSpend(db, input.tenantId, now),
  ]);
  const covered = new Set((pending ?? []).flatMap((p) => p.item_ids));
  const questions = gaps
    .filter((g) => !covered.has(g.itemId))
    .map((g) => ({ id: g.itemId, text: g.text }));

  if (questions.length < GAP_HELPER_MIN_QUESTIONS)
    return { ok: false, reason: "too_few_questions" };
  if (left <= 0) return { ok: false, reason: "daily_limit" };
  if (spend.level === "reached") return { ok: false, reason: "ai_cap_reached" };

  let run;
  try {
    run = await runGapHelper(deps, {
      tenantId: input.tenantId,
      businessName: input.businessName,
      questions,
      // Pending suggestions count as taken titles too.
      topics: [
        ...(topics.data ?? []),
        ...(pending ?? []).map((p) => ({ title: p.title, content: "" })),
      ],
    });
  } catch (error) {
    Sentry.captureException(error, { extra: { tenantId: input.tenantId } });
    await writeAudit(db, {
      tenantId: input.tenantId,
      action: "kb_suggestions_requested",
      actor: input.actor,
      details: { version: GAP_HELPER_VERSION, questions: questions.length, failed: true },
    });
    return { ok: false, reason: "failed" };
  }

  if (run.suggestions.length) {
    const { error } = await db.from("kb_suggestions").insert(
      run.suggestions.map((s) => ({
        tenant_id: input.tenantId,
        title: s.title,
        content: s.content,
        item_ids: s.itemIds,
      })),
    );
    if (error) throw new Error(`kb_suggestions insert failed: ${error.message}`);
  }
  await writeAudit(db, {
    tenantId: input.tenantId,
    action: "kb_suggestions_requested",
    actor: input.actor,
    details: {
      version: GAP_HELPER_VERSION,
      model: run.model,
      steps: run.steps,
      questions: questions.length,
      suggestions: run.suggestions.length,
    },
  });
  return { ok: true, added: run.suggestions.length };
}
