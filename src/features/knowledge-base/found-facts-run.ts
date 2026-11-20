import * as Sentry from "@sentry/nextjs";
import { redraftAfterAnswerChange } from "@/features/catch-up";
import { writeAudit } from "@/lib/audit";
import type { LlmClient } from "@/lib/llm/client";
import { loadTenantAiSpend } from "@/lib/llm/spend";
import type { BusinessProfile, SocialProvider } from "@/lib/social/types";
import type { ServiceClient } from "@/lib/supabase/service";
import { embedEntry } from "./embeddings";
import {
  directFacts,
  FOUND_FACTS_PROMPT_VERSION,
  foundFactsOutputSchema,
  foundFactsSystemPrompt,
  foundFactsUserPrompt,
  keepNew,
  sourcesFor,
  toFoundEntries,
  type FoundEntry,
} from "./found-facts";

// Walter's flow (decision 7, 20 Nov): once a first connect's catch-up has read the account
// (catch_ups.read_at), Waggle reads the account's public business info (SocialProvider
// .getBusinessProfile) and the captions of the posts it pulled comments from, and saves the facts
// it finds as business info marked not checked (kb_entries.needs_check). One AI call per catch-up
// at most (claimed by catch_ups.facts_found_at), through src/lib/llm (ai_usage), skipped at the
// AI cap. The owner's own info is never overwritten. Ids only in logs and audit rows.

/** Only catch-ups this recent: an old one isn't a first connect any more. */
const RECENT_MS = 2 * 24 * 60 * 60 * 1000;
const PLATFORMS = new Set(["facebook", "instagram"]);

interface Deps {
  db: ServiceClient;
  /** null when no LLM is configured: only what the platform states itself is saved. */
  llm: LlmClient | null;
  social: () => SocialProvider;
  now?: Date;
  shouldContinue?: () => boolean;
}

export async function findFactsAfterConnect(
  deps: Deps,
  opts: { tenantId?: string; limit?: number } = {},
): Promise<{ catchUps: number; saved: number }> {
  const { db } = deps;
  const now = deps.now ?? new Date();
  let query = db
    .from("catch_ups")
    .select("id, tenant_id, zernio_account_id, platform, handle")
    .is("facts_found_at", null)
    .not("read_at", "is", null)
    .gte("created_at", new Date(now.getTime() - RECENT_MS).toISOString())
    .order("created_at", { ascending: true })
    .limit(opts.limit ?? 3);
  if (opts.tenantId) query = query.eq("tenant_id", opts.tenantId);
  const { data: rows, error } = await query;
  if (error) throw new Error(`catch_ups lookup failed: ${error.message}`);

  const summary = { catchUps: 0, saved: 0 };
  for (const row of rows ?? []) {
    if (deps.shouldContinue && !deps.shouldContinue()) break;
    // Claim it: only one run reads the profile and pays for the AI call.
    const { data: claimed } = await db
      .from("catch_ups")
      .update({ facts_found_at: now.toISOString() })
      .eq("id", row.id)
      .is("facts_found_at", null)
      .select("id");
    if (!claimed?.length) continue;
    summary.catchUps += 1;
    try {
      summary.saved += await findFacts(deps, row, now);
    } catch (err) {
      // Once only (cost): no second AI call for this connect.
      Sentry.captureException(err, { extra: { catchUpId: row.id } });
    }
  }
  return summary;
}

async function findFacts(
  deps: Deps,
  row: {
    id: string;
    tenant_id: string;
    zernio_account_id: string | null;
    platform: string | null;
    handle: string | null;
  },
  now: Date,
): Promise<number> {
  const { db } = deps;
  const tenantId = row.tenant_id;
  const skip = async (reason: string) => {
    await writeAudit(db, {
      tenantId,
      action: "found_facts_skipped",
      actor: "system",
      details: { catchUpId: row.id, reason },
    });
    return 0;
  };
  if (!row.platform || !PLATFORMS.has(row.platform) || !row.zernio_account_id) {
    return skip("platform");
  }
  const spend = await loadTenantAiSpend(db, tenantId, now);
  if (spend.level === "reached") return skip("ai_cap");

  let profile: BusinessProfile | null = null;
  try {
    profile = await deps.social().getBusinessProfile({
      accountId: row.zernio_account_id,
      platform: row.platform,
      username: row.handle?.replace(/^@/, "") ?? null,
    });
  } catch (err) {
    // The captions are still worth reading.
    Sentry.captureException(err, { extra: { catchUpId: row.id, step: "profile" } });
  }

  const [{ data: tenant }, { data: pulled }, { data: existing }] = await Promise.all([
    db.from("tenants").select("name").eq("id", tenantId).single(),
    db
      .from("inbound_items")
      .select("post_caption")
      .eq("catch_up_id", row.id)
      .not("post_caption", "is", null)
      .order("received_at", { ascending: false })
      .limit(300),
    db.from("kb_entries").select("title").eq("tenant_id", tenantId),
  ]);

  const sources = sourcesFor(
    profile,
    (pulled ?? []).map((p) => p.post_caption ?? ""),
  );
  const direct = directFacts(profile);
  let fromAi: FoundEntry[] = [];
  let model: string | null = null;
  if (deps.llm && sources.length > 0) {
    try {
      const result = await deps.llm.generateObject({
        tenantId,
        purpose: "draft",
        schema: foundFactsOutputSchema,
        system: foundFactsSystemPrompt(tenant?.name ?? "the business"),
        prompt: foundFactsUserPrompt(sources),
      });
      model = result.model;
      fromAi = toFoundEntries(result.object, sources, {
        hasHours: direct.some((d) => d.kind === "hours"),
        hasContact: direct.some((d) => d.kind === "contact"),
      });
    } catch (err) {
      // Not retried (one call per connect); the platform's own facts are still saved.
      Sentry.captureException(err, { extra: { catchUpId: row.id, step: "extract" } });
    }
  }

  const entries = keepNew(
    [...direct, ...fromAi],
    (existing ?? []).map((e) => e.title),
  );
  const ids: string[] = [];
  for (const e of entries) {
    const { data, error } = await db
      .from("kb_entries")
      .insert({
        tenant_id: tenantId,
        title: e.title,
        content: e.content,
        needs_check: true,
        found_kind: e.kind,
        found_source: e.source,
        found_catch_up_id: row.id,
      })
      .select("id")
      .single();
    if (error) throw new Error(`saving a found fact failed: ${error.message}`);
    ids.push(data.id);
  }
  await db.from("catch_ups").update({ facts_found: ids.length }).eq("id", row.id);
  await writeAudit(db, {
    tenantId,
    action: "found_facts_saved",
    actor: "system",
    details: {
      catchUpId: row.id,
      kbEntryIds: ids,
      kinds: entries.map((e) => e.kind),
      sources: sources.length,
      profile: profile?.source ?? null,
      model,
      promptVersion: FOUND_FACTS_PROMPT_VERSION,
    },
  });
  if (ids.length === 0) return 0;

  // Searchable before the drafts that could use them; the job sweep retries any that fail.
  if (deps.llm) {
    for (const id of ids) {
      try {
        await embedEntry({ db, llm: deps.llm }, id);
      } catch (err) {
        Sentry.captureException(err, { extra: { kbEntryId: id } });
      }
    }
  }
  // Pulled drafts that had no answer (needs a person) are written again with the new facts.
  try {
    await redraftAfterAnswerChange(db, { tenantId, kbEntryId: null, actor: "system", now });
  } catch (err) {
    Sentry.captureException(err, { extra: { catchUpId: row.id, step: "redraft" } });
  }
  return ids.length;
}
