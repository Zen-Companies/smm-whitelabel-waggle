import { vi } from "vitest";
import type { LlmConfig } from "./config";
import { resolveModels } from "./provider";
import type { AiUsageRecord, UsageRecorder } from "./usage";

// Test helpers: a fake OpenRouter HTTP API, so no test calls the real one.

export const testLlmConfig: LlmConfig = {
  LLM_PROVIDER: "openrouter",
  OPENROUTER_API_KEY: "sk-or-test",
  LLM_CLASSIFY_MODEL: "openai/gpt-5-mini",
  LLM_DRAFT_MODEL: "openai/gpt-5",
  EMBEDDING_PROVIDER: "openrouter",
  EMBEDDING_MODEL: "openai/text-embedding-3-small",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export function chatCompletion(
  content: unknown,
  opts: { model?: string; cost?: number; promptTokens?: number; completionTokens?: number } = {},
) {
  const promptTokens = opts.promptTokens ?? 200;
  const completionTokens = opts.completionTokens ?? 12;
  return json({
    id: "gen-test",
    object: "chat.completion",
    created: 1_761_652_800,
    model: opts.model ?? "openai/gpt-5-mini",
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: JSON.stringify(content) },
        finish_reason: "stop",
      },
    ],
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
      ...(opts.cost === undefined ? {} : { cost: opts.cost }),
    },
  });
}

export function embeddingResponse(
  embedding: number[],
  opts: { cost?: number; tokens?: number } = {},
) {
  const tokens = opts.tokens ?? 8;
  return json({
    object: "list",
    model: "openai/text-embedding-3-small",
    data: [{ object: "embedding", embedding, index: 0 }],
    usage: {
      prompt_tokens: tokens,
      total_tokens: tokens,
      ...(opts.cost === undefined ? {} : { cost: opts.cost }),
    },
  });
}

export function errorResponse(status: number) {
  return json({ error: { code: status, message: "upstream error" } }, status);
}

export function fakeOpenRouter(respond: (url: string, body: Record<string, unknown>) => Response) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    return respond(url, body);
  });
  const models = resolveModels(testLlmConfig, { fetch: fetchMock as unknown as typeof fetch });
  return { fetchMock, models };
}

export function memoryUsage(): UsageRecorder & { records: AiUsageRecord[] } {
  const records: AiUsageRecord[] = [];
  return { records, record: async (r) => void records.push(r) };
}
