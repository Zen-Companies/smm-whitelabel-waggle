import {
  ClassifierError,
  type Classification,
  type Classifier,
  type ClassifyInput,
  type ClassifyOptions,
  type FallbackReason,
} from "./types";

/**
 * Tries the primary classifier (Jev) within `timeoutMs`; on timeout, error or invalid output
 * it uses the fallback (LLM) and sets `fallbackReason` (docs/tdd.md §8, §9.4).
 * If the fallback fails too, the error propagates and the job step retries.
 */
export class FallbackClassifier implements Classifier {
  constructor(
    private readonly primary: Classifier,
    private readonly fallback: Classifier,
    private readonly options: { timeoutMs: number },
  ) {}

  async classify(input: ClassifyInput, options: ClassifyOptions = {}): Promise<Classification> {
    let fallbackReason: FallbackReason;
    try {
      return await this.withTimeout(input, options.signal);
    } catch (error) {
      if (options.signal?.aborted) throw error;
      fallbackReason = error instanceof ClassifierError ? error.kind : "error";
    }
    const result = await this.fallback.classify(input, options);
    return { ...result, fallbackReason };
  }

  private async withTimeout(input: ClassifyInput, outer?: AbortSignal): Promise<Classification> {
    const controller = new AbortController();
    const abort = () => controller.abort();
    outer?.addEventListener("abort", abort, { once: true });
    let timer: ReturnType<typeof setTimeout> | undefined;

    // The race guarantees the deadline even if the primary ignores the abort signal.
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(
          new ClassifierError(
            "timeout",
            `primary classifier exceeded ${this.options.timeoutMs} ms`,
          ),
        );
      }, this.options.timeoutMs);
    });

    try {
      return await Promise.race([
        this.primary.classify(input, { signal: controller.signal }),
        deadline,
      ]);
    } finally {
      clearTimeout(timer);
      outer?.removeEventListener("abort", abort);
    }
  }
}
