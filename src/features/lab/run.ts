import "server-only";
import type { AutonomyMode } from "@/features/approvals";
import {
  FallbackClassifier,
  JEV_QUESTION_SETS,
  JevClassifier,
  LlmClassifier,
  loadJevConfig,
  OpenRouterJevClassifier,
  type Category,
  type Classifier,
} from "@/lib/classifier";
import {
  createDbUsageRecorder,
  createLlmClient,
  loadLlmConfig,
  resolveModels,
  withUsageSource,
  type AiUsageSource,
  type LlmClient,
  type UsageRecorder,
} from "@/lib/llm";
import type { ServiceClient } from "@/lib/supabase/service";
import {
  collectUsage,
  previewMessage,
  type PreviewResult,
  type TenantSnapshot,
  type UsageTotals,
} from "./engine";
import { resolveContext, type Variant } from "./variants";

/** The business's settings the dry run needs (read-only). */
export async function loadTenantSnapshot(
  db: ServiceClient,
  tenantId: string,
): Promise<TenantSnapshot> {
  const [{ data: tenant, error }, { data: modes }, { data: accounts }] = await Promise.all([
    db
      .from("tenants")
      .select("id, name, subscription_status, confidence_threshold")
      .eq("id", tenantId)
      .single(),
    db.from("autonomy_settings").select("category, mode").eq("tenant_id", tenantId),
    db.from("social_accounts").select("status").eq("tenant_id", tenantId),
  ]);
  if (error) throw new Error(`lab: tenant lookup failed: ${error.message}`);
  const statuses = (accounts ?? []).map((a) => a.status);
  return {
    id: tenant.id,
    name: tenant.name,
    subscriptionStatus: tenant.subscription_status as TenantSnapshot["subscriptionStatus"],
    confidenceThreshold: Number(tenant.confidence_threshold),
    accountStatus:
      statuses.length === 0 || statuses.includes("active")
        ? "active"
        : (statuses[0] as TenantSnapshot["accountStatus"]),
    modes: Object.fromEntries((modes ?? []).map((m) => [m.category, m.mode])) as Partial<
      Record<Category, AutonomyMode>
    >,
  };
}

function buildLlm(variant: Variant, usage: UsageRecorder): LlmClient | null {
  let config;
  try {
    config = loadLlmConfig();
  } catch {
    return null;
  }
  return createLlmClient({
    models: resolveModels({
      ...config,
      LLM_CLASSIFY_MODEL: variant.classifyModel || config.LLM_CLASSIFY_MODEL,
      LLM_DRAFT_MODEL: variant.draftModel || config.LLM_DRAFT_MODEL,
    }),
    usage,
  });
}

function buildClassifier(
  variant: Variant,
  usage: UsageRecorder,
  llm: LlmClient | null,
): Classifier {
  const questions = JEV_QUESTION_SETS[variant.questionsVersion];
  const llmClassifier = llm ? new LlmClassifier(llm, variant.classifyPromptVersion) : null;
  const jev = () => {
    const config = loadJevConfig();
    return { config, classifier: new JevClassifier(config, { usage }, questions) };
  };

  switch (variant.classifier) {
    case "llm":
      if (!llmClassifier) throw new Error("No LLM is configured (OPENROUTER_API_KEY).");
      return llmClassifier;
    case "jev":
      return jev().classifier;
    case "jev-openrouter": {
      const apiKey = process.env.OPENROUTER_API_KEY;
      if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set.");
      return new OpenRouterJevClassifier({ apiKey }, { usage }, questions);
    }
    case "production": {
      const { config, classifier } = jev();
      return llmClassifier
        ? new FallbackClassifier(classifier, llmClassifier, { timeoutMs: config.timeoutMs })
        : classifier;
    }
  }
}

export interface VariantRun {
  variant: Variant;
  result: PreviewResult;
  usage: UsageTotals;
  totalMs: number;
}

/**
 * Runs one variant for a business: real AI calls (the operator or owner pressed Run), recorded in
 * ai_usage under `source`, nothing else written.
 */
export async function runVariant(
  db: ServiceClient,
  input: {
    tenant: TenantSnapshot;
    text: string;
    kind: "comment" | "dm";
    variant: Variant;
    source: Exclude<AiUsageSource, "live">;
    stopAfter?: "triage" | "policy";
  },
): Promise<VariantRun> {
  const usage = collectUsage(withUsageSource(createDbUsageRecorder(db), input.source));
  const started = Date.now();
  const llm = buildLlm(input.variant, usage);
  let result: PreviewResult;
  try {
    result = await previewMessage(
      { db, classifier: buildClassifier(input.variant, usage, llm), llm },
      {
        tenant: input.tenant,
        text: input.text,
        kind: input.kind,
        businessContext: resolveContext(input.variant, input.tenant),
        draftPromptVersion: input.variant.draftPromptVersion,
        stopAfter: input.stopAfter,
      },
    );
  } catch (error) {
    // Building the classifier failed (e.g. Jev isn't configured): report it like a step error.
    result = {
      classification: null,
      triage: null,
      facts: null,
      draft: null,
      groundingIssues: [],
      policy: null,
      reachedStep: "classify",
      error: { step: "classify", message: (error as Error).message.slice(0, 300) },
      timings: { classifyMs: 0, draftMs: null },
    };
  }
  return { variant: input.variant, result, usage: usage.totals(), totalMs: Date.now() - started };
}
