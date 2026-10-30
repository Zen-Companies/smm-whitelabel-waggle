import { retrieveKbEntries, type KbMatch } from "@/features/knowledge-base";
import type { LlmClient } from "@/lib/llm/client";
import type { ServiceClient } from "@/lib/supabase/service";
import { groundingIssues, type GroundingIssue } from "./grounding";
import {
  DRAFT_PROMPT_VERSION,
  DRAFT_PROMPTS,
  draftOutputSchema,
  toDraftResult,
  type DraftPromptVersion,
  type DraftResult,
} from "./prompts";

export interface GeneratedDraft {
  result: DraftResult;
  facts: KbMatch[];
  model: string;
  issues: GroundingIssue[];
  needsHuman: boolean;
  needsHumanReason: string | null;
}

/**
 * Retrieval + LLM draft + grounding check, without storing anything. Shared by the job step and
 * scripts/draft-preview so the preview shows exactly what production would draft.
 */
export async function generateDraft(
  deps: { db: ServiceClient; llm: LlmClient },
  input: {
    tenantId: string;
    itemId?: string | null;
    businessName: string;
    kind: "comment" | "dm";
    category: string;
    text: string;
    signal?: () => AbortSignal;
    /** Another prompt version (the Lab); production uses the current one. */
    promptVersion?: DraftPromptVersion;
  },
): Promise<GeneratedDraft> {
  const prompts = DRAFT_PROMPTS[input.promptVersion ?? DRAFT_PROMPT_VERSION];
  const facts = await retrieveKbEntries(deps, {
    tenantId: input.tenantId,
    itemId: input.itemId,
    query: input.text,
    signal: input.signal?.(),
  });
  const { object, model } = await deps.llm.generateObject({
    purpose: "draft",
    tenantId: input.tenantId,
    itemId: input.itemId,
    schema: draftOutputSchema,
    system: prompts.system(input.businessName),
    prompt: prompts.user({
      kind: input.kind,
      category: input.category,
      text: input.text,
      facts,
    }),
    signal: input.signal?.(),
  });
  const result = toDraftResult(object);

  // Rule 8: an amount or contact the facts don't contain goes to the owner, not out.
  const issues = groundingIssues(result.reply, facts);
  const needsHuman = result.needsHuman || issues.length > 0;
  const needsHumanReason = needsHuman
    ? [result.reason, ...issues].filter(Boolean).join("; ").slice(0, 300) || "not covered"
    : null;
  return { result, facts, model, issues, needsHuman, needsHumanReason };
}
