import { z } from "zod";
import { parseEnv } from "@/lib/env";
import type { UsageRecorder } from "@/lib/llm/usage";
import { JEV_QUESTIONS, type JevQuestions } from "./jev-questions";
import { countWords, pickCategory, PRECEDENCE, type AskedCategory } from "./pick-category";
import {
  ClassifierError,
  type Classification,
  type Classifier,
  type ClassifyInput,
  type ClassifyOptions,
} from "./types";

// docs/tdd.md §9.4.
const jevEnvSchema = z.object({
  JEV_API_URL: z.url(),
  JEV_API_KEY: z.string().optional(),
  JEV_MODEL: z.string().default("jev-latest"),
  JEV_TIMEOUT_MS: z.coerce.number().int().positive().default(3000),
  JEV_COST_PER_MTOK_INPUT: z.coerce.number().nonnegative().default(0),
});

export interface JevConfig {
  url: string;
  apiKey?: string;
  model: string;
  timeoutMs: number;
  costPerMTokInput: number;
}

export function loadJevConfig(env: Record<string, string | undefined> = process.env): JevConfig {
  const data = parseEnv(jevEnvSchema, env, "Jev");
  return {
    url: data.JEV_API_URL,
    apiKey: data.JEV_API_KEY,
    model: data.JEV_MODEL,
    timeoutMs: data.JEV_TIMEOUT_MS,
    costPerMTokInput: data.JEV_COST_PER_MTOK_INPUT,
  };
}

// §9.1: every asked key present, type "noul", noul finite in [0, 1].
const noulAnswer = z.object({ type: z.literal("noul"), noul: z.number().min(0).max(1) });
const jevResponseSchema = z.object({
  model: z.string().min(1),
  answers: z.object(
    Object.fromEntries(PRECEDENCE.map((c) => [c, noulAnswer])) as Record<
      AskedCategory,
      typeof noulAnswer
    >,
  ),
});
const jevUsageSchema = z.object({
  model: z.string().min(1),
  usage: z.object({
    input_tokens: z.number().int().nonnegative(),
    output_tokens: z.number().int().nonnegative(),
  }),
});

// Only this adapter knows the wire format (§9). Never log the request: it holds customer text.
export class JevClassifier implements Classifier {
  constructor(
    private readonly config: Omit<JevConfig, "timeoutMs">,
    private readonly deps: { usage: UsageRecorder; fetch?: typeof fetch },
    /** Another question version (the Lab); production uses the current one. */
    private readonly questions: JevQuestions = JEV_QUESTIONS,
  ) {}

  async classify(input: ClassifyInput, options: ClassifyOptions = {}): Promise<Classification> {
    const fetchFn = this.deps.fetch ?? fetch;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.config.apiKey) headers.Authorization = `Bearer ${this.config.apiKey}`;

    const body = {
      model: this.config.model,
      state: {
        ...(input.businessContext ? { business: input.businessContext } : {}),
        channel: input.kind,
        customer_message: input.text,
      },
      questions: Object.fromEntries(
        PRECEDENCE.map((c) => [c, { type: "noul", instructions: this.questions[c] }]),
      ),
    };

    let response: Response;
    try {
      response = await fetchFn(this.config.url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: options.signal,
      });
    } catch (error) {
      if (options.signal?.aborted) throw new ClassifierError("timeout", "Jev request aborted");
      throw new ClassifierError("network", `Jev request failed: ${(error as Error).name}`);
    }

    if (!response.ok) {
      throw new ClassifierError("http", `Jev returned ${response.status}`, response.status);
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch {
      if (options.signal?.aborted) throw new ClassifierError("timeout", "Jev request aborted");
      throw new ClassifierError("invalid_output", "Jev response is not JSON");
    }

    // Tokens were spent even if the answers turn out invalid, so record usage first.
    const usage = jevUsageSchema.safeParse(json);
    if (usage.success) {
      await this.deps.usage.record({
        tenantId: input.tenantId,
        itemId: input.itemId,
        purpose: "classify",
        provider: "jev",
        model: usage.data.model,
        inputTokens: usage.data.usage.input_tokens,
        outputTokens: usage.data.usage.output_tokens,
        costUsd: (usage.data.usage.input_tokens * this.config.costPerMTokInput) / 1e6,
      });
    }

    const parsed = jevResponseSchema.safeParse(json);
    if (!parsed.success) {
      throw new ClassifierError("invalid_output", "Jev response failed validation");
    }

    const scores = Object.fromEntries(
      PRECEDENCE.map((c) => [c, parsed.data.answers[c].noul]),
    ) as Record<AskedCategory, number>;
    const picked = pickCategory(scores, { wordCount: countWords(input.text) });

    return { ...picked, provider: "jev", model: parsed.data.model, scores };
  }
}
