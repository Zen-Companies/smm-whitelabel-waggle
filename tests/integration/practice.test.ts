import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { collectUsage, previewMessage } from "@/features/lab/engine";
import { PRACTICE_DAILY_LIMIT } from "@/features/lab/practice-copy";
import { practiceTriesLeft } from "@/features/lab/practice-limit";
import { loadTenantSnapshot } from "@/features/lab/run";
import type { Classifier } from "@/lib/classifier/types";
import { createLlmClient } from "@/lib/llm/client";
import { chatCompletion, embeddingResponse, fakeOpenRouter } from "@/lib/llm/test-utils";
import { createDbUsageRecorder, withUsageSource } from "@/lib/llm/usage";
import { anonClient, serviceClient, uniqueEmail } from "./helpers";

// T26: the owner's practice box writes nothing to the inbox (only ai_usage, tagged practice), and
// the daily try limit holds. AI calls are faked.
const db = serviceClient();
let tenantId: string;
let userId: string;

beforeAll(async () => {
  const { data } = await anonClient().auth.signUp({
    email: uniqueEmail(),
    password: "password123",
  });
  userId = data.user!.id;
  const { data: rows } = await db.rpc("create_owner_tenant", {
    p_user_id: userId,
    p_name: "Practice Presets",
  });
  tenantId = rows![0].tenant_id;
  await db.from("kb_entries").insert({
    tenant_id: tenantId,
    title: "Prices",
    content: "The preset pack is 499 pesos.",
    embedding: `[${Array(1536).fill(0.01).join(",")}]`,
  });
});

afterAll(async () => {
  await db.from("tenants").delete().eq("id", tenantId);
  await db.auth.admin.deleteUser(userId);
});

const count = async (table: "inbound_items" | "drafts" | "leads" | "audit_log") =>
  (await db.from(table).select("id", { count: "exact", head: true }).eq("tenant_id", tenantId))
    .count;

describe("practice", () => {
  it("a full run reaches a reply and writes only practice-tagged ai_usage", async () => {
    const before = await Promise.all(
      (["inbound_items", "drafts", "leads", "audit_log"] as const).map(count),
    );
    const { models } = fakeOpenRouter((url) =>
      url.includes("/embeddings")
        ? embeddingResponse(Array(1536).fill(0.01))
        : chatCompletion({
            reply: "The preset pack is ₱499!",
            needsHuman: false,
            reason: null,
            lead: null,
          }),
    );
    const usage = collectUsage(withUsageSource(createDbUsageRecorder(db), "practice"));
    const classifier: Classifier = {
      classify: async () => ({
        category: "faq",
        confidence: 0.95,
        provider: "jev",
        model: "jevos-v5",
      }),
    };

    const result = await previewMessage(
      { db, classifier, llm: createLlmClient({ models, usage }) },
      {
        tenant: await loadTenantSnapshot(db, tenantId),
        text: "How much is the preset pack?",
        kind: "comment",
        businessContext: "Practice Presets",
      },
    );

    expect(result.draft?.reply).toBe("The preset pack is ₱499!");
    expect(result.facts?.map((f) => f.title)).toEqual(["Prices"]);
    expect(result.groundingIssues).toEqual([]);
    expect(result.policy).toEqual({ decision: "approve", reason: "approval_required" });

    const after = await Promise.all(
      (["inbound_items", "drafts", "leads", "audit_log"] as const).map(count),
    );
    expect(after).toEqual(before);
    const { data: rows } = await db
      .from("ai_usage")
      .select("source, purpose")
      .eq("tenant_id", tenantId);
    expect(rows?.map((r) => r.source)).toEqual(["practice", "practice"]);
  });

  it("the daily limit counts the owner's tries, not the operator's Lab runs", async () => {
    expect(await practiceTriesLeft(db, tenantId)).toBe(PRACTICE_DAILY_LIMIT);
    const row = { tenant_id: tenantId, kind: "comment", text: "hi", results: {} };
    await db.from("lab_runs").insert({ ...row, origin: "operator" });
    await db
      .from("lab_runs")
      .insert(Array.from({ length: PRACTICE_DAILY_LIMIT }, () => ({ ...row, origin: "owner" })));
    expect(await practiceTriesLeft(db, tenantId)).toBe(0);
  });
});
