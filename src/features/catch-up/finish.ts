import * as Sentry from "@sentry/nextjs";
import { transitionItem } from "@/features/inbox";
import { writeAudit } from "@/lib/audit";
import type { LlmClient } from "@/lib/llm/client";
import { loadTenantAiSpend } from "@/lib/llm/spend";
import type { Json } from "@/lib/supabase/database.types";
import type { ServiceClient } from "@/lib/supabase/service";
import { REVEAL_DRAFTS, SORT_CAP } from "./reveal-data";
import { pickRevealDrafts, readyToPick, TOP_QUESTIONS_INPUT_MAX } from "./reveal-rules";
import { runTopQuestions, TOP_QUESTIONS_PROMPT_VERSION } from "./top-questions";

// First connect (20 Nov): once a catch-up has read everything and Jev has sorted it, pick the
// reveal's drafts (the newest REVEAL_DRAFTS questions and leads) and work out the top questions
// (one AI call, cached on the catch-up). Runs from /api/jobs/process and /api/jobs/catch-up.

interface Deps {
  db: ServiceClient;
  /** null when no LLM is configured: the top questions stay empty. */
  llm: LlmClient | null;
  now?: Date;
  shouldContinue?: () => boolean;
}

export async function finishCatchUps(
  deps: Deps,
  opts: { tenantId?: string; limit?: number } = {},
): Promise<{ picked: number; topQuestions: number }> {
  const { db } = deps;
  const now = deps.now ?? new Date();
  const summary = { picked: 0, topQuestions: 0 };
  let query = db
    .from("catch_ups")
    .select("id, tenant_id, read_at")
    .is("sorted_at", null)
    .in("stage", ["dms_again", "done"])
    .order("created_at", { ascending: true })
    .limit(opts.limit ?? 5);
  if (opts.tenantId) query = query.eq("tenant_id", opts.tenantId);
  const { data: rows, error } = await query;
  if (error) throw new Error(`catch_ups lookup failed: ${error.message}`);

  for (const row of rows ?? []) {
    if (deps.shouldContinue && !deps.shouldContinue()) break;
    const { count: unsorted } = await db
      .from("inbound_items")
      .select("id", { count: "exact", head: true })
      .eq("catch_up_id", row.id)
      .eq("status", "new");
    const readAt = row.read_at ? new Date(row.read_at) : null;
    if (!readyToPick({ unsorted: unsorted ?? 0, readAt, now })) continue;

    // Claim the finish: only one run picks drafts and pays for the top questions.
    const { data: claimed } = await db
      .from("catch_ups")
      .update({ sorted_at: now.toISOString() })
      .eq("id", row.id)
      .is("sorted_at", null)
      .select("id");
    if (!claimed?.length) continue;

    try {
      summary.picked += await pickDrafts(db, row.id, row.tenant_id, now);
    } catch (err) {
      Sentry.captureException(err, { extra: { catchUpId: row.id } });
    }
    try {
      summary.topQuestions += await cacheTopQuestions(deps, row.id, row.tenant_id, now);
    } catch (err) {
      // Once only (cost cap): the reveal shows no top questions rather than trying again.
      Sentry.captureException(err, { extra: { catchUpId: row.id } });
      await db
        .from("catch_ups")
        .update({ top_questions: [], top_questions_at: now.toISOString() })
        .eq("id", row.id);
    }
  }
  return summary;
}

/** Asks for the reveal's drafts: they go back to the draft step, which now drafts them. */
async function pickDrafts(
  db: ServiceClient,
  catchUpId: string,
  tenantId: string,
  now: Date,
): Promise<number> {
  const { data: items, error } = await db
    .from("inbound_items")
    .select("id, kind, category, status, received_at, draft_requested_at")
    .eq("catch_up_id", catchUpId)
    .order("received_at", { ascending: false })
    .limit(SORT_CAP + 200);
  if (error) throw new Error(`pulled items lookup failed: ${error.message}`);
  const ids = pickRevealDrafts(
    (items ?? []).map((i) => ({
      id: i.id,
      kind: i.kind,
      category: i.category,
      status: i.status,
      receivedAt: i.received_at,
      draftRequested: i.draft_requested_at !== null,
    })),
    now,
    REVEAL_DRAFTS,
  );
  let picked = 0;
  for (const id of ids) {
    if (await requestDraft(db, id, now, "reveal")) picked += 1;
  }
  await writeAudit(db, {
    tenantId,
    action: "catch_up_drafts_picked",
    actor: "system",
    details: { catchUpId, picked, cap: REVEAL_DRAFTS },
  });
  return picked;
}

/**
 * Marks an undrafted pulled item as asked for and sends it back to the draft step
 * (awaiting_draft → classified). False when it wasn't waiting for a draft any more.
 */
export async function requestDraft(
  db: ServiceClient,
  itemId: string,
  now: Date,
  reason: "reveal" | "opened",
): Promise<boolean> {
  const { data, error } = await db
    .from("inbound_items")
    .update({ draft_requested_at: now.toISOString() })
    .eq("id", itemId)
    .eq("status", "awaiting_draft")
    .select("id");
  if (error) throw new Error(`draft request failed: ${error.message}`);
  if (!data?.length) return false;
  const { applied } = await transitionItem(db, {
    itemId,
    from: "awaiting_draft",
    event: "request_draft",
    details: { reason },
  });
  return applied;
}

async function cacheTopQuestions(
  deps: Deps,
  catchUpId: string,
  tenantId: string,
  now: Date,
): Promise<number> {
  const { db, llm } = deps;
  const store = (questions: Json, model: string | null) =>
    db
      .from("catch_ups")
      .update({ top_questions: questions, top_questions_at: now.toISOString() })
      .eq("id", catchUpId)
      .then(({ error }) => {
        if (error) throw new Error(`top questions save failed: ${error.message}`);
        return model;
      });

  const { data: items, error } = await db
    .from("inbound_items")
    .select("text, kind, post_caption")
    .eq("catch_up_id", catchUpId)
    .eq("category", "faq")
    .in("kind", ["comment", "dm"])
    .order("received_at", { ascending: false })
    .limit(TOP_QUESTIONS_INPUT_MAX);
  if (error) throw new Error(`questions lookup failed: ${error.message}`);
  const spend = await loadTenantAiSpend(db, tenantId, now);
  if (!llm || !items?.length || spend.level === "reached") {
    await store([], null);
    return 0;
  }
  const { data: tenant } = await db.from("tenants").select("name").eq("id", tenantId).single();
  const { questions, model } = await runTopQuestions(llm, {
    tenantId,
    businessName: tenant?.name ?? "the business",
    messages: items.map((i) => ({
      text: i.text,
      kind: i.kind === "dm" ? "dm" : "comment",
      caption: i.post_caption,
    })),
  });
  await store(questions as unknown as Json, model);
  await writeAudit(db, {
    tenantId,
    action: "catch_up_top_questions",
    actor: "system",
    details: {
      catchUpId,
      model,
      promptVersion: TOP_QUESTIONS_PROMPT_VERSION,
      messages: items.length,
      questions: questions.length,
    },
  });
  return questions.length;
}
