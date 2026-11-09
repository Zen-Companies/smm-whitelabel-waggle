import { policy, triage, type AutonomyMode, type PolicyDecision } from "@/features/approvals";
import { generateDraft, type DraftPromptVersion, type ThreadMessage } from "@/features/drafting";
import type { Category, Classification, Classifier } from "@/lib/classifier/types";
import type { LlmClient } from "@/lib/llm/client";
import type { AiUsageRecord, UsageRecorder } from "@/lib/llm/usage";
import type { ServiceClient } from "@/lib/supabase/service";

// Dry run of one message through the pipeline (docs/tdd.md §19, T23): classify → triage →
// retrieve → draft → grounding → policy(), every step's output returned. It writes nothing but
// ai_usage (through the recorder the caller passes) and never sends: no item exists, so status.ts
// and SocialProvider are never involved.

export interface TenantSnapshot {
  id: string;
  name: string;
  /** The owner's description (T25); empty when there is none. */
  businessProfile: string;
  subscriptionStatus: "trialing" | "active" | "past_due" | "canceled";
  confidenceThreshold: number;
  /** "Pause all replies" (T27): auto mode then waits for the owner. */
  repliesPaused: boolean;
  /** This month's AI allowance is used up (T32): messages are sorted, nothing is drafted. */
  aiCapReached: boolean;
  /** The business's connected account; "active" when it has none yet (onboarding). */
  accountStatus: "active" | "disconnected" | "error";
  /** Autonomy mode per category; a missing one means off, as in production. */
  modes: Partial<Record<Category, AutonomyMode>>;
}

export interface PreviewInput {
  tenant: TenantSnapshot;
  text: string;
  kind: "comment" | "dm";
  /** What the classifier is told about the business (variant-dependent). */
  businessContext: string;
  draftPromptVersion?: DraftPromptVersion;
  /** "triage": stop before any draft (classification-only runs cost one call). */
  stopAfter?: "triage" | "policy";
  /** Earlier messages of a real DM thread, oldest first, as production drafting gets them (T30). */
  history?: ThreadMessage[];
}

export interface PreviewDeps {
  /** Only for retrieval (match_kb_entries). */
  db: ServiceClient;
  classifier: Classifier;
  /** null when no LLM is configured: the run stops after triage. */
  llm: LlmClient | null;
  now?: () => Date;
}

export type PreviewStep = "classify" | "triage" | "draft" | "policy";

export interface PreviewResult {
  classification: Classification | null;
  triage: ReturnType<typeof triage> | null;
  facts: { id: string; title: string; similarity: number }[] | null;
  draft: {
    reply: string;
    needsHuman: boolean;
    reason?: string;
    lead?: { name?: string; contact?: string; request?: string };
  } | null;
  groundingIssues: string[];
  policy: PolicyDecision | null;
  /** The last step that ran. */
  reachedStep: PreviewStep;
  /** A step that failed: its name and our error message (never message text). */
  error: { step: PreviewStep; message: string } | null;
  timings: { classifyMs: number; draftMs: number | null };
}

const errorMessage = (error: unknown) =>
  (error instanceof Error ? `${error.name}: ${error.message}` : String(error)).slice(0, 300);

export async function previewMessage(
  deps: PreviewDeps,
  input: PreviewInput,
): Promise<PreviewResult> {
  const now = deps.now?.() ?? new Date();
  const { tenant } = input;
  const result: PreviewResult = {
    classification: null,
    triage: null,
    facts: null,
    draft: null,
    groundingIssues: [],
    policy: null,
    reachedStep: "classify",
    error: null,
    timings: { classifyMs: 0, draftMs: null },
  };

  const started = Date.now();
  try {
    result.classification = await deps.classifier.classify({
      tenantId: tenant.id,
      itemId: null,
      text: input.text,
      kind: input.kind,
      businessContext: input.businessContext,
    });
  } catch (error) {
    result.error = { step: "classify", message: errorMessage(error) };
    return result;
  } finally {
    result.timings.classifyMs = Date.now() - started;
  }

  const { category, confidence } = result.classification;
  const policyBase = {
    item: { kind: input.kind },
    classification: { category, confidence },
    tenant: {
      subscriptionStatus: tenant.subscriptionStatus,
      confidenceThreshold: tenant.confidenceThreshold,
      repliesPaused: tenant.repliesPaused,
    },
    account: { status: tenant.accountStatus },
    autonomyMode: tenant.modes[category] ?? "off",
  };
  result.triage = triage({ ...policyBase, aiCapReached: tenant.aiCapReached });
  result.reachedStep = "triage";
  if (result.triage.decision !== "draft" || input.stopAfter === "triage") return result;
  if (!deps.llm) {
    result.error = { step: "draft", message: "No LLM is configured (OPENROUTER_API_KEY)." };
    return result;
  }

  const draftStarted = Date.now();
  try {
    const generated = await generateDraft(
      { db: deps.db, llm: deps.llm },
      {
        tenantId: tenant.id,
        itemId: null,
        businessName: tenant.name,
        kind: input.kind,
        category,
        text: input.text,
        promptVersion: input.draftPromptVersion,
        history: input.history,
      },
    );
    result.facts = generated.facts.map((f) => ({
      id: f.id,
      title: f.title,
      similarity: f.similarity,
    }));
    result.draft = { ...generated.result, needsHuman: generated.needsHuman };
    result.groundingIssues = generated.issues;
  } catch (error) {
    result.error = { step: "draft", message: errorMessage(error) };
    return result;
  } finally {
    result.timings.draftMs = Date.now() - draftStarted;
  }
  result.reachedStep = "draft";

  // A fresh message: a DM's 24-hour window has just opened.
  result.policy = policy({
    ...policyBase,
    draft: { needsHuman: result.draft.needsHuman },
    lastCustomerMessageAt: now,
    now,
  });
  result.reachedStep = "policy";
  return result;
}

export interface UsageTotals {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  models: string[];
}

/** Passes each record on and keeps a running total for the run's cost line. */
export function collectUsage(inner: UsageRecorder): UsageRecorder & { totals(): UsageTotals } {
  const records: AiUsageRecord[] = [];
  return {
    async record(usage) {
      records.push(usage);
      await inner.record(usage);
    },
    totals: () => ({
      calls: records.length,
      inputTokens: records.reduce((n, r) => n + r.inputTokens, 0),
      outputTokens: records.reduce((n, r) => n + r.outputTokens, 0),
      costUsd: records.reduce((n, r) => n + r.costUsd, 0),
      models: [...new Set(records.map((r) => r.model))],
    }),
  };
}
