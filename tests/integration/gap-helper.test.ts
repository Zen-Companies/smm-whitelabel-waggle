import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BLANK, GAP_HELPER_DAILY_LIMIT } from "@/features/knowledge-base/gap-helper";
import { requestSuggestions } from "@/features/knowledge-base/gap-run";
import { createLlmClient } from "@/lib/llm/client";
import { chatCompletion, fakeOpenRouter, toolCallCompletion } from "@/lib/llm/test-utils";
import { createDbUsageRecorder } from "@/lib/llm/usage";
import { anonClient, serviceClient, uniqueEmail } from "./helpers";

// T33: the gap helper end to end against local Supabase, with a fake OpenRouter (rule 14).

const db = serviceClient();
const userIds: string[] = [];
let tenantId: string;
let accountId: string;
const questionIds: string[] = [];

type Message = { role: string; content: unknown };

// Step 1 asks for the questions; step 2 groups whatever ids came back. The second suggestion
// slips in a price, which the clean-up must turn into a blank.
let wording = `Parking: ${BLANK}.`;
const { fetchMock, models } = fakeOpenRouter((_url, body) => {
  const messages = (body.messages ?? []) as Message[];
  const toolResult = messages.find((m) => m.role === "tool");
  if (!toolResult) {
    return toolCallCompletion([{ name: "list_unanswered_questions", args: {} }], { cost: 0.001 });
  }
  const ids = [...JSON.stringify(toolResult.content).matchAll(/[0-9a-f-]{36}/g)].map((m) => m[0]);
  return chatCompletion(
    {
      suggestions: [
        { title: "Parking", questionIds: ids.slice(0, 2), wording },
        { title: "Gift cards", questionIds: ids.slice(2), wording: "Gift cards cost ₱500." },
      ],
    },
    { model: "openai/gpt-5", cost: 0.002 },
  );
});
const llm = createLlmClient({ models, usage: createDbUsageRecorder(db) });
const run = () =>
  requestSuggestions({ db, llm }, { tenantId, businessName: "Gap Test Café", actor: userIds[0] });

async function unanswered(text: string) {
  const id = randomUUID();
  const { error: itemError } = await db.from("inbound_items").insert({
    id,
    tenant_id: tenantId,
    social_account_id: accountId,
    kind: "comment",
    zernio_comment_id: `c_${id}`,
    zernio_post_id: "post_1",
    text,
    received_at: new Date().toISOString(),
    status: "escalated",
    category: "faq",
    confidence: 0.9,
  });
  if (itemError) throw itemError;
  const { error: draftError } = await db.from("drafts").insert({
    tenant_id: tenantId,
    item_id: id,
    body: "Let me check with the team!",
    model: "openai/gpt-5",
    needs_human: true,
  });
  if (draftError) throw draftError;
  questionIds.push(id);
}

beforeAll(async () => {
  const { data } = await anonClient().auth.signUp({
    email: uniqueEmail(),
    password: "password123",
  });
  userIds.push(data.user!.id);
  const { data: rows } = await db.rpc("create_owner_tenant", {
    p_user_id: data.user!.id,
    p_name: "Gap Test Café",
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

afterAll(async () => {
  await db.from("tenants").delete().eq("id", tenantId);
  for (const id of userIds) await db.auth.admin.deleteUser(id);
});

describe("gap helper (T33)", () => {
  it("needs a few questions before it runs (no AI call)", async () => {
    await unanswered("Where can I park?");
    expect(await run()).toEqual({ ok: false, reason: "too_few_questions" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("groups the questions into pending suggestions, with blanks and never a fact", async () => {
    await unanswered("Is there parking nearby?");
    await unanswered("Do you sell gift cards?");

    expect(await run()).toEqual({ ok: true, added: 2 });

    const { data: suggestions } = await db
      .from("kb_suggestions")
      .select("title, content, item_ids, status")
      .eq("tenant_id", tenantId)
      .order("title");
    // The price the model slipped into "Gift cards" became a blank.
    expect(suggestions!.map(({ title, content, status }) => ({ title, content, status }))).toEqual([
      { title: "Gift cards", content: BLANK, status: "pending" },
      { title: "Parking", content: `Parking: ${BLANK}.`, status: "pending" },
    ]);
    // Every question is covered once, by one suggestion.
    expect(suggestions!.flatMap((s) => s.item_ids).sort()).toEqual([...questionIds].sort());

    // One ai_usage row per model call, as the business's own (live) spend.
    const { data: usage } = await db
      .from("ai_usage")
      .select("purpose, source, cost_usd")
      .eq("tenant_id", tenantId)
      .order("cost_usd"); // both rows can share a timestamp
    expect(usage).toEqual([
      { purpose: "agent", source: "live", cost_usd: 0.001 },
      { purpose: "agent", source: "live", cost_usd: 0.002 },
    ]);

    // Audited with counts, never text.
    const { data: audit } = await db
      .from("audit_log")
      .select("details")
      .eq("tenant_id", tenantId)
      .eq("action", "kb_suggestions_requested")
      .single();
    expect(audit?.details).toMatchObject({ questions: 3, suggestions: 2, steps: 2 });
    expect(JSON.stringify(audit?.details)).not.toContain("park");
  });

  it("questions a pending suggestion already covers aren't sent again", async () => {
    const calls = fetchMock.mock.calls.length;
    expect(await run()).toEqual({ ok: false, reason: "too_few_questions" });
    expect(fetchMock.mock.calls.length).toBe(calls);
  });

  it("stops at the daily limit", async () => {
    await unanswered("Can I bring my dog?");
    await unanswered("Are pets allowed?");
    wording = `Pets: ${BLANK}.`;
    for (let i = 1; i < GAP_HELPER_DAILY_LIMIT; i++) {
      await db.from("audit_log").insert({
        tenant_id: tenantId,
        action: "kb_suggestions_requested",
        actor: "test",
        details: {},
      });
    }
    expect(await run()).toEqual({ ok: false, reason: "daily_limit" });
  });

  it("respects the monthly AI cap", async () => {
    await db
      .from("audit_log")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("action", "kb_suggestions_requested");
    await db.from("tenants").update({ ai_monthly_cap_usd: 0 }).eq("id", tenantId);
    expect(await run()).toEqual({ ok: false, reason: "ai_cap_reached" });
    await db.from("tenants").update({ ai_monthly_cap_usd: null }).eq("id", tenantId);
  });
});
