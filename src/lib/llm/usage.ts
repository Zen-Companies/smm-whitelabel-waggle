import * as Sentry from "@sentry/nextjs";
import { z } from "zod";
import type { ServiceClient } from "@/lib/supabase/service";

export type AiPurpose = "classify" | "draft" | "embed" | "agent";

/** live: the inbox pipeline. lab: operator experiments. practice: an owner trying a message. */
export type AiUsageSource = "live" | "lab" | "practice";

export interface AiUsageRecord {
  tenantId: string;
  itemId?: string | null;
  purpose: AiPurpose;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  /** Defaults to live. */
  source?: AiUsageSource;
}

export interface UsageRecorder {
  record(usage: AiUsageRecord): Promise<void>;
}

const openRouterMetadataSchema = z.object({
  openrouter: z.object({ usage: z.object({ cost: z.number().nonnegative() }) }),
});

/** Cost in USD that OpenRouter reports for a call, or 0 when the response has none. */
export function openRouterCostUsd(providerMetadata: unknown): number {
  const parsed = openRouterMetadataSchema.safeParse(providerMetadata);
  return parsed.success ? parsed.data.openrouter.usage.cost : 0;
}

// A failed insert must not fail the AI step: retrying the step would pay for the call again.
// It is reported to Sentry by ids only.
export function createDbUsageRecorder(db: ServiceClient): UsageRecorder {
  return {
    async record(usage) {
      const { error } = await db.from("ai_usage").insert({
        tenant_id: usage.tenantId,
        item_id: usage.itemId ?? null,
        purpose: usage.purpose,
        provider: usage.provider,
        model: usage.model,
        input_tokens: usage.inputTokens,
        output_tokens: usage.outputTokens,
        cost_usd: usage.costUsd,
        source: usage.source ?? "live",
      });
      if (error) {
        Sentry.captureException(new Error(`ai_usage insert failed: ${error.message}`), {
          extra: { tenantId: usage.tenantId, itemId: usage.itemId, purpose: usage.purpose },
        });
      }
    },
  };
}

/** Tags every record with `source` (docs/tdd.md §19): lab and practice calls stay apart from live. */
export function withUsageSource(inner: UsageRecorder, source: AiUsageSource): UsageRecorder {
  return { record: (usage) => inner.record({ ...usage, source }) };
}
