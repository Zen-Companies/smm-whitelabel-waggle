import { z } from "zod";
import { DRAFT_PROMPT_VERSION, DRAFT_PROMPTS } from "@/features/drafting";
import {
  JEV_QUESTION_SETS,
  JEV_QUESTIONS_VERSION,
  LLM_CLASSIFY_PROMPT_VERSION,
  LLM_CLASSIFY_PROMPTS,
} from "@/lib/classifier";

// A variant names versions held in code (docs/tdd.md §19), so a winner ships as an ordinary code
// change. The business context is the only free text: testing it is the point.

/** production: Jev with the LLM as fallback (as the job runs it). The rest run one classifier. */
export const CLASSIFIER_CHOICES = ["production", "jev", "jev-openrouter", "llm"] as const;
export type ClassifierChoice = (typeof CLASSIFIER_CHOICES)[number];

export const CLASSIFIER_LABELS: Record<ClassifierChoice, string> = {
  production: "Jev, LLM as fallback (production)",
  jev: "Jev only (JEV_API_URL)",
  "jev-openrouter": "Jev 1.13 via OpenRouter",
  llm: "LLM classifier only",
};

export const CONTEXT_MAX = 1000;

const versionsOf = <T extends Record<string, unknown>>(record: T) =>
  Object.keys(record) as [keyof T & string, ...(keyof T & string)[]];

export const variantSchema = z.object({
  classifier: z.enum(CLASSIFIER_CHOICES),
  questionsVersion: z.enum(versionsOf(JEV_QUESTION_SETS)),
  classifyPromptVersion: z.enum(versionsOf(LLM_CLASSIFY_PROMPTS)),
  draftPromptVersion: z.enum(versionsOf(DRAFT_PROMPTS)),
  /** name: the business name (what production sends today); custom: the text below. */
  context: z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("name") }),
    z.object({ mode: z.literal("custom"), text: z.string().trim().min(1).max(CONTEXT_MAX) }),
  ]),
  /** OpenRouter model ids; empty = the configured ones. */
  classifyModel: z.string().trim().max(120).optional(),
  draftModel: z.string().trim().max(120).optional(),
});

export type Variant = z.infer<typeof variantSchema>;

/** What production runs today. */
export function currentVariant(): Variant {
  return {
    classifier: "production",
    questionsVersion: JEV_QUESTIONS_VERSION,
    classifyPromptVersion: LLM_CLASSIFY_PROMPT_VERSION,
    draftPromptVersion: DRAFT_PROMPT_VERSION,
    context: { mode: "name" },
  };
}

/** The business context a variant sends to the classifier. */
export function resolveContext(variant: Variant, tenant: { name: string }): string {
  return variant.context.mode === "custom" ? variant.context.text : tenant.name;
}
