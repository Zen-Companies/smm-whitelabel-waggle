import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { recentMessagesFor } from "@/features/lab/recent-messages";
import type { VariantRun } from "@/features/lab/run";
import { currentVariant } from "@/features/lab/variants";
import { anonClient, serviceClient, uniqueEmail } from "./helpers";

// T36 item 3: "Your recent messages" reads real messages, runs them through today's setup (faked
// here) and stores the tries, but never changes an item or a draft.
const db = serviceClient();
let tenantId: string;
let userId: string;
let accountId: string;
const ids: string[] = [];

async function item(text: string, status: string, receivedAgoMin: number) {
  const id = randomUUID();
  const { error } = await db.from("inbound_items").insert({
    id,
    tenant_id: tenantId,
    social_account_id: accountId,
    kind: "comment",
    zernio_comment_id: `c_${id}`,
    author_name: `Customer ${ids.length + 1}`,
    text,
    received_at: new Date(Date.now() - receivedAgoMin * 60_000).toISOString(),
    status,
    category: "faq",
    confidence: 0.9,
  });
  if (error) throw error;
  ids.push(id);
  return id;
}

const snapshot = async () => ({
  items: (
    await db
      .from("inbound_items")
      .select("id, status, attempts, next_run_at")
      .in("id", ids)
      .order("id")
  ).data,
  drafts: (
    await db
      .from("drafts")
      .select("id, status, edited_body, sent_at")
      .in("item_id", ids)
      .order("id")
  ).data,
});

beforeAll(async () => {
  const { data } = await anonClient().auth.signUp({
    email: uniqueEmail(),
    password: "password123",
  });
  userId = data.user!.id;
  const { data: rows } = await db.rpc("create_owner_tenant", {
    p_user_id: userId,
    p_name: "Recent Cafe",
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

  const sent = await item("Open on Sunday?", "sent", 30);
  await db.from("drafts").insert({
    tenant_id: tenantId,
    item_id: sent,
    body: "8 to 4!",
    edited_body: "We're open 8am to 4pm!",
    status: "sent",
    decided_by: userId,
  });
  await item("Is your kitchen halal?", "escalated", 10);
});

afterAll(async () => {
  await db.from("tenants").delete().eq("id", tenantId);
  await db.auth.admin.deleteUser(userId);
});

describe("recentMessagesFor", () => {
  it("tries the last messages, says what happened then, and changes nothing", async () => {
    const before = await snapshot();
    const fakeRun = async (): Promise<VariantRun> => ({
      variant: currentVariant(),
      usage: { calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, models: [] },
      totalMs: 1,
      result: {
        classification: { category: "faq", confidence: 0.9, provider: "jev", model: "fake" },
        triage: { decision: "draft" },
        facts: [{ id: "kb", title: "Opening hours", similarity: 0.8 }],
        draft: { reply: "We're open 8am to 4pm!", needsHuman: false },
        groundingIssues: [],
        policy: { decision: "approve", reason: "approval_required" },
        reachedStep: "policy",
        error: null,
        timings: { classifyMs: 1, draftMs: 1 },
      },
    });

    const results = await recentMessagesFor(db, { tenantId, userId, limit: 5 }, { run: fakeRun });

    expect(results.map((r) => [r.text, r.then])).toEqual([
      ["Is your kitchen halal?", "Then: it came to you"],
      ["Open on Sunday?", "Then: you edited the reply"],
    ]);
    expect(results[0].card).toMatchObject({
      reply: "We're open 8am to 4pm!",
      basedOn: "Opening hours",
    });
    expect(await snapshot()).toEqual(before);
    const { count } = await db
      .from("lab_runs")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("origin", "owner");
    expect(count).toBe(2);
  });
});
