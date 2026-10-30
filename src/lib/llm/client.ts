import { embed, generateText, Output, stepCountIs, type StepResult, type ToolSet } from "ai";
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

/** The most model calls one agent run may make (T33). The final answer counts as one. */
export const AGENT_MAX_STEPS = 6;

export interface RunToolsInput<T> extends LlmCallContext {
  purpose: "agent";
  /** The final answer. */
  schema: z.ZodType<T>;
  system: string;
  prompt: string;
  tools: ToolSet;
  /** Capped at AGENT_MAX_STEPS. A run still calling tools at the cap fails (no answer). */
  maxSteps: number;
}

export interface LlmClient {
  generateObject<T>(input: GenerateObjectInput<T>): Promise<{ object: T; model: string }>;
  /** A tool-calling run (T33): one ai_usage row per model call, a hard cap on the calls. */
  runTools<T>(input: RunToolsInput<T>): Promise<{ object: T; model: string; steps: number }>;
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

    async runTools<T>(input: RunToolsInput<T>) {
      const resolved = models.draft;
      // Recorded as each step ends, so a run that fails halfway still has its cost on record.
      const recorded: Promise<void>[] = [];
      const recordStep = (step: StepResult<ToolSet>) => {
        recorded.push(
          usage.record({
            tenantId: input.tenantId,
            itemId: input.itemId,
            purpose: input.purpose,
            provider: resolved.provider,
            model: step.response.modelId || resolved.id,
            inputTokens: step.usage.inputTokens ?? 0,
            outputTokens: step.usage.outputTokens ?? 0,
            costUsd: openRouterCostUsd(step.providerMetadata),
          }),
        );
      };
      try {
        const result = await generateText({
          model: resolved.model,
          system: input.system,
          prompt: input.prompt,
          tools: input.tools,
          output: Output.object({ schema: input.schema }),
          stopWhen: stepCountIs(Math.max(1, Math.min(input.maxSteps, AGENT_MAX_STEPS))),
          abortSignal: input.signal,
          onStepEnd: recordStep,
        });
        return {
          object: result.output,
          model: result.response.modelId || resolved.id,
          steps: result.steps.length,
        };
      } finally {
        await Promise.all(recorded);
      }
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
