import "server-only";
import { getLlmClient } from "@/lib/llm";
import { createDbUsageRecorder } from "@/lib/llm/usage";
import { getServiceClient } from "@/lib/supabase/service";
import { FallbackClassifier } from "./fallback";
import { JevClassifier, loadJevConfig } from "./jev";
import { LlmClassifier } from "./llm";
import type { Classifier } from "./types";

export { FallbackClassifier } from "./fallback";
export { JevClassifier, loadJevConfig } from "./jev";
export type { JevConfig } from "./jev";
export { JEV_QUESTIONS, JEV_QUESTIONS_VERSION } from "./jev-questions";
export { LlmClassifier, LLM_CLASSIFY_PROMPT_VERSION } from "./llm";
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

let classifier: Classifier | undefined;

/** The production classifier: FallbackClassifier(jev, llm). */
export function getClassifier(): Classifier {
  if (!classifier) {
    const config = loadJevConfig();
    const jev = new JevClassifier(config, {
      usage: createDbUsageRecorder(getServiceClient()),
    });
    classifier = new FallbackClassifier(jev, new LlmClassifier(getLlmClient()), {
      timeoutMs: config.timeoutMs,
    });
  }
  return classifier;
}
