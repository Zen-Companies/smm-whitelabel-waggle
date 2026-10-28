import { describe, expect, it, vi } from "vitest";
import { memoryUsage } from "@/lib/llm/test-utils";
import { JEV_QUESTIONS } from "./jev-questions";
import { OpenRouterJevClassifier } from "./jev-openrouter";
import type { ClassifyInput } from "./types";

const input: ClassifyInput = {
  tenantId: "t",
  itemId: "i",
  text: "Can I book a table for six on Friday?",
  kind: "dm",
  businessContext: "Demo cafe",
};

// Response shape from @openrouter/ai-sdk-provider's own schema (OpenRouterDecisionsResponseSchema).
const decisions = (noul: Record<string, number>, status = 200) =>
  new Response(
    JSON.stringify({
      model: "typesafe/jev-1.13",
      provider: "TypeSafe",
      answers: Object.fromEntries(
        Object.entries(noul).map(([k, v]) => [k, { type: "noul", noul: v }]),
      ),
      usage: { input_tokens: 150, output_tokens: 4, cost: 0.0000063 },
    }),
    { status, headers: { "Content-Type": "application/json" } },
  );

function setup(respond: () => Response) {
  const fetchMock = vi.fn<typeof fetch>(async () => respond());
  const usage = memoryUsage();
  const jev = new OpenRouterJevClassifier(
    { apiKey: "sk-or-test" },
    { usage, fetch: fetchMock },
  );
  return { jev, fetchMock, usage };
}

describe("OpenRouterJevClassifier", () => {
  it("asks the four questions as noul via the Decisions API and picks the category", async () => {
    const { jev, fetchMock, usage } = setup(() =>
      decisions({ complaint: 0.02, lead: 0.96, faq: 0.4, spam: 0.01 }),
    );

    const result = await jev.classify(input);

    expect(result).toMatchObject({ category: "lead", provider: "jev", model: "typesafe/jev-1.13" });
    expect(result.confidence).toBeCloseTo(0.96 * 0.98, 2);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://openrouter.ai/api/alpha/decisions");
    const body = JSON.parse(String(init?.body));
    expect(body.model).toBe("typesafe/jev-1.13");
    expect(body.state).toEqual({
      business: "Demo cafe",
      channel: "dm",
      customer_message: input.text,
    });
    expect(body.questions.complaint).toMatchObject({
      type: "noul",
      instructions: JEV_QUESTIONS.complaint,
    });
    expect(Object.keys(body.questions).sort()).toEqual(["complaint", "faq", "lead", "spam"]);
    expect(usage.records).toEqual([
      expect.objectContaining({
        purpose: "classify",
        provider: "openrouter",
        inputTokens: 150,
        costUsd: 0.0000063,
      }),
    ]);
  });

  it("maps HTTP errors to ClassifierError http", async () => {
    const { jev } = setup(
      () => new Response(JSON.stringify({ error: { message: "nope" } }), { status: 429 }),
    );
    await expect(jev.classify(input)).rejects.toMatchObject({ kind: "http", status: 429 });
  });

  it("rejects a missing answer as invalid_output", async () => {
    const { jev } = setup(() => decisions({ complaint: 0.1, lead: 0.2, faq: 0.3 }));
    await expect(jev.classify(input)).rejects.toMatchObject({ kind: "invalid_output" });
  });
});
