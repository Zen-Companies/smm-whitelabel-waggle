import { describe, expect, it, vi } from "vitest";
import type { Classification, Classifier } from "@/lib/classifier/types";
import { createLlmClient } from "@/lib/llm/client";
import {
  chatCompletion,
  embeddingResponse,
  fakeOpenRouter,
  memoryUsage,
} from "@/lib/llm/test-utils";
import { withUsageSource } from "@/lib/llm/usage";
import type { ServiceClient } from "@/lib/supabase/service";
import { collectUsage, previewMessage, type TenantSnapshot } from "./engine";

const tenant: TenantSnapshot = {
  id: "tenant-1",
  name: "Harbour Bean Café",
  businessProfile: "",
  subscriptionStatus: "active",
  confidenceThreshold: 0.85,
  repliesPaused: false,
  accountStatus: "active",
  modes: { faq: "approve", lead: "approve" },
};

const facts = [
  { id: "kb-1", title: "Opening hours", content: "Sundays 8am to 4pm.", similarity: 0.82 },
];

/** Retrieval may call match_kb_entries; any table access fails the test (no writes allowed). */
function fakeDb() {
  const rpc = vi.fn(async () => ({ data: facts, error: null }));
  const from = vi.fn(() => {
    throw new Error("the dry run must not touch tables");
  });
  return { db: { rpc, from } as unknown as ServiceClient, rpc, from };
}

const classifierReturning = (c: Partial<Classification>): Classifier => ({
  classify: vi.fn(async () => ({
    category: "faq",
    confidence: 0.93,
    provider: "jev",
    model: "jevos-v5",
    ...c,
  })) as Classifier["classify"],
});

function fakeLlm(reply = "We're open 8am to 4pm on Sundays!", needsHuman = false) {
  const usage = memoryUsage();
  const { fetchMock, models } = fakeOpenRouter((url) =>
    url.includes("/embeddings")
      ? embeddingResponse(Array(1536).fill(0.01), { cost: 0.00001 })
      : chatCompletion({ reply, needsHuman, reason: null, lead: null }, { cost: 0.0004 }),
  );
  return { llm: createLlmClient({ models, usage }), usage, fetchMock };
}

