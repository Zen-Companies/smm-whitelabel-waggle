import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadCostView } from "@/features/billing/costs";
import { MockSocialProvider } from "@/lib/social/mock";
import type { ProviderUsage } from "@/lib/social/types";
import { anonClient, serviceClient, uniqueEmail } from "./helpers";

// docs/tasks.md T17: any sent reply can be traced to its draft, decision and AI calls; the cost
// view shows AI cost per tenant and per message, and Zernio's spend per tenant (mocked).
const db = serviceClient();
let tenantId: string;
let userId: string;
const profileId = `prof_${randomUUID().slice(0, 8)}`;
let itemId: string;

class UsageSocial extends MockSocialProvider {
  usage: ProviderUsage | null = null;
  override async getUsageByProfile() {
    return this.usage;
  }
}

beforeAll(async () => {
  const { data } = await anonClient().auth.signUp({
    email: uniqueEmail(),
    password: "password123",
  });
  userId = data.user!.id;
  const { data: rows } = await db.rpc("create_owner_tenant", {
    p_user_id: userId,
    p_name: "Costs Cafe",
  });
  tenantId = rows![0].tenant_id;
  await db.from("tenants").update({ zernio_profile_id: profileId }).eq("id", tenantId);
  const { data: account } = await db
    .from("social_accounts")
    .insert({
      tenant_id: tenantId,
      zernio_account_id: `acc_${randomUUID().slice(0, 8)}`,
      platform: "instagram",
    })
    .select("id")
    .single();
  itemId = randomUUID();
  await db.from("inbound_items").insert({
    id: itemId,
    tenant_id: tenantId,
    social_account_id: account!.id,
    kind: "comment",
    zernio_comment_id: `c_${itemId}`,
    zernio_post_id: "p",
    text: "Open Sunday?",
    received_at: new Date().toISOString(),
    status: "sent",
    category: "faq",
    confidence: 0.95,
  });
  const usage = (purpose: string, cost: number) => ({
    tenant_id: tenantId,
    item_id: itemId,
    purpose,
    provider: "openrouter",
    model: "test",
    input_tokens: 100,
    output_tokens: 20,
    cost_usd: cost,
  });
  await db
    .from("ai_usage")
    .insert([usage("classify", 0.0001), usage("embed", 0.00001), usage("draft", 0.0004)]);
  const { data: draft } = await db
    .from("drafts")
    .insert({
      tenant_id: tenantId,
      item_id: itemId,
      body: "We are open 8 to 10.",
      status: "sent",
      sent_at: new Date().toISOString(),
      decided_by: userId,
      zernio_reply_id: "reply_1",
    })
    .select("id")
    .single();
  for (const action of ["draft_created", "draft_approved", "reply_sent"]) {
    await db.from("audit_log").insert({
      tenant_id: tenantId,
      item_id: itemId,
      action,
      actor: action === "draft_approved" ? userId : "system",
      details: { draftId: draft!.id },
    });
  }
});

afterAll(async () => {
  await db.from("tenants").delete().eq("id", tenantId);
  await db.auth.admin.deleteUser(userId);
});

describe("cost view and audit trail (T17)", () => {
  it("a sent reply traces to its draft, the owner's decision and its AI calls", async () => {
    const { data: audit } = await db
      .from("audit_log")
      .select("action, actor, details")
      .eq("item_id", itemId)
      .order("created_at");
    const { data: draft } = await db
      .from("drafts")
      .select("id, decided_by, zernio_reply_id")
      .eq("item_id", itemId)
      .single();
    const { data: usage } = await db.from("ai_usage").select("purpose").eq("item_id", itemId);
    expect(audit?.map((a) => a.action)).toEqual(["draft_created", "draft_approved", "reply_sent"]);
    expect(audit?.every((a) => (a.details as { draftId: string }).draftId === draft!.id)).toBe(
      true,
    );
    expect(audit?.find((a) => a.action === "draft_approved")?.actor).toBe(userId);
    expect(draft).toMatchObject({ decided_by: userId, zernio_reply_id: "reply_1" });
    expect(usage?.map((u) => u.purpose).sort()).toEqual(["classify", "draft", "embed"]);
  });

  it("AI cost per tenant and per message, with Zernio's spend from usage by profile", async () => {
    const social = new UsageSocial();
    social.usage = {
      periodStart: "2026-10-01",
      periodEnd: "2026-10-31",
      totalUsd: 20,
      unattributedUsd: 1,
      byProfile: [{ profileId, totalUsd: 4.5 }],
    };
    const view = await loadCostView({ db, social: () => social });

    const mine = view.tenants.find((t) => t.tenantId === tenantId)!;
    expect(mine).toMatchObject({
      name: "Costs Cafe",
      messages: 1,
      repliesSent: 1,
      aiCalls: 3,
      zernioCostUsd: 4.5,
    });
    expect(mine.aiCostUsd).toBeCloseTo(0.00051, 6);
    expect(mine.aiCostPerMessageUsd).toBeCloseTo(0.00051, 6);
    const item = view.items.find((i) => i.itemId === itemId)!;
    expect(item).toMatchObject({ aiCalls: 3, purposes: ["classify", "draft", "embed"] });
    expect(view.zernio).toMatchObject({ totalUsd: 20, unattributedUsd: 1 });
  });

  it("mock mode: Zernio usage isn't available, AI costs still are", async () => {
    const view = await loadCostView({ db, social: () => new MockSocialProvider() });
    expect(view.zernio).toBeNull();
    expect(view.tenants.find((t) => t.tenantId === tenantId)?.zernioCostUsd).toBeNull();
  });
});
