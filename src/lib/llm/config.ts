import { z } from "zod";
import { parseEnv } from "@/lib/env";

// docs/tdd.md §17. Models are OpenRouter "provider/model" ids, e.g. "openai/gpt-5-mini".
const llmEnvSchema = z.object({
  LLM_PROVIDER: z.enum(["openrouter"]).default("openrouter"),
  OPENROUTER_API_KEY: z.string(),
  LLM_CLASSIFY_MODEL: z.string(),
  LLM_DRAFT_MODEL: z.string(),
  EMBEDDING_PROVIDER: z.enum(["openrouter"]).default("openrouter"),
  EMBEDDING_MODEL: z.string(),
});

export type LlmConfig = z.infer<typeof llmEnvSchema>;

export function loadLlmConfig(env: Record<string, string | undefined> = process.env): LlmConfig {
  return parseEnv(llmEnvSchema, env, "LLM");
}
