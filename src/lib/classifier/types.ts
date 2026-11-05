export const CATEGORIES = ["faq", "lead", "complaint", "spam", "unclear"] as const;
export type Category = (typeof CATEGORIES)[number];

/** Why a message ended up `unclear` (docs/tdd.md §9.3). */
export type UnclearReason = "no_match" | "low_confidence";

/** Why FallbackClassifier used the fallback (docs/tdd.md §9.4); stored in audit_log. */
export type FallbackReason = "timeout" | "network" | "http" | "invalid_output" | "error";

export interface Classification {
  category: Category;
  confidence: number;
  provider: "jev" | "llm";
  model: string;
  /** Raw per-category scores, for tuning. Never the message text. */
  scores?: Partial<Record<Category, number>>;
  reason?: UnclearReason;
  fallbackReason?: FallbackReason;
}

export interface ClassifyInput {
  /** For ai_usage rows. */
  tenantId: string;
  itemId?: string | null;
  text: string;
  kind: "comment" | "dm";
  /** Name plus the owner's profile when there is one (`businessContext()`). */
  businessContext?: string;
  /** The business name alone, for classifiers that do worse with the profile (Jev, T25). */
  businessName?: string;
}

export interface ClassifyOptions {
  signal?: AbortSignal;
}

export interface Classifier {
  classify(input: ClassifyInput, options?: ClassifyOptions): Promise<Classification>;
}

export class ClassifierError extends Error {
  constructor(
    readonly kind: Exclude<FallbackReason, "error">,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ClassifierError";
  }
}