describe("previewMessage", () => {
  it("runs every step for a covered question and writes nothing but ai_usage", async () => {
    const { db, from, rpc } = fakeDb();
    const { llm, usage } = fakeLlm();
    const result = await previewMessage(
      { db, classifier: classifierReturning({}), llm },
      { tenant, text: "Open on Sunday?", kind: "comment", businessContext: tenant.name },
    );

    expect(result.error).toBeNull();
    expect(result.classification?.category).toBe("faq");
    expect(result.triage).toEqual({ decision: "draft" });
    expect(result.facts).toEqual([{ id: "kb-1", title: "Opening hours", similarity: 0.82 }]);
    expect(result.draft?.reply).toContain("8am to 4pm");
    expect(result.groundingIssues).toEqual([]);
    expect(result.policy).toEqual({ decision: "approve", reason: "approval_required" });
    expect(result.reachedStep).toBe("policy");
    expect(rpc).toHaveBeenCalledWith("match_kb_entries", expect.anything());
    expect(from).not.toHaveBeenCalled();
    expect(usage.records.map((r) => r.purpose)).toEqual(["embed", "draft"]);
  });

  it("stops at triage for spam without calling the LLM", async () => {
    const { db } = fakeDb();
    const { llm, fetchMock } = fakeLlm();
    const result = await previewMessage(
      { db, classifier: classifierReturning({ category: "spam", confidence: 0.9 }), llm },
      { tenant, text: "Buy followers cheap!!", kind: "comment", businessContext: tenant.name },
    );
    expect(result.triage).toEqual({ decision: "ignore", reason: "spam" });
    expect(result.draft).toBeNull();
    expect(result.reachedStep).toBe("triage");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stopAfter triage skips drafting (classification-only runs)", async () => {
    const { db } = fakeDb();
    const { llm, fetchMock } = fakeLlm();
    const result = await previewMessage(
      { db, classifier: classifierReturning({}), llm },
      {
        tenant,
        text: "Open on Sunday?",
        kind: "comment",
        businessContext: tenant.name,
        stopAfter: "triage",
      },
    );
    expect(result.triage).toEqual({ decision: "draft" });
    expect(result.draft).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("an amount the facts don't contain makes it needsHuman, and policy escalates", async () => {
    const { db } = fakeDb();
    const { llm } = fakeLlm("A cake is ₱1,500.");
    const result = await previewMessage(
      { db, classifier: classifierReturning({}), llm },
      { tenant, text: "How much is a cake?", kind: "comment", businessContext: tenant.name },
    );
    expect(result.groundingIssues).toEqual(["ungrounded_amount"]);
    expect(result.draft?.needsHuman).toBe(true);
    expect(result.policy).toEqual({ decision: "escalate", reason: "needs_human" });
  });

  it("a DM in auto mode would be sent: the window has just opened", async () => {
    const { db } = fakeDb();
    const { llm } = fakeLlm();
    const result = await previewMessage(
      { db, classifier: classifierReturning({}), llm },
      {
        tenant: { ...tenant, modes: { faq: "auto" } },
        text: "Open on Sunday?",
        kind: "dm",
        businessContext: tenant.name,
      },
    );
    expect(result.policy).toEqual({ decision: "send", reason: "auto_send" });
  });

  it("reports a failed step without throwing", async () => {
    const { db } = fakeDb();
    const failing: Classifier = {
      classify: async () => {
        throw new Error("Jev returned 503");
      },
    };
    const result = await previewMessage(
      { db, classifier: failing, llm: null },
      { tenant, text: "Hi", kind: "comment", businessContext: tenant.name },
    );
    expect(result.error).toEqual({ step: "classify", message: "Error: Jev returned 503" });
    expect(result.classification).toBeNull();
  });

  it("two variants side by side see the same message and can disagree", async () => {
    const { db } = fakeDb();
    const a = classifierReturning({ category: "faq", confidence: 0.9 });
    const b = classifierReturning({ category: "complaint", confidence: 0.8 });
    const input = {
      tenant,
      text: "Why is it closed?",
      kind: "comment" as const,
      stopAfter: "triage" as const,
    };
    const [ra, rb] = await Promise.all([
      previewMessage({ db, classifier: a, llm: null }, { ...input, businessContext: "Name only" }),
      previewMessage(
        { db, classifier: b, llm: null },
        { ...input, businessContext: "A café and bakery in Cubao." },
      ),
    ]);
    expect(ra.triage).toEqual({ decision: "draft" });
    expect(rb.triage).toEqual({ decision: "escalate", reason: "complaint" });
    expect(vi.mocked(b.classify).mock.calls[0][0]).toMatchObject({
      businessContext: "A café and bakery in Cubao.",
      itemId: null,
    });
  });
});

describe("collectUsage", () => {
  it("totals the run and passes records on with their source", async () => {
    const inner = memoryUsage();
    const usage = collectUsage(withUsageSource(inner, "lab"));
    const base = { tenantId: "t", purpose: "draft" as const, provider: "openrouter" };
    await usage.record({
      ...base,
      model: "m1",
      inputTokens: 100,
      outputTokens: 10,
      costUsd: 0.001,
    });
    await usage.record({ ...base, model: "m2", inputTokens: 50, outputTokens: 5, costUsd: 0.002 });
    expect(usage.totals()).toEqual({
      calls: 2,
      inputTokens: 150,
      outputTokens: 15,
      costUsd: 0.003,
      models: ["m1", "m2"],
    });
    expect(inner.records.every((r) => r.source === "lab")).toBe(true);
  });
});
