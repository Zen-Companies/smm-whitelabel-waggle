import { describe, expect, it, vi } from "vitest";
import { FallbackClassifier } from "./fallback";
import { JevClassifier } from "./jev";
import { ClassifierError, type Classification, type Classifier, type ClassifyInput } from "./types";

const input: ClassifyInput = { tenantId: "t", itemId: "i", text: "Do you deliver?", kind: "dm" };
const llmResult: Classification = {
  category: "faq",
  confidence: 0.8,
  provider: "llm",
  model: "openai/gpt-5-mini",
};
const jevResult: Classification = {
  category: "lead",
  confidence: 0.9,
  provider: "jev",
  model: "jevos-v5",
};

const classifier = (impl: Classifier["classify"]) => ({ classify: vi.fn(impl) });

describe("FallbackClassifier", () => {
  it("returns the primary result when it answers in time", async () => {
    const llm = classifier(async () => llmResult);
    const fc = new FallbackClassifier(
      classifier(async () => jevResult),
      llm,
      { timeoutMs: 1000 },
    );

    await expect(fc.classify(input)).resolves.toEqual(jevResult);
    expect(llm.classify).not.toHaveBeenCalled();
  });

  it("falls back on timeout and aborts the Jev request", async () => {
    let aborted = false;
    // Real JevClassifier with a mocked HTTP call that never answers until aborted.
    const hangingFetch: typeof fetch = (_url, init) =>
      new Promise((_, reject) =>
        init?.signal?.addEventListener("abort", () => {
          aborted = true;
          reject(new DOMException("aborted", "AbortError"));
        }),
      );
    const jev = new JevClassifier(
      { url: "https://jev.test/v1/systemone", model: "jev-latest", costPerMTokInput: 0 },
      { usage: { record: async () => {} }, fetch: hangingFetch },
    );
    const llm = classifier(async () => llmResult);
    const fc = new FallbackClassifier(jev, llm, { timeoutMs: 20 });

    const started = Date.now();
    const result = await fc.classify(input);

    expect(result).toEqual({ ...llmResult, fallbackReason: "timeout" });
    expect(aborted).toBe(true);
    expect(Date.now() - started).toBeLessThan(1000);
    expect(llm.classify).toHaveBeenCalledWith(input, {});
  });

  it("falls back on timeout even if the primary ignores the abort signal", async () => {
    const stuck = classifier(() => new Promise<Classification>(() => {}));
    const fc = new FallbackClassifier(
      stuck,
      classifier(async () => llmResult),
      { timeoutMs: 20 },
    );

    await expect(fc.classify(input)).resolves.toMatchObject({
      provider: "llm",
      fallbackReason: "timeout",
    });
  });

  it.each([
    [new ClassifierError("http", "Jev returned 529", 529), "http"],
    [new ClassifierError("invalid_output", "bad"), "invalid_output"],
    [new ClassifierError("network", "down"), "network"],
    [new Error("unexpected"), "error"],
  ])("falls back on %s", async (error, reason) => {
    const fc = new FallbackClassifier(
      classifier(async () => {
        throw error;
      }),
      classifier(async () => llmResult),
      { timeoutMs: 1000 },
    );
    await expect(fc.classify(input)).resolves.toEqual({ ...llmResult, fallbackReason: reason });
  });

  it("propagates a fallback failure so the job step retries", async () => {
    const fc = new FallbackClassifier(
      classifier(async () => {
        throw new ClassifierError("network", "down");
      }),
      classifier(async () => {
        throw new Error("llm down");
      }),
      { timeoutMs: 1000 },
    );
    await expect(fc.classify(input)).rejects.toThrow("llm down");
  });

  it("does not fall back when the caller aborts", async () => {
    const llm = classifier(async () => llmResult);
    const primary = classifier(
      (_input, options) =>
        new Promise<Classification>((_, reject) =>
          options?.signal?.addEventListener("abort", () =>
            reject(new ClassifierError("timeout", "aborted")),
          ),
        ),
    );
    const fc = new FallbackClassifier(primary, llm, { timeoutMs: 1000 });
    const controller = new AbortController();
    const pending = fc.classify(input, { signal: controller.signal });
    controller.abort();

    await expect(pending).rejects.toBeInstanceOf(ClassifierError);
    expect(llm.classify).not.toHaveBeenCalled();
  });
});
