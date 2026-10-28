import { createPolicyStep } from "@/features/approvals";
import { createDraftStep } from "@/features/drafting";
import { createClassifyStep } from "@/features/triage";
import { getClassifier } from "@/lib/classifier";
import { getLlmClientOrNull } from "@/lib/llm";
import type { Steps } from "./processor";

// The steps the job route runs: T7 classify (new), T9 draft (classified), T10 policy (drafted),
// T12 send (sending). Statuses without a step are left untouched (their lock is released), e.g.
// `new` while no classifier is configured, or `classified` while no LLM is.
export function getProductionSteps(): Steps {
  const classifier = getClassifier();
  const llm = getLlmClientOrNull();
  return {
    ...(classifier ? { new: createClassifyStep({ classifier }) } : {}),
    ...(llm ? { classified: createDraftStep({ llm }) } : {}),
    drafted: createPolicyStep(),
  };
}
