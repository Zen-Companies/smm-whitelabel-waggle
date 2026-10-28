import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { EmbeddingModel, LanguageModel } from "ai";
import type { LlmConfig } from "./config";

export interface ResolvedModel<M> {
  model: M;
  /** The configured id; stored in ai_usage when the response doesn't name the served model. */
  id: string;
  provider: string;
}

export interface ResolvedModels {
  classify: ResolvedModel<LanguageModel>;
  draft: ResolvedModel<LanguageModel>;
  embedding: ResolvedModel<EmbeddingModel>;
}

// The only place that knows which provider serves which model, so going direct to a provider
// later is a config change plus one case here.
export function resolveModels(
  config: LlmConfig,
  options: { fetch?: typeof fetch } = {},
): ResolvedModels {
  const openrouter = createOpenRouter({
    apiKey: config.OPENROUTER_API_KEY,
    compatibility: "strict",
    fetch: options.fetch,
  });
  // usage.include makes OpenRouter return the call's cost, recorded in ai_usage.cost_usd.
  const chat = (id: string): ResolvedModel<LanguageModel> => ({
    model: openrouter(id, { usage: { include: true } }),
    id,
    provider: config.LLM_PROVIDER,
  });

  return {
    classify: chat(config.LLM_CLASSIFY_MODEL),
    draft: chat(config.LLM_DRAFT_MODEL),
    embedding: {
      model: openrouter.textEmbeddingModel(config.EMBEDDING_MODEL),
      id: config.EMBEDDING_MODEL,
      provider: config.EMBEDDING_PROVIDER,
    },
  };
}
