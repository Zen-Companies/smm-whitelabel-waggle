import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPolicyStep } from "@/features/approvals/policy-step";
import { createDraftStep } from "@/features/drafting/draft-step";
import { processDueItems } from "@/features/inbox/processor";
import { embedPendingEntries, EMBEDDING_DIMENSIONS } from "@/features/knowledge-base/embeddings";
import { createDeadline } from "@/lib/jobs";
import { createLlmClient } from "@/lib/llm/client";
import { loadTenantAiSpend } from "@/lib/llm/spend";
import { chatCompletion, embeddingResponse, fakeOpenRouter } from "@/lib/llm/test-utils";
import { createDbUsageRecorder } from "@/lib/llm/usage";
import { anonClient, claimFor, serviceClient, uniqueEmail } from "./helpers";

// docs/tasks.md T9: covered questions get drafts from the KB; uncovered ones set needsHuman.
// The LLM is faked (it returns what each test sets); retrieval, storage, grounding and policy are real.
function bagOfWords(text: string): number[] {
  const v = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  for (const w of text.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
    v[
      createHash("sha256").update(w.replace(/s$/, "")).digest().readUInt32BE(0) %
        EMBEDDING_DIMENSIONS
    ] += 1;
  }
  const n = Math.hypot(...v) || 1;
  return v.map((x) => x / n);
}

type Draft = {
  reply: string;
  needsHuman: boolean;
  reason: string | null;
  lead: Record<string, string | null> | null;
};
let nextDraft: Draft;
type Content = string | { type: string; text?: string }[];
const chatBodies: { messages: { role: string; content: Content }[] }[] = [];
const textOf = (c: Content | undefined) =>
  typeof c === "string" ? c : (c ?? []).map((p) => p.text ?? "").join("");
const { models } = fakeOpenRouter((url, body) => {
  if (url.endsWith("/embeddings")) {
    const input = Array.isArray(body.input) ? String(body.input[0]) : String(body.input);
    return embeddingResponse(bagOfWords(input));
  }
  chatBodies.push(body as (typeof chatBodies)[number]);
  return chatCompletion(nextDraft, { model: "openai/gpt-5", cost: 0.0004 });
});

const db = serviceClient();
const llm = createLlmClient({ models, usage: createDbUsageRecorder(db) });
const userIds: string[] = [];
let tenantId: string;
let accountId: string;
const kb: Record<string, string> = {};

const run = () =>
  processDueItems({
    db,
    steps: { classified: createDraftStep({ llm }), drafted: createPolicyStep() },
    deadline: createDeadline(),
    claim: claimFor(() => tenantId),
  });

async function classifiedItem(text: string, category = "faq", confidence = 0.95) {
  const id = randomUUID();
  const { error } = await db.from("inbound_items").insert({
    id,
    tenant_id: tenantId,
    social_account_id: accountId,
    kind: "dm",
    zernio_message_id: `m_${id}`,
    conversation_id: (await conversation()).id,
    text,
    received_at: new Date().toISOString(),
    status: "classified",
    category,
    confidence,
  });
  if (error) throw error;
  return id;
}

