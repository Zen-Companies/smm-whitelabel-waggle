import "server-only";
import * as Sentry from "@sentry/nextjs";
import { retrieveKbEntries } from "@/features/knowledge-base";
import { writeAudit } from "@/lib/audit";
import type { LlmClient } from "@/lib/llm";
import { loadTenantAiSpend } from "@/lib/llm/spend";
import type { ServiceClient } from "@/lib/supabase/service";
import {
  CAPTION_PROMPT_VERSION,
  CAPTIONS_PER_HOUR,
  captionOutputSchema,
  captionQuery,
  captionSystemPrompt,
  captionUserPrompt,
  checkCaption,
  type CaptionInput,
  type CaptionMode,
  type CaptionTone,
} from "./caption";

// Write with Waggle (Posts Round 5): one caption per press. The business info comes from the
// knowledge base (retrieval, the same as replies); the call goes through src/lib/llm (purpose
// caption, recorded in ai_usage) and never past the monthly AI cap. The audit row keeps ids and
// counts only, never the text.

export type CaptionRunResult =
  | { ok: true; caption: string; usedTitles: string[] }
  | {
      ok: false;
      reason: "ai_cap_reached" | "hourly_limit" | "not_set_up" | "invented" | "failed";
    };

export interface CaptionDeps {
  db: ServiceClient;
  /** null when the AI isn't configured (e.g. no OpenRouter key locally). */
  llm: LlmClient | null;
}

export async function writeCaption(
  deps: CaptionDeps,
  input: {
    tenantId: string;
    businessName: string;
    actor: string;
    mode: CaptionMode;
    tone: CaptionTone;
    about: string;
    current: string;
    maxLength: number;
    now?: Date;
  },
): Promise<CaptionRunResult> {
  const { db, llm } = deps;
  if (!llm) return { ok: false, reason: "not_set_up" };
  const now = input.now ?? new Date();
  const since = new Date(now.getTime() - 3_600_000).toISOString();
  const [{ count }, spend] = await Promise.all([
    db
      .from("audit_log")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", input.tenantId)
      .eq("action", "caption_written")
      .gte("created_at", since),
    loadTenantAiSpend(db, input.tenantId, now),
  ]);
  if (spend.level === "reached") return { ok: false, reason: "ai_cap_reached" };
  if ((count ?? 0) >= CAPTIONS_PER_HOUR) return { ok: false, reason: "hourly_limit" };

  const audit = (details: Record<string, unknown>) =>
    writeAudit(db, {
      tenantId: input.tenantId,
      action: "caption_written",
      actor: input.actor,
      details: { version: CAPTION_PROMPT_VERSION, mode: input.mode, tone: input.tone, ...details },
    });

  try {
    const query = captionQuery(input.about, input.current);
    const matches = query
      ? await retrieveKbEntries({ db, llm }, { tenantId: input.tenantId, query })
      : [];
    const prompt: CaptionInput = {
      businessName: input.businessName,
      mode: input.mode,
      tone: input.tone,
      about: input.about,
      current: input.current,
      facts: matches.map((m) => ({ title: m.title, content: m.content })),
      maxLength: input.maxLength,
    };
    const { object, model } = await llm.generateObject({
      tenantId: input.tenantId,
      purpose: "caption",
      schema: captionOutputSchema,
      system: captionSystemPrompt(input.businessName),
      prompt: captionUserPrompt(prompt),
      signal: AbortSignal.timeout(30_000),
    });
    const checked = checkCaption(object, prompt);
    await audit({
      model,
      facts: matches.length,
      kbEntryIds: matches.map((m) => m.id),
      ...(checked.ok ? { used: checked.usedTitles.length } : { refused: checked.reason }),
    });
    if (!checked.ok)
      return { ok: false, reason: checked.reason === "invented" ? "invented" : "failed" };
    return { ok: true, caption: checked.caption, usedTitles: checked.usedTitles };
  } catch (error) {
    Sentry.captureException(error, { extra: { tenantId: input.tenantId, step: "caption" } });
    await audit({ failed: true }).catch(() => undefined);
    return { ok: false, reason: "failed" };
  }
}
