import { cleanLeakedReply, GARBLED_DRAFT_REASON } from "@/lib/draft-leak";
import { inboxRules, platformLabel } from "@/lib/social/platforms";
import { retrieveKbEntries, type KbMatch } from "@/features/knowledge-base";
import type { LlmClient } from "@/lib/llm/client";
import type { ServiceClient } from "@/lib/supabase/service";
import { groundingIssues, type GroundingIssue } from "./grounding";
import {
  DRAFT_PROMPT_VERSION,
  DRAFT_PROMPTS,
  draftOutputSchema,
  toDraftResult,
  type CalendarContext,
  type DraftPromptVersion,
  type DraftResult,
  type ThreadMessage,
} from "./prompts";

/**
 * What the business info is searched with (T30): the latest message, plus the customer's previous
 * message when there is one, so "how about Sunday?" still finds Opening hours.
 */
export function retrievalQuery(text: string, history: ThreadMessage[] = []): string {
  const previous = history.filter((m) => m.from === "customer").slice(-1);
  return [...previous.map((m) => m.text), text].join("\n").trim();
}

export interface GeneratedDraft {
  result: DraftResult;
  facts: KbMatch[];
  model: string;
  issues: GroundingIssue[];
  needsHuman: boolean;
  needsHumanReason: string | null;
}

/**
 * Hotfix 26 Nov: a model can put the other fields inside `reply` ("… needsHuman: false reason:
 * null lead: null}{"). The reply is cleaned and, when anything was removed, goes to the owner:
 * auto mode never sends a cleaned draft.
 */
export function garbledToOwner(result: DraftResult): DraftResult {
  const { reply, cleaned } = cleanLeakedReply(result.reply);
  if (!cleaned) return result;
  return {
    ...result,
    reply,
    needsHuman: true,
    reason: [GARBLED_DRAFT_REASON, result.reason].filter(Boolean).join("; "),
  };
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
    kind: "comment" | "dm" | "review";
    category: string;
    text: string;
    signal?: () => AbortSignal;
    /** Another prompt version (the Lab); production uses the current one. */
    promptVersion?: DraftPromptVersion;
    /** Earlier messages of the DM thread, oldest first (T30). */
    history?: ThreadMessage[];
    /** The account's platform (T61): named in the prompt, and its reply length is enforced. */
    platform?: string;
    /** Booking requests with a connected calendar (T81d): the owner's busy times. */
    calendar?: CalendarContext | null;
  },
): Promise<GeneratedDraft> {
  const prompts = DRAFT_PROMPTS[input.promptVersion ?? DRAFT_PROMPT_VERSION];
  const facts = await retrieveKbEntries(deps, {
    tenantId: input.tenantId,
    itemId: input.itemId,
    query: retrievalQuery(input.text, input.history),
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
      history: input.history,
      platform: input.platform,
      calendar: input.calendar ?? null,
    }),
    signal: input.signal?.(),
  });
  const result = garbledToOwner(toDraftResult(object));

  // Rule 8: an amount or contact the facts don't contain goes to the owner, not out.
  const issues = groundingIssues(result.reply, facts);
  // Longer than the platform takes: the owner shortens it (it would be refused when sent).
  const max = input.platform ? inboxRules(input.platform).replyMax : null;
  const tooLong =
    max && result.reply.length > max
      ? `too long for ${platformLabel(input.platform!)} (${max} characters max)`
      : null;
  const needsHuman = result.needsHuman || issues.length > 0 || !!tooLong;
  const needsHumanReason = needsHuman
    ? [result.reason, ...issues, tooLong].filter(Boolean).join("; ").slice(0, 300) || "not covered"
    : null;
  return { result, facts, model, issues, needsHuman, needsHumanReason };
}