let conv: { id: string } | null = null;
async function conversation() {
  if (conv) return conv;
  const { data } = await db
    .from("conversations")
    .insert({
      tenant_id: tenantId,
      social_account_id: accountId,
      zernio_conversation_id: `conv_${randomUUID()}`,
      platform: "instagram",
      last_customer_message_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  conv = data!;
  return conv;
}

const statusOf = async (id: string) =>
  (await db.from("inbound_items").select("status").eq("id", id).single()).data?.status;
const draftsOf = async (id: string) =>
  (
    await db
      .from("drafts")
      .select("id, body, model, kb_entry_ids, needs_human, needs_human_reason, status")
      .eq("item_id", id)
  ).data ?? [];

beforeAll(async () => {
  const { data } = await anonClient().auth.signUp({
    email: uniqueEmail(),
    password: "password123",
  });
  userIds.push(data.user!.id);
  const { data: rows } = await db.rpc("create_owner_tenant", {
    p_user_id: data.user!.id,
    p_name: "Harbour Bean Test",
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
  for (const [key, title, content] of [
    ["hours", "Opening hours", "Monday to Friday 7am to 9pm, Saturday and Sunday 8am to 10pm."],
    ["menu", "Coffee menu and prices", "Cappuccino ₱160, iced Spanish latte ₱180. Oat milk +₱30."],
    [
      "corkage",
      "Outside food and corkage",
      "Bring your own birthday cake for a ₱300 cake corkage fee.",
    ],
    [
      "reservations",
      "Reservations",
      "Table reservations for groups of 6 or more, up to 2 weeks ahead.",
    ],
  ]) {
    const { data: e } = await db
      .from("kb_entries")
      .insert({ tenant_id: tenantId, title, content })
      .select("id")
      .single();
    kb[key] = e!.id;
  }
  await embedPendingEntries({ db, llm }, { tenantId });
});

afterAll(async () => {
  await db.from("tenants").delete().eq("id", tenantId);
  for (const id of userIds) await db.auth.admin.deleteUser(id);
});

describe("thread history (T30)", () => {
  it("a short follow-up gets the earlier messages as context and still finds its topic", async () => {
    const { data: c } = await db
      .from("conversations")
      .insert({
        tenant_id: tenantId,
        social_account_id: accountId,
        zernio_conversation_id: `conv_${randomUUID()}`,
        platform: "instagram",
        last_customer_message_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    const dm = async (text: string, status: string, agoMin: number) => {
      const id = randomUUID();
      const { error } = await db.from("inbound_items").insert({
        id,
        tenant_id: tenantId,
        social_account_id: accountId,
        kind: "dm",
        zernio_message_id: `m_${id}`,
        conversation_id: c!.id,
        text,
        received_at: new Date(Date.now() - agoMin * 60_000).toISOString(),
        status,
        category: "faq",
        confidence: 0.95,
      });
      if (error) throw error;
      return id;
    };
    const first = await dm("What are your opening hours on Saturday?", "sent", 10);
    await db.from("drafts").insert({
      tenant_id: tenantId,
      item_id: first,
      body: "Saturdays 8am to 10pm!",
      status: "sent",
      sent_at: new Date(Date.now() - 9 * 60_000).toISOString(),
    });
    const followUp = await dm("how about sunday?", "classified", 0);
    nextDraft = { reply: "Sundays too, 8am to 10pm!", needsHuman: false, reason: null, lead: null };

    await run();

    const user = textOf(chatBodies.at(-1)!.messages.find((m) => m.role === "user")?.content);
    expect(user).toContain(
      "<earlier>\nCustomer: What are your opening hours on Saturday?\nYou: Saturdays 8am to 10pm!\n</earlier>",
    );
    expect(user).toContain("<message>\nhow about sunday?\n</message>");
    const [draft] = await draftsOf(followUp);
    expect(draft.kb_entry_ids[0]).toBe(kb.hours);
    const { data: audit } = await db
      .from("audit_log")
      .select("details")
      .eq("item_id", followUp)
      .eq("action", "draft_created")
      .single();
    expect(audit?.details).toMatchObject({ historyMessages: 2 });
    expect((audit?.details as { kbSimilarities: number[] }).kbSimilarities[0]).toBeGreaterThan(
      0.25,
    );
  });
});

describe("draft step", () => {
  it("a covered question gets a KB-grounded draft and waits for approval", async () => {
    nextDraft = {
      reply: "We're open 8am to 10pm on Sundays. See you!",
      needsHuman: false,
      reason: null,
      lead: null,
    };
    const id = await classifiedItem("What are your opening hours on Sunday?");

    await run();

    expect(await statusOf(id)).toBe("awaiting_approval");
    const [draft] = await draftsOf(id);
    expect(draft).toMatchObject({
      body: "We're open 8am to 10pm on Sundays. See you!",
      model: "openai/gpt-5",
      needs_human: false,
      needs_human_reason: null,
      status: "pending",
    });
    expect(draft.kb_entry_ids[0]).toBe(kb.hours);

    // The prompt carries the retrieved facts and the fenced message, and the rules.
    const sent = chatBodies.at(-1)!.messages;
    expect(textOf(sent.find((m) => m.role === "system")?.content)).toContain(
      "Use ONLY the facts under BUSINESS INFO",
    );
    const user = textOf(sent.find((m) => m.role === "user")?.content);
    expect(user).toContain("[1] Opening hours: Monday to Friday");
    expect(user).toContain("<message>\nWhat are your opening hours on Sunday?\n</message>");

    const { data: usage } = await db.from("ai_usage").select("purpose").eq("item_id", id);
    expect(usage?.map((u) => u.purpose).sort()).toEqual(["draft", "embed"]);
    const { data: audit } = await db
      .from("audit_log")
      .select("details")
      .eq("item_id", id)
      .eq("action", "draft_created")
      .single();
    expect(audit?.details).toMatchObject({
      draftId: draft.id,
      needsHuman: false,
      promptVersion: expect.any(String),
    });
  });

  it("an uncovered question: needsHuman, holding reply, escalated by policy", async () => {
    nextDraft = {
      reply: "Good question! Our team will get back to you shortly.",
      needsHuman: true,
      reason: "Halal certification is not in the business info",
      lead: null,
    };
    const id = await classifiedItem("Is your kitchen halal certified?");

    await run();

    expect(await statusOf(id)).toBe("escalated");
    const [draft] = await draftsOf(id);
    expect(draft).toMatchObject({
      needs_human: true,
      needs_human_reason: "Halal certification is not in the business info",
    });
  });

  it("a price the KB doesn't contain forces needsHuman even if the model said it was fine", async () => {
    nextDraft = { reply: "A cappuccino is ₱150.", needsHuman: false, reason: null, lead: null };
    const id = await classifiedItem("How much is a cappuccino?");

    await run();

    expect(await statusOf(id)).toBe("escalated");
    const [draft] = await draftsOf(id);
    expect(draft.needs_human).toBe(true);
    expect(draft.needs_human_reason).toContain("ungrounded_amount");
  });

  it("a lead: the lead is stored once and the draft waits for approval", async () => {
    nextDraft = {
      reply: "Thanks Carlo! We'll check Saturday 7pm for 8 and our team will confirm by DM.",
      needsHuman: false,
      reason: null,
      lead: { name: "Carlo", contact: "0917 555 0101", request: "Table for 8, Saturday 7pm" },
    };
    const id = await classifiedItem(
      "Can I reserve a table for 8 on Saturday at 7pm? Carlo, 0917 555 0101",
      "lead",
    );

    await run();

    expect(await statusOf(id)).toBe("awaiting_approval");
    const { data: leads } = await db
      .from("leads")
      .select("name, contact, request")
      .eq("item_id", id);
    expect(leads).toEqual([
      { name: "Carlo", contact: "0917 555 0101", request: "Table for 8, Saturday 7pm" },
    ]);
    const { count } = await db
      .from("audit_log")
      .select("*", { count: "exact", head: true })
      .eq("item_id", id)
      .eq("action", "lead_captured");
    expect(count).toBe(1);
  });

  it.each([
    ["spam", "ignored"],
    ["complaint", "escalated"],
    ["unclear", "escalated"],
  ])("%s is %s without calling the LLM", async (category, status) => {
    const before = chatBodies.length;
    const id = await classifiedItem("whatever", category);
    await run();
    expect(await statusOf(id)).toBe(status);
    expect(chatBodies.length).toBe(before);
    expect(await draftsOf(id)).toEqual([]);
  });

  it("low confidence skips drafting and escalates", async () => {
    const before = chatBodies.length;
    const id = await classifiedItem("open sunday?", "faq", 0.6);
    await run();
    expect(await statusOf(id)).toBe("escalated");
    expect(chatBodies.length).toBe(before);
  });

  it("a retry after a crash reuses the stored draft instead of drafting again", async () => {
    const id = await classifiedItem("Can I bring my own cake?");
    await db.from("drafts").insert({
      tenant_id: tenantId,
      item_id: id,
      body: "Yes, for a ₱300 corkage fee.",
      model: "openai/gpt-5",
    });
    const before = chatBodies.length;

    await run();

    expect(chatBodies.length).toBe(before);
    expect(await draftsOf(id)).toHaveLength(1);
    expect(await statusOf(id)).toBe("awaiting_approval");
  });
});

describe("monthly AI spend cap (T32)", () => {
  afterAll(async () => {
    await db.from("tenants").update({ ai_monthly_cap_usd: null }).eq("id", tenantId);
    await db.from("ai_usage").delete().eq("tenant_id", tenantId).eq("model", "cap-test");
  });

  const usage = (costUsd: number, source: "live" | "practice" | "lab", createdAt?: string) => ({
    tenant_id: tenantId,
    purpose: "draft",
    provider: "openrouter",
    model: "cap-test",
    input_tokens: 0,
    output_tokens: 0,
    cost_usd: costUsd,
    source,
    // Every row names it: a multi-row insert sets a missing column to null.
    created_at: createdAt ?? new Date().toISOString(),
  });

  it("counts live and practice calls this month, not lab calls or last month", async () => {
    const { error } = await db
      .from("ai_usage")
      .insert([
        usage(3, "live"),
        usage(2, "practice"),
        usage(100, "lab"),
        usage(50, "live", "2020-01-15T00:00:00Z"),
      ]);
    expect(error).toBeNull();
    const spend = await loadTenantAiSpend(db, tenantId, new Date());
    expect(spend.spentUsd).toBeGreaterThanOrEqual(5);
    expect(spend.spentUsd).toBeLessThan(50);
  });

  it("at the cap: still sorted, but no draft and no AI call; it goes to the owner", async () => {
    await db.from("tenants").update({ ai_monthly_cap_usd: 5 }).eq("id", tenantId);
    const before = chatBodies.length;
    const id = await classifiedItem("What time do you open on Saturday?");

    await run();

    expect(chatBodies.length).toBe(before);
    expect(await draftsOf(id)).toEqual([]);
    expect(await statusOf(id)).toBe("escalated");
    const { data: audit } = await db
      .from("audit_log")
      .select("details")
      .eq("item_id", id)
      .eq("action", "status_changed")
      .eq("details->>to", "escalated")
      .single();
    expect(audit?.details).toMatchObject({ policyReason: "ai_cap_reached", drafted: false });
  });

  it("under the cap, drafting goes on as usual", async () => {
    await db.from("tenants").update({ ai_monthly_cap_usd: 1000 }).eq("id", tenantId);
    const id = await classifiedItem("What time do you open on Saturday?");
    await run();
    expect(await draftsOf(id)).toHaveLength(1);
  });
});
