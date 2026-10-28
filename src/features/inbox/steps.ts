import { createPolicyStep } from "@/features/approvals";
import { createClassifyStep } from "@/features/triage";
import { getClassifier } from "@/lib/classifier";
import type { Steps } from "./processor";

// The steps the job route runs. Each task plugs its step in here:
// T7 classify (new), T9 draft (classified), T10 policy (drafted), T12 send (sending).
// Statuses without a step are left untouched (their lock is released), e.g. `new` while no
// classifier is configured.
export function getProductionSteps(): Steps {
  const classifier = getClassifier();
  return {
    ...(classifier ? { new: createClassifyStep({ classifier }) } : {}),
    drafted: createPolicyStep(),
  };
}
