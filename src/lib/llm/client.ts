import {
  embed,
  generateText,
  Output,
  stepCountIs,
  type LanguageModel,
  type StepResult,
  type ToolSet,
} from "ai";
import type { z } from "zod";
import type { ResolvedModel, ResolvedModels } from "./provider";
import { openRouterCostUsd, type UsageRecorder } from "./usage";

export interface LlmCallContext {
  tenantId: string;
  itemId?: string | null;
  signal?: AbortSignal;
}

export interface GenerateObjectInput<T> extends LlmCallContext {
  /**
   * setup: its own model, retried once on the classify model when that call fails. caption
   * (Posts Round 5, Write with Waggle): the draft model, recorded as its own purpose.
   */
  purpose: "classify" | "draft" | "setup" | "caption";
  schema: z.ZodType<T>;
  system: string;
  prompt: string;
}

/** The most model calls one agent run may make (T33). The final answer counts as one. */
export const AGENT_MAX_STEPS = 6;

/** One embedding call, retries included, gives up after this long. */
export const EMBED_TIMEOUT_MS = 15_000;

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

  // Output.object sends a JSON-schema response_format (OpenRouter `json_schema`, strict), never a
  // forced tool call: current Claude models reject forced tool_choice with HTTP 400.
  async function callObject<T>(
    resolved: ResolvedModel<LanguageModel>,
    input: GenerateObjectInput<T>,
  ) {
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
  }

  return {
    async generateObject<T>(input: GenerateObjectInput<T>) {
      const resolved = input.purpose === "caption" ? models.draft : models[input.purpose];
      if (input.purpose !== "setup" || resolved.id === models.classify.id) {
        return callObject(resolved, input);
      }
      try {
        return await callObject(resolved, input);
      } catch (err) {
        // Network, HTTP or output that fails the schema: one retry on the classify model through
        // the same validated path. The failed call's text is never shown or logged.
        if (input.signal?.aborted) throw err;
        return callObject(models.classify, input);
      }
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
      // A hung embedding model must fail fast, not leave a try or a draft spinning.
      const timeout = AbortSignal.timeout(EMBED_TIMEOUT_MS);
      const result = await embed({
        model: resolved.model,
        value: input.value,
        abortSignal: input.signal ? AbortSignal.any([input.signal, timeout]) : timeout,
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
