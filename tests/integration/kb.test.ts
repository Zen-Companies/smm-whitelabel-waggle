import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  embedEntry,
  embedPendingEntries,
  EMBEDDING_DIMENSIONS,
} from "@/features/knowledge-base/embeddings";
import { retrieveKbEntries } from "@/features/knowledge-base/retrieval";
import { createLlmClient } from "@/lib/llm/client";
import { embeddingResponse, fakeOpenRouter } from "@/lib/llm/test-utils";
import { createDbUsageRecorder } from "@/lib/llm/usage";
import { anonClient, serviceClient, uniqueEmail } from "./helpers";

// docs/tasks.md T8: retrieval returns the right entry for sample questions. Real pipeline
// (LLM client → OpenRouter HTTP → pgvector), with OpenRouter faked by a deterministic
// bag-of-words embedding: this checks retrieval plumbing, not model quality.
const STOP = new Set(
  "a an and are at can do does for how i is it me of on or the to we what when where you your".split(
    " ",
  ),
);
function bagOfWords(text: string): number[] {
  const v = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  for (const word of text.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
    if (STOP.has(word)) continue;
    const stem = word.replace(/(ing|es|s)$/, "");
    v[createHash("sha256").update(stem).digest().readUInt32BE(0) % EMBEDDING_DIMENSIONS] += 1;
  }
  const norm = Math.hypot(...v) || 1;
  return v.map((x) => x / norm);
}

const db = serviceClient();
const { fetchMock, models } = fakeOpenRouter((_url, body) => {
  const input = Array.isArray(body.input) ? String(body.input[0]) : String(body.input);
  return embeddingResponse(bagOfWords(input), { cost: 0.000001, tokens: 10 });
});
const llm = createLlmClient({ models, usage: createDbUsageRecorder(db) });
const deps = { db, llm };

const userIds: string[] = [];
let tenantId: string;
let otherTenantId: string;
const ids: Record<string, string> = {};

const KB = {
  hours: [
    "Opening hours",
    "We open Monday to Friday 7am-6pm, Saturday and Sunday 8am-4pm. Closed on public holidays.",
  ],
  location: [
    "Location and parking",
    "12 Harbour Street, next to the ferry terminal. Free parking behind the shop.",
  ],
  catering: [
    "Catering",
    "We cater events and parties of 10-60 people. Ask for a catering quote by DM.",
  ],
  menu: [
    "Menu and prices",
    "Coffee from $4, croissants $3.50, sandwiches $9. Oat and almond milk available.",
  ],
  dietary: [
    "Dietary options",
    "Gluten-free bread and vegan pastries every day. Tell us about allergies.",
  ],
  pets: ["Pets", "Dogs are welcome on the outdoor terrace. Water bowls provided."],
  wifi: ["Wi-Fi", "Free Wi-Fi for customers, password on your receipt."],
};

async function tenantWithUser(name: string) {
  const { data } = await anonClient().auth.signUp({
    email: uniqueEmail(),
    password: "password123",
  });
  userIds.push(data.user!.id);
  const { data: rows } = await db.rpc("create_owner_tenant", {
    p_user_id: data.user!.id,
    p_name: name,
  });
  return rows![0].tenant_id;
}

const embeddingOf = async (id: string) =>
  (await db.from("kb_entries").select("embedding").eq("id", id).single()).data?.embedding ?? null;

beforeAll(async () => {
  tenantId = await tenantWithUser("KB Cafe");
  otherTenantId = await tenantWithUser("Other KB Cafe");
  for (const [key, [title, content]] of Object.entries(KB)) {
    const { data } = await db
      .from("kb_entries")
      .insert({ tenant_id: tenantId, title, content })
      .select("id")
      .single();
    ids[key] = data!.id;
  }
  // Another tenant's entry that matches "opening hours" perfectly: must never be returned.
  await db.from("kb_entries").insert({
    tenant_id: otherTenantId,
    title: "Opening hours",
    content: "We open Monday to Friday 7am-6pm, Saturday and Sunday 8am-4pm.",
  });
});

afterAll(async () => {
  await db.from("tenants").delete().in("id", [tenantId, otherTenantId]);
  for (const id of userIds) await db.auth.admin.deleteUser(id);
});

