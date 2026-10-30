import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { processDueItems } from "@/features/inbox/processor";
import { createClassifyStep } from "@/features/triage/classify-step";
import { FallbackClassifier } from "@/lib/classifier/fallback";
import { JevClassifier } from "@/lib/classifier/jev";
import { LlmClassifier } from "@/lib/classifier/llm";
import { createDeadline } from "@/lib/jobs";
import { createLlmClient } from "@/lib/llm/client";
import { chatCompletion, fakeOpenRouter } from "@/lib/llm/test-utils";
import { createDbUsageRecorder } from "@/lib/llm/usage";
import { anonClient, claimFor, serviceClient, uniqueEmail } from "./helpers";

// docs/tasks.md T7: every item gets a category; a forced Jev failure uses the LLM.
const db = serviceClient();
const usage = createDbUsageRecorder(db);
const userIds: string[] = [];
let tenantId: string;
let accountId: string;

type JevMode = "ok" | "down" | "slow" | "invalid";
let jevMode: JevMode = "ok";
let jevScores = { complaint: 0.02, lead: 0.1, faq: 0.96, spam: 0.01 };
let lastJevState: { business?: string } | undefined;
const jevFetch: typeof fetch = async (_url, init) => {
  lastJevState = JSON.parse(String(init?.body)).state;
  if (jevMode === "down") return new Response("upstream error", { status: 503 });
  if (jevMode === "slow") {
    await new Promise((resolve, reject) => {
      const t = setTimeout(resolve, 10_000);
      init?.signal?.addEventListener("abort", () => {
        clearTimeout(t);
        reject(new DOMException("aborted", "AbortError"));
      });
    });
  }
  const answers =
    jevMode === "invalid"
      ? { faq: { type: "noul", noul: 0.9 } }
      : Object.fromEntries(
          Object.entries(jevScores).map(([k, v]) => [k, { type: "noul", noul: v }]),
        );
  return Response.json({
    model: "jevos-v5",
    answers,
    usage: { input_tokens: 120, output_tokens: 4 },
  });
};

let llmAnswer = { category: "lead", confidence: 0.91 };
let llmDown = false;
const { models, fetchMock: llmFetch } = fakeOpenRouter(() =>
  llmDown ? new Response("down", { status: 500 }) : chatCompletion(llmAnswer, { cost: 0.00002 }),
);

const classifier = new FallbackClassifier(
  new JevClassifier(
    { url: "https://jev.test/v1/systemone", model: "jev-latest", costPerMTokInput: 0.042 },
    { usage, fetch: jevFetch },
  ),
  new LlmClassifier(createLlmClient({ models, usage })),
  { timeoutMs: 200 },
);

const run = () =>
  processDueItems({
    db,
    steps: { new: createClassifyStep({ classifier }) },
    deadline: createDeadline(),
    claim: claimFor(() => tenantId),
  });

async function seed(text: string) {
  const id = randomUUID();
  const { error } = await db.from("inbound_items").insert({
    id,
    tenant_id: tenantId,
    social_account_id: accountId,
    kind: "comment",
    zernio_comment_id: `c_${id}`,
    text,
    received_at: new Date().toISOString(),
  });
  if (error) throw error;
  return id;
}

const item = async (id: string) =>
  (
    await db
      .from("inbound_items")
      .select("status, category, confidence, classifier_used, classifier_scores")
      .eq("id", id)
      .single()
  ).data!;

beforeAll(async () => {
  const { data } = await anonClient().auth.signUp({
    email: uniqueEmail(),
    password: "password123",
  });
  userIds.push(data.user!.id);
  const { data: rows } = await db.rpc("create_owner_tenant", {
    p_user_id: data.user!.id,
    p_name: "Triage Cafe",
  });
  tenantId = rows![0].tenant_id;
  const { data: account } = await db
    .from("social_accounts")
    .insert({
      tenant_id: tenantId,
      zernio_account_id: `acc_${randomUUID().slice(0, 8)}`,
      platform: "instagram",
    })
    .select("id")
    .single();
  accountId = account!.id;
});

beforeEach(() => {
  jevMode = "ok";
  llmDown = false;
  jevScores = { complaint: 0.02, lead: 0.1, faq: 0.96, spam: 0.01 };
});

