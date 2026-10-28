import { embed, generateText, Output } from "ai";
import type { z } from "zod";
import type { ResolvedModels } from "./provider";
import { openRouterCostUsd, type UsageRecorder } from "./usage";

export interface LlmCallContext {
  tenantId: string;
  itemId?: string | null;
  signal?: AbortSignal;
}

export interface GenerateObjectInput<T> extends LlmCallContext {
  purpose: "classify" | "draft";
  schema: z.ZodType<T>;
  system: string;
  prompt: string;
}

export interface LlmClient {
  generateObject<T>(input: GenerateObjectInput<T>): Promise<{ object: T; model: string }>;
  embed(input: LlmCallContext & { value: string }): Promise<{ embedding: number[]; model: string }>;
}

// Every call writes one ai_usage row (CLAUDE.md rule 2). Prompts are never logged.
export function createLlmClient(deps: { models: ResolvedModels; usage: UsageRecorder }): LlmClient {
  const { models, usage } = deps;

  return {
    async generateObject<T>(input: GenerateObjectInput<T>) {
      const resolved = models[input.purpose];
      const result = await generateText({
        model: resolved.model,
        system: input.system,
        prompt: input.prompt,
        output: Output.object({ schema: input.schema }),
        abortSignal: input.signal,
      });
      const model = result.response.modelId || resolved.id;
      await usage.record({
        tenantId: input.tenantId,
        itemId: input.itemId,
        purpose: input.purpose,
        provider: resolved.provider,
        model,
        inputTokens: result.usage.inputTokens ?? 0,
        outputTokens: result.usage.outputTokens ?? 0,
        costUsd: openRouterCostUsd(result.providerMetadata),
      });
      return { object: result.output, model };
    },

    async embed(input) {
      const resolved = models.embedding;
      const result = await embed({
        model: resolved.model,
        value: input.value,
        abortSignal: input.signal,
      });
      await usage.record({
        tenantId: input.tenantId,
        itemId: input.itemId,
        purpose: "embed",
        provider: resolved.provider,
        model: resolved.id,
        inputTokens: result.usage.tokens,
        outputTokens: 0,
        costUsd: openRouterCostUsd(result.providerMetadata),
      });
      return { embedding: result.embedding, model: resolved.id };
    },
  };
}
