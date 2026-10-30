import { describe, expect, it } from "vitest";
import { createLlmClient } from "@/lib/llm/client";
import { chatCompletion, fakeOpenRouter, memoryUsage } from "@/lib/llm/test-utils";
import { LLM_CLASSIFY_PROMPT_VERSION, LLM_CLASSIFY_PROMPTS, LlmClassifier } from "./llm";
import type { ClassifyInput } from "./types";

const input: ClassifyInput = {
  tenantId: "tenant-1",
  itemId: "item-1",
  text: "Can I book a table for 6 on Friday?",
  kind: "dm",
  businessContext: "Demo Coffee Shop",
};

function setup(answer: unknown) {
  const { fetchMock, models } = fakeOpenRouter(() => chatCompletion(answer, { cost: 0.00003 }));
  const usage = memoryUsage();
  return { classifier: new LlmClassifier(createLlmClient({ models, usage })), fetchMock, usage };
}

describe("LlmClassifier", () => {
  it("classifies with the classify model and records ai_usage", async () => {
    const { classifier, fetchMock, usage } = setup({ category: "lead", confidence: 0.92 });

    await expect(classifier.classify(input)).resolves.toEqual({
      category: "lead",
      confidence: 0.92,
      provider: "llm",
      model: "openai/gpt-5-mini",
    });
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.model).toBe("openai/gpt-5-mini");
    expect(JSON.stringify(body.messages)).toContain(
      "<message>\\nCan I book a table for 6 on Friday?\\n</message>",
    );
    expect(usage.records).toMatchObject([
      { purpose: "classify", provider: "openrouter", costUsd: 0.00003 },
    ]);
  });

  it("turns low confidence into unclear", async () => {
    const { classifier } = setup({ category: "faq", confidence: 0.3 });
    const result = await classifier.classify(input);
    expect(result).toMatchObject({ category: "unclear", reason: "low_confidence" });
    expect(result.confidence).toBeCloseTo(0.7);
  });

  it("never calls a message under 4 words spam", async () => {
    const { classifier } = setup({ category: "spam", confidence: 0.95 });
    const result = await classifier.classify({ ...input, text: "ok thanks" });
    expect(result).toMatchObject({ category: "unclear", reason: "no_match" });
  });

  it("passes unclear through with reason no_match", async () => {
    const { classifier } = setup({ category: "unclear", confidence: 0.8 });
    await expect(classifier.classify(input)).resolves.toMatchObject({
      category: "unclear",
      confidence: 0.8,
      reason: "no_match",
    });
  });

  it("rejects a category outside the five", async () => {
    const { classifier } = setup({ category: "praise", confidence: 0.9 });
    await expect(classifier.classify(input)).rejects.toThrow();
  });
});

describe("LLM classify prompt versions", () => {
  it("the current prompt is for any kind of business, not only local shops (T25)", () => {
    expect(LLM_CLASSIFY_PROMPTS[LLM_CLASSIFY_PROMPT_VERSION]).toContain(
      "customers send to a business",
    );
    expect(LLM_CLASSIFY_PROMPTS["2026-10-29.1"]).toContain("a local business");
  });
});