afterAll(async () => {
  await db.from("tenants").delete().eq("id", tenantId);
  for (const id of userIds) await db.auth.admin.deleteUser(id);
});

describe("classify step", () => {
  it("sends the owner's business profile and records which context was used (T25)", async () => {
    const statusAudit = async (id: string) =>
      (
        await db
          .from("audit_log")
          .select("details")
          .eq("item_id", id)
          .eq("action", "status_changed")
          .single()
      ).data?.details as Record<string, unknown>;

    const before = await seed("Do you deliver?");
    await run();
    expect(lastJevState?.business).toBe("Triage Cafe");
    expect(await statusAudit(before)).toMatchObject({ businessContext: "name" });

    await db
      .from("tenants")
      .update({ business_profile: "Sells custom cakes, ordered by DM." })
      .eq("id", tenantId);
    const after = await seed("Do you deliver?");
    await run();
    expect(lastJevState?.business).toBe("Triage Cafe. Sells custom cakes, ordered by DM.");
    const details = await statusAudit(after);
    expect(details).toMatchObject({ businessContext: "profile" });
    expect(typeof details.profileUpdatedAt).toBe("string");
    await db.from("tenants").update({ business_profile: "" }).eq("id", tenantId);
  });

  it("Jev answers: category, confidence, scores and classifier_used are stored", async () => {
    const id = await seed("What time do you open on Sunday?");
    await run();
    const row = await item(id);
    expect(row).toMatchObject({ status: "classified", category: "faq", classifier_used: "jev" });
    expect(Number(row.confidence)).toBeCloseTo(0.96 * 0.98 * 0.9, 3);
    expect(row.classifier_scores).toEqual(jevScores);

    const { data: usageRows } = await db
      .from("ai_usage")
      .select("provider, model, cost_usd")
      .eq("item_id", id);
    expect(usageRows).toEqual([
      { provider: "jev", model: "jevos-v5", cost_usd: expect.any(Number) },
    ]);
  });

  it.each<[JevMode, string]>([
    ["down", "http"],
    ["slow", "timeout"],
    ["invalid", "invalid_output"],
  ])(
    "forced Jev failure (%s) → the LLM classifies it and the reason is audited",
    async (mode, reason) => {
      jevMode = mode;
      llmAnswer = { category: "lead", confidence: 0.91 };
      const id = await seed("Can I book a table for six on Friday at 7?");

      await run();

      const row = await item(id);
      expect(row).toMatchObject({
        status: "classified",
        category: "lead",
        classifier_used: "llm",
        classifier_scores: null,
      });
      const { data: audit } = await db
        .from("audit_log")
        .select("action, details")
        .eq("item_id", id)
        .in("action", ["classifier_fallback", "status_changed"])
        .order("created_at");
      expect(audit?.find((a) => a.action === "classifier_fallback")?.details).toMatchObject({
        reason,
        used: "llm",
      });
      expect(audit?.find((a) => a.action === "status_changed")?.details).toMatchObject({
        fallbackReason: reason,
        classifierUsed: "llm",
      });
    },
  );

  it("every item gets exactly one category, unclear when nothing applies", async () => {
    jevScores = { complaint: 0.05, lead: 0.05, faq: 0.1, spam: 0.2 };
    const ids = await Promise.all(["❤️❤️", "ok", "Tagging my sister haha"].map(seed));
    await run();
    for (const id of ids) {
      const row = await item(id);
      expect(row.status).toBe("classified");
      expect(row.category).toBe("unclear");
    }
  });

  it("if Jev and the LLM both fail, the item retries instead of guessing", async () => {
    jevMode = "down";
    const before = llmFetch.mock.calls.length;
    // Down for every attempt (the AI SDK retries a 500 twice by itself).
    llmDown = true;
    const id = await seed("Do you have oat milk?");

    await run();

    const { data } = await db
      .from("inbound_items")
      .select("status, category, attempts")
      .eq("id", id)
      .single();
    expect(data).toEqual({ status: "new", category: null, attempts: 1 });
    expect(llmFetch.mock.calls.length).toBeGreaterThan(before);
  });
});
