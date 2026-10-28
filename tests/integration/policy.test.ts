import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPolicyStep } from "@/features/approvals/policy-step";
import { processDueItems } from "@/features/inbox/processor";
import { createDeadline } from "@/lib/jobs";
import { anonClient, claimFor, serviceClient, uniqueEmail } from "./helpers";

// docs/tasks.md T10: changing a mode changes the next item's outcome.
const db = serviceClient();
const owner = anonClient();
const userIds: string[] = [];
let tenantId: string;
let accountId: string;

const run = () =>
  processDueItems({
    db,
    steps: { drafted: createPolicyStep() },
    deadline: createDeadline(),
    claim: claimFor(() => tenantId),
  });

async function draftedItem(
  opts: {
    category?: string;
    confidence?: number;
    needsHuman?: boolean;
    dmLastMessageAgoMs?: number;
  } = {},
) {
  const id = randomUUID();
  let conversationId: string | null = null;
  if (opts.dmLastMessageAgoMs !== undefined) {
    const { data } = await db
      .from("conversations")
      .insert({
        tenant_id: tenantId,
        social_account_id: accountId,
        zernio_conversation_id: `conv_${id}`,
        platform: "instagram",
        last_customer_message_at: new Date(Date.now() - opts.dmLastMessageAgoMs).toISOString(),
      })
      .select("id")
      .single();
    conversationId = data!.id;
  }
  const { error } = await db.from("inbound_items").insert({
    id,
    tenant_id: tenantId,
    social_account_id: accountId,
    ...(conversationId
      ? { kind: "dm", zernio_message_id: `m_${id}`, conversation_id: conversationId }
      : { kind: "comment", zernio_comment_id: `c_${id}` }),
    text: "fixture",
    received_at: new Date().toISOString(),
    status: "drafted",
    category: opts.category ?? "faq",
    confidence: opts.confidence ?? 0.95,
  });
  if (error) throw error;
  const { data: draft } = await db
    .from("drafts")
    .insert({
      tenant_id: tenantId,
      item_id: id,
      body: "reply",
      needs_human: opts.needsHuman ?? false,
    })
    .select("id")
    .single();
  return { id, draftId: draft!.id };
}

const statusOf = async (id: string) =>
  (await db.from("inbound_items").select("status").eq("id", id).single()).data?.status;

/** The owner changes the mode through RLS, as the settings Server Action does. */
async function setMode(category: string, mode: string) {
  const { data, error } = await owner
    .from("autonomy_settings")
    .update({ mode })
    .eq("tenant_id", tenantId)
    .eq("category", category)
    .select("mode");
  expect(error).toBeNull();
  expect(data).toEqual([{ mode }]);
}

beforeAll(async () => {
  const { data } = await owner.auth.signUp({ email: uniqueEmail(), password: "password123" });
  userIds.push(data.user!.id);
  const { data: rows } = await db.rpc("create_owner_tenant", {
    p_user_id: data.user!.id,
    p_name: "Policy Cafe",
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

describe("policy step + autonomy modes", () => {
  it("default faq mode (approve) → awaiting_approval", async () => {
    const { id } = await draftedItem();
    await run();
    expect(await statusOf(id)).toBe("awaiting_approval");
    const { data } = await db
      .from("audit_log")
      .select("details")
      .eq("item_id", id)
      .eq("action", "status_changed")
      .single();
    expect(data?.details).toMatchObject({
      decision: "approve",
      policyReason: "approval_required",
      mode: "approve",
    });
  });

  it("switching faq to auto makes the next faq item send, with the draft approved", async () => {
    await setMode("faq", "auto");
    const { id, draftId } = await draftedItem();
    await run();
    expect(await statusOf(id)).toBe("sending");
    const { data: draft } = await db
      .from("drafts")
      .select("status, decided_by")
      .eq("id", draftId)
      .single();
    expect(draft).toEqual({ status: "approved", decided_by: null });
  });

  it("switching faq to off makes the next faq item escalate", async () => {
    await setMode("faq", "off");
    const { id } = await draftedItem();
    await run();
    expect(await statusOf(id)).toBe("escalated");
  });

  it("the faq mode doesn't change leads", async () => {
    const { id } = await draftedItem({ category: "lead" });
    await run();
    expect(await statusOf(id)).toBe("awaiting_approval");
  });

  it("auto still escalates uncovered drafts, low confidence and closed DM windows", async () => {
    await setMode("faq", "auto");
    const uncovered = await draftedItem({ needsHuman: true });
    const unsure = await draftedItem({ confidence: 0.6 });
    const lateDm = await draftedItem({ dmLastMessageAgoMs: 25 * 3600_000 });
    const freshDm = await draftedItem({ dmLastMessageAgoMs: 60_000 });

    await run();

    expect(await statusOf(uncovered.id)).toBe("escalated");
    expect(await statusOf(unsure.id)).toBe("escalated");
    expect(await statusOf(lateDm.id)).toBe("escalated");
    expect(await statusOf(freshDm.id)).toBe("sending");
  });

  it("an owner can't change another tenant's modes", async () => {
    const { data } = await owner
      .from("autonomy_settings")
      .update({ mode: "auto" })
      .neq("tenant_id", tenantId)
      .select("tenant_id");
    expect(data).toEqual([]);
  });
});
