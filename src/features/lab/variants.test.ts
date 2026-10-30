import { describe, expect, it, vi } from "vitest";
import { DRAFT_PROMPT_VERSION } from "@/features/drafting";
import { JEV_QUESTION_SETS, JEV_QUESTIONS_VERSION } from "@/lib/classifier/jev-questions";
import { JevClassifier } from "@/lib/classifier/jev";
import {
  LLM_CLASSIFY_PROMPT_VERSION,
  LLM_CLASSIFY_PROMPTS,
  LlmClassifier,
} from "@/lib/classifier/llm";
import type { LlmClient } from "@/lib/llm/client";
import { currentVariant, resolveContext, variantSchema } from "./variants";

describe("variants", () => {
  it("the current variant is what production runs", () => {
    expect(currentVariant()).toEqual({
      classifier: "production",
      questionsVersion: JEV_QUESTIONS_VERSION,
      classifyPromptVersion: LLM_CLASSIFY_PROMPT_VERSION,
      draftPromptVersion: DRAFT_PROMPT_VERSION,
      context: { mode: "profile" },
    });
  });

  it("accepts only versions held in code", () => {
    const ok = variantSchema.safeParse({ ...currentVariant(), questionsVersion: "2026-10-28.1" });
    expect(ok.success).toBe(true);
    const bad = variantSchema.safeParse({ ...currentVariant(), questionsVersion: "made-up" });
    expect(bad.success).toBe(false);
  });

  it("custom context needs text within the cap", () => {
    expect(
      variantSchema.safeParse({ ...currentVariant(), context: { mode: "custom", text: " " } })
        .success,
    ).toBe(false);
    expect(
      variantSchema.safeParse({
        ...currentVariant(),
        context: { mode: "custom", text: "x".repeat(1001) },
      }).success,
    ).toBe(false);
  });

  it("resolves the business context", () => {
    expect(resolveContext(currentVariant(), { name: "Pixel Presets" })).toBe("Pixel Presets");
    expect(
      resolveContext(currentVariant(), {
        name: "Pixel Presets",
        businessProfile: "Sells Lightroom presets as instant downloads.",
      }),
    ).toBe("Pixel Presets. Sells Lightroom presets as instant downloads.");
    expect(
      resolveContext(
        { ...currentVariant(), context: { mode: "name" } },
        { name: "Pixel Presets", businessProfile: "Sells presets." },
      ),
    ).toBe("Pixel Presets");
    expect(
      resolveContext(
        { ...currentVariant(), context: { mode: "custom", text: "Sells Lightroom presets." } },
        { name: "Pixel Presets" },
      ),
    ).toBe("Sells Lightroom presets.");
  });
});

describe("version registries reach the wire", () => {
  it("Jev asks the chosen question version", async () => {
    const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () =>
      Response.json({
        model: "jevos-v5",
        answers: Object.fromEntries(
          ["complaint", "lead", "faq", "spam"].map((c) => [c, { type: "noul", noul: 0.1 }]),
        ),
        usage: { input_tokens: 10, output_tokens: 1 },
      }),
    );
    const jev = new JevClassifier(
      { url: "https://jev.test/v1/systemone", model: "jev-latest", costPerMTokInput: 0 },
      { usage: { record: async () => {} }, fetch: fetchMock as unknown as typeof fetch },
      JEV_QUESTION_SETS["2026-10-28.1"],
    );
    await jev.classify({ tenantId: "t", text: "Do you have oat milk?", kind: "comment" });
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(body.questions.lead.instructions).toBe(JEV_QUESTION_SETS["2026-10-28.1"].lead);
  });

  it("the LLM classifier uses the chosen prompt version", async () => {
    const generateObject = vi.fn(async () => ({
      object: { category: "faq", confidence: 0.9 },
      model: "m",
    }));
    const llm = { generateObject, embed: vi.fn() } as unknown as LlmClient;
    await new LlmClassifier(llm, "2026-10-28.1").classify({
      tenantId: "t",
      text: "Do you have oat milk?",
      kind: "comment",
    });
    expect(generateObject).toHaveBeenCalledWith(
      expect.objectContaining({ system: LLM_CLASSIFY_PROMPTS["2026-10-28.1"] }),
    );
  });
});
