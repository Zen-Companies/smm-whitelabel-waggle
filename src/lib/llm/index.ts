import "server-only";
import { getServiceClient } from "@/lib/supabase/service";
import { createLlmClient, type LlmClient } from "./client";
import { loadLlmConfig } from "./config";
import { resolveModels } from "./provider";
import { createDbUsageRecorder } from "./usage";

export { AGENT_MAX_STEPS, createLlmClient } from "./client";
export type { GenerateObjectInput, LlmCallContext, LlmClient, RunToolsInput } from "./client";
export { loadLlmConfig } from "./config";
export type { LlmConfig } from "./config";
export { resolveModels } from "./provider";
export { createDbUsageRecorder, openRouterCostUsd, withUsageSource } from "./usage";
export type { AiPurpose, AiUsageRecord, AiUsageSource, UsageRecorder } from "./usage";
export {
  AI_CAP_WARN_RATIO,
  aiSpendStatus,
  defaultAiCap,
  loadAiSpend,
  loadTenantAiSpend,
  monthStart,
} from "./spend";
export type { AiSpend, AiSpendLevel } from "./spend";

let client: LlmClient | undefined;

export function getLlmClient(): LlmClient {
  client ??= createLlmClient({
    models: resolveModels(loadLlmConfig()),
    usage: createDbUsageRecorder(getServiceClient()),
  });
  return client;
}

/** The LLM client, or null when it isn't configured yet (e.g. no OPENROUTER_API_KEY locally). */
export function getLlmClientOrNull(): LlmClient | null {
  try {
    return getLlmClient();
  } catch {
    return null;
  }
}
