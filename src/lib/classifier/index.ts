import "server-only";
import { getLlmClientOrNull } from "@/lib/llm";
import { createDbUsageRecorder } from "@/lib/llm/usage";
import { getServiceClient } from "@/lib/supabase/service";
import { FallbackClassifier } from "./fallback";
import { JevClassifier, loadJevConfig } from "./jev";
import { LlmClassifier } from "./llm";
import type { Classifier } from "./types";

export { BUSINESS_PROFILE_MAX, businessContext } from "./business-context";
export type { BusinessContext } from "./business-context";
export { FallbackClassifier } from "./fallback";
export { JevClassifier, loadJevConfig } from "./jev";
export { OPENROUTER_JEV_MODEL, OpenRouterJevClassifier } from "./jev-openrouter";
export type { JevConfig } from "./jev";
export { JEV_QUESTION_SETS, JEV_QUESTIONS, JEV_QUESTIONS_VERSION } from "./jev-questions";
export type { JevQuestions, JevQuestionsVersion } from "./jev-questions";
export { LlmClassifier, LLM_CLASSIFY_PROMPT_VERSION, LLM_CLASSIFY_PROMPTS } from "./llm";
export type { LlmClassifyPromptVersion } from "./llm";
export {
  countWords,
  MIN_CONFIDENCE,
  pickCategory,
  PRECEDENCE,
  SPAM_MIN_WORDS,
  SPAM_YES,
  YES,
} from "./pick-category";
export type { AskedCategory, CategoryScores, PickedCategory } from "./pick-category";
export { CATEGORIES, ClassifierError } from "./types";
export type {
  Category,
  Classification,
  Classifier,
  ClassifyInput,
  ClassifyOptions,
  FallbackReason,
  UnclearReason,
} from "./types";

let classifier: Classifier | null | undefined;

/**
 * The production classifier (docs/tdd.md §8): FallbackClassifier(jev, llm) when both are
 * configured, the one that is when only one is, or null when neither is (then the job leaves
 * `new` items alone instead of failing them).
 */
export function getClassifier(): Classifier | null {
  if (classifier !== undefined) return classifier;
  let jevConfig: ReturnType<typeof loadJevConfig> | null = null;
  try {
    jevConfig = loadJevConfig();
  } catch {
    jevConfig = null;
  }
  const llm = getLlmClientOrNull();
  const jev = jevConfig
    ? new JevClassifier(
        // Name only for Jev; the LLM fallback still gets the profile (T25, docs/tdd.md §9.6).
        { ...jevConfig, businessContext: "name" },
        { usage: createDbUsageRecorder(getServiceClient()) },
      )
    : null;
  const fallback = llm ? new LlmClassifier(llm) : null;
  classifier =
    jev && fallback && jevConfig
      ? new FallbackClassifier(jev, fallback, { timeoutMs: jevConfig.timeoutMs })
      : (jev ?? fallback);
  return classifier;
}