describe("knowledge base embeddings + retrieval", () => {
  it("the sweep embeds every entry without one and records ai_usage per call", async () => {
    let total = 0;
    for (;;) {
      const { embedded, failed } = await embedPendingEntries(deps, { limit: 20, tenantId });
      expect(failed).toBe(0);
      total += embedded;
      if (embedded === 0) break;
    }
    expect(total).toBe(Object.keys(KB).length);
    for (const id of Object.values(ids)) expect(await embeddingOf(id)).not.toBeNull();

    const { count } = await db
      .from("ai_usage")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("purpose", "embed");
    expect(count).toBe(Object.keys(KB).length);
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://openrouter.ai/api/v1/embeddings");
  });

  it.each([
    ["What time do you open on Saturday?", "hours"],
    ["Are you open on Sunday morning?", "hours"],
    ["Where are you? Is there parking?", "location"],
    ["Can you cater a party for 40 people?", "catering"],
    ["How much is a coffee and a croissant?", "menu"],
    ["Do you have gluten-free or vegan options?", "dietary"],
    ["Can I bring my dog?", "pets"],
    ["Is there free wifi?", "wifi"],
  ])("%s → %s", async (question, expected) => {
    // Ranking only: the fake bag-of-words embeddings score low, so the relevance floor (T31,
    // unit-tested in retrieval.test.ts) is turned off here.
    const matches = await retrieveKbEntries(deps, { tenantId, query: question, minSimilarity: 0 });
    expect(matches[0].id).toBe(ids[expected]);
    expect(matches[0].similarity).toBeGreaterThan(matches[1]?.similarity ?? -1);
  });

  it("returns at most the top 5, best first, from this tenant only", async () => {
    const matches = await retrieveKbEntries(deps, {
      tenantId,
      query: "opening hours coffee parking dog wifi catering vegan",
      minSimilarity: 0,
    });
    expect(matches).toHaveLength(5);
    const sims = matches.map((m) => m.similarity);
    expect([...sims].sort((a, b) => b - a)).toEqual(sims);
    const { data: own } = await db.from("kb_entries").select("id").eq("tenant_id", tenantId);
    const ownIds = new Set((own ?? []).map((r) => r.id));
    for (const m of matches) expect(ownIds.has(m.id)).toBe(true);
  });

  it("the query embedding is recorded against the item", async () => {
    const itemFree = randomUUID();
    await retrieveKbEntries(deps, { tenantId, query: "wifi password", itemId: null });
    const { data } = await db
      .from("ai_usage")
      .select("purpose, provider, model, input_tokens, cost_usd")
      .eq("tenant_id", tenantId)
      .eq("purpose", "embed")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    expect(data).toMatchObject({
      provider: "openrouter",
      model: "openai/text-embedding-3-small",
      input_tokens: 10,
    });
    expect(Number(data!.cost_usd)).toBeCloseTo(0.000001);
    expect(itemFree).toBeTruthy();
  });

  it("editing an entry clears its embedding; the sweep re-embeds the new text", async () => {
    await db
      .from("kb_entries")
      .update({ content: "Now open until 9pm on Fridays. Monday to Thursday 7am-6pm." })
      .eq("id", ids.hours);
    expect(await embeddingOf(ids.hours)).toBeNull();
    // Not searchable while pending.
    const pending = await retrieveKbEntries(deps, {
      tenantId,
      query: "open Friday 9pm",
      minSimilarity: 0,
    });
    expect(pending.map((m) => m.id)).not.toContain(ids.hours);

    await embedPendingEntries(deps, { tenantId });
    const matches = await retrieveKbEntries(deps, {
      tenantId,
      query: "open Friday 9pm",
      minSimilarity: 0,
    });
    expect(matches[0].id).toBe(ids.hours);
  });

  it("an embedding computed for old text is never stored on newer text", async () => {
    // The entry changes while its embedding is being computed.
    const slowLlm = {
      ...llm,
      async embed(input: Parameters<typeof llm.embed>[0]) {
        const result = await llm.embed(input);
        await db.from("kb_entries").update({ content: "Changed mid-flight." }).eq("id", ids.wifi);
        return result;
      },
    };
    await db.from("kb_entries").update({ embedding: null }).eq("id", ids.wifi);

    await expect(embedEntry({ db, llm: slowLlm }, ids.wifi)).resolves.toBe("stale");
    expect(await embeddingOf(ids.wifi)).toBeNull();
    await expect(embedEntry(deps, ids.wifi)).resolves.toBe("embedded");
  });

  it("an empty question retrieves nothing without calling the API", async () => {
    const before = fetchMock.mock.calls.length;
    expect(await retrieveKbEntries(deps, { tenantId, query: "   " })).toEqual([]);
    expect(fetchMock.mock.calls.length).toBe(before);
  });
});
