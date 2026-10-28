import "server-only";
import { getServiceClient } from "@/lib/supabase/service";
import { createLlmClient, type LlmClient } from "./client";
import { loadLlmConfig } from "./config";
import { resolveModels } from "./provider";
import { createDbUsageRecorder } from "./usage";

export { createLlmClient } from "./client";
export type { GenerateObjectInput, LlmCallContext, LlmClient } from "./client";
export { loadLlmConfig } from "./config";
export type { LlmConfig } from "./config";
export { resolveModels } from "./provider";
export { createDbUsageRecorder, openRouterCostUsd } from "./usage";
export type { AiPurpose, AiUsageRecord, UsageRecorder } from "./usage";

let client: LlmClient | undefined;

export function getLlmClient(): LlmClient {
  client ??= createLlmClient({
    models: resolveModels(loadLlmConfig()),
    usage: createDbUsageRecorder(getServiceClient()),
  });
  return client;
}
