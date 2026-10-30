import { describe, expect, it } from "vitest";
import { z } from "zod";
import { tool } from "ai";
import { AGENT_MAX_STEPS, createLlmClient } from "./client";
import { loadLlmConfig } from "./config";
import {
  chatCompletion,
  embeddingResponse,
  errorResponse,
  fakeOpenRouter,
  memoryUsage,
  toolCallCompletion,
} from "./test-utils";

const schema = z.object({ answer: z.string() });
const call = { tenantId: "tenant-1", itemId: "item-1" };

describe("createLlmClient.generateObject", () => {
  it("calls OpenRouter with the purpose's model and returns the validated object", async () => {
    const { fetchMock, models } = fakeOpenRouter(() =>
      chatCompletion(
        { answer: "We open at 8." },
        { model: "openai/gpt-5-2026-08-07", cost: 0.00042 },
      ),
    );
    const usage = memoryUsage();
    const llm = createLlmClient({ models, usage });

    const result = await llm.generateObject({
      ...call,
      purpose: "draft",
      schema,
      system: "Answer from the business info only.",
      prompt: "When do you open?",
    });

    expect(result).toEqual({
      object: { answer: "We open at 8." },
      model: "openai/gpt-5-2026-08-07",
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer sk-or-test");
    const body = JSON.parse(String(init?.body));
    expect(body.model).toBe("openai/gpt-5");
    expect(body.usage).toEqual({ include: true });
  });

  it("records ai_usage with OpenRouter's reported cost and the served model", async () => {
    const { models } = fakeOpenRouter(() =>
      chatCompletion(
        { answer: "ok" },
        {
          model: "openai/gpt-5-mini-2026-08-07",
          cost: 0.0001,
          promptTokens: 300,
          completionTokens: 20,
        },
      ),
    );
    const usage = memoryUsage();
    await createLlmClient({ models, usage }).generateObject({
      ...call,
      purpose: "classify",
      schema,
      system: "s",
      prompt: "p",
    });

    expect(usage.records).toEqual([
      {
        tenantId: "tenant-1",
        itemId: "item-1",
        purpose: "classify",
        provider: "openrouter",
        model: "openai/gpt-5-mini-2026-08-07",
        inputTokens: 300,
        outputTokens: 20,
        costUsd: 0.0001,
      },
    ]);
  });

  it("records cost 0 when OpenRouter reports none", async () => {
    const { models } = fakeOpenRouter(() => chatCompletion({ answer: "ok" }));
    const usage = memoryUsage();
    await createLlmClient({ models, usage }).generateObject({
      ...call,
      purpose: "classify",
      schema,
      system: "s",
      prompt: "p",
    });
    expect(usage.records[0].costUsd).toBe(0);
  });

  it("rejects output that doesn't match the schema", async () => {
    const { models } = fakeOpenRouter(() => chatCompletion({ wrong: true }));
    const llm = createLlmClient({ models, usage: memoryUsage() });
    await expect(
      llm.generateObject({ ...call, purpose: "classify", schema, system: "s", prompt: "p" }),
    ).rejects.toThrow();
  });

  it("surfaces HTTP errors", async () => {
    const { models } = fakeOpenRouter(() => errorResponse(400));
    const usage = memoryUsage();
    const llm = createLlmClient({ models, usage });
    await expect(
      llm.generateObject({ ...call, purpose: "classify", schema, system: "s", prompt: "p" }),
    ).rejects.toThrow();
    expect(usage.records).toHaveLength(0);
  });
});

describe("createLlmClient.embed", () => {
  it("embeds through OpenRouter and records purpose embed with cost", async () => {
    const { fetchMock, models } = fakeOpenRouter(() =>
      embeddingResponse([0.1, 0.2, 0.3], { cost: 0.000002, tokens: 7 }),
    );
    const usage = memoryUsage();

    const result = await createLlmClient({ models, usage }).embed({
      tenantId: "tenant-1",
      value: "Opening hours",
    });

    expect(result).toEqual({ embedding: [0.1, 0.2, 0.3], model: "openai/text-embedding-3-small" });
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://openrouter.ai/api/v1/embeddings");
    // The column is vector(1536): models that can shorten their output are asked to.
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body).toMatchObject({ model: "openai/text-embedding-3-small", dimensions: 1536 });
    expect(usage.records).toEqual([
      {
        tenantId: "tenant-1",
        itemId: undefined,
        purpose: "embed",
        provider: "openrouter",
        model: "openai/text-embedding-3-small",
        inputTokens: 7,
        outputTokens: 0,
        costUsd: 0.000002,
      },
    ]);
  });
});

describe("loadLlmConfig", () => {
  it("defaults providers to openrouter", () => {
    const config = loadLlmConfig({
      OPENROUTER_API_KEY: "k",
      LLM_CLASSIFY_MODEL: "a/b",
      LLM_DRAFT_MODEL: "a/c",
      EMBEDDING_MODEL: "a/d",
      LLM_PROVIDER: "",
    });
    expect(config.LLM_PROVIDER).toBe("openrouter");
    expect(config.EMBEDDING_PROVIDER).toBe("openrouter");
  });

  it("names missing keys", () => {
    expect(() => loadLlmConfig({ OPENROUTER_API_KEY: "k" })).toThrow(
      /LLM_CLASSIFY_MODEL, LLM_DRAFT_MODEL, EMBEDDING_MODEL/,
    );
  });

  it("rejects unknown providers", () => {
    expect(() =>
      loadLlmConfig({
        OPENROUTER_API_KEY: "k",
        LLM_CLASSIFY_MODEL: "a",
        LLM_DRAFT_MODEL: "b",
        EMBEDDING_MODEL: "c",
        LLM_PROVIDER: "anthropic",
      }),
    ).toThrow(/LLM_PROVIDER/);
  });
});

describe("createLlmClient.runTools (T33)", () => {
  const tools = {
    list_topics: tool({
      description: "Topics",
      inputSchema: z.object({}),
      execute: async () => [{ title: "Opening hours" }],
    }),
  };

  it("runs the tools, returns the final answer and records one ai_usage row per step", async () => {
    let calls = 0;
    const bodies: Record<string, unknown>[] = [];
    const { models } = fakeOpenRouter((_url, body) => {
      bodies.push(body);
      calls += 1;
      return calls === 1
        ? toolCallCompletion([{ name: "list_topics", args: {} }], { cost: 0.001 })
        : chatCompletion({ answer: "Parking" }, { model: "openai/gpt-5", cost: 0.002 });
    });
    const usage = memoryUsage();
    const result = await createLlmClient({ models, usage }).runTools({
      tenantId: "tenant-1",
      purpose: "agent",
      schema,
      system: "Suggest topics.",
      prompt: "Go.",
      tools,
      maxSteps: 4,
    });

    expect(result).toMatchObject({ object: { answer: "Parking" }, steps: 2 });
    expect(usage.records.map((r) => [r.purpose, r.costUsd])).toEqual([
      ["agent", 0.001],
      ["agent", 0.002],
    ]);
    // The tool's result went back to the model in the second call.
    expect(JSON.stringify(bodies[1])).toContain("Opening hours");
  });

  it("stops at the step cap: a run still calling tools fails, and its calls are recorded", async () => {
    const { fetchMock, models } = fakeOpenRouter(() =>
      toolCallCompletion([{ name: "list_topics", args: {} }]),
    );
    const usage = memoryUsage();
    await expect(
      createLlmClient({ models, usage }).runTools({
        tenantId: "tenant-1",
        purpose: "agent",
        schema,
        system: "s",
        prompt: "p",
        tools,
        maxSteps: 50,
      }),
    ).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(AGENT_MAX_STEPS);
    expect(usage.records).toHaveLength(AGENT_MAX_STEPS);
  });
});
