import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { openRouterCostUsd, type UsageRecorder } from "@/lib/llm/usage";
import { JEV_QUESTIONS, type JevQuestions } from "./jev-questions";
import { countWords, pickCategory, PRECEDENCE, type AskedCategory } from "./pick-category";
import {
  ClassifierError,
  type Classification,
  type Classifier,
  type ClassifyInput,
  type ClassifyOptions,
} from "./types";

export const OPENROUTER_JEV_MODEL = "typesafe/jev-1.13";

/**
 * Jev served by OpenRouter's Decisions API (alpha). Same four yes/no questions and
 * pickCategory() as the direct adapter, so the two backends are comparable in the triage report
 * (docs/tasks.md T7). Not wired into production yet.
 *
 * Calls the provider model's doEvaluate directly: ai 7.0.155's experimental_decide passes state
 * as typed parts, which @openrouter/ai-sdk-provider 3.1.0 forwards unchanged, so OpenRouter would
 * get `[{ type: "json", value }]` instead of the state object.
 */
export class OpenRouterJevClassifier implements Classifier {
  private readonly model;

  constructor(
    private readonly config: { apiKey: string; model?: string },
    private readonly deps: { usage: UsageRecorder; fetch?: typeof fetch },
    private readonly questions: JevQuestions = JEV_QUESTIONS,
  ) {
    this.model = createOpenRouter({ apiKey: config.apiKey, fetch: deps.fetch }).evaluationModel(
      config.model ?? OPENROUTER_JEV_MODEL,
    );
  }

  async classify(input: ClassifyInput, options: ClassifyOptions = {}): Promise<Classification> {
    let result;
    try {
      result = await this.model.doEvaluate({
        state: {
          ...(input.businessContext ? { business: input.businessContext } : {}),
          channel: input.kind,
          customer_message: input.text,
        },
        questions: Object.fromEntries(
          PRECEDENCE.map((c) => [c, { type: "boolean" as const, instructions: this.questions[c] }]),
        ),
        abortSignal: options.signal,
      });
    } catch (error) {
      if (options.signal?.aborted) throw new ClassifierError("timeout", "Jev (OpenRouter) aborted");
      const status = (error as { statusCode?: number }).statusCode;
      throw status
        ? new ClassifierError("http", `Jev (OpenRouter) returned ${status}`, status)
        : new ClassifierError("network", `Jev (OpenRouter) failed: ${(error as Error).name}`);
    }

    const model = result.response?.modelId || this.config.model || OPENROUTER_JEV_MODEL;
    await this.deps.usage.record({
      tenantId: input.tenantId,
      itemId: input.itemId,
      purpose: "classify",
      provider: "openrouter",
      model,
      inputTokens: result.usage?.inputTokens ?? 0,
      outputTokens: result.usage?.outputTokens ?? 0,
      costUsd: openRouterCostUsd(result.providerMetadata),
    });

    const scores = {} as Record<AskedCategory, number>;
    for (const c of PRECEDENCE) {
      const answer = result.answers[c];
      const p = answer?.type === "boolean" ? answer.probability : undefined;
      if (typeof p !== "number" || !Number.isFinite(p) || p < 0 || p > 1) {
        throw new ClassifierError("invalid_output", "Jev (OpenRouter) answer failed validation");
      }
      scores[c] = p;
    }
    const picked = pickCategory(scores, { wordCount: countWords(input.text) });
    return { ...picked, provider: "jev", model, scores };
  }
}
