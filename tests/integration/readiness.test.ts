import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadReadiness } from "@/features/approvals/readiness-data";
import { anonClient, serviceClient, uniqueEmail } from "./helpers";

// T27: the readiness card counts the owner's own decisions per category, from the drafts table.
const db = serviceClient();
let tenantId: string;
let userId: string;
let accountId: string;

async function draft(
  category: "faq" | "lead",
  d: { status: string; edited?: string; byOwner?: boolean },
) {
  const itemId = randomUUID();
  await db.from("inbound_items").insert({
    id: itemId,
    tenant_id: tenantId,
    social_account_id: accountId,
    kind: "comment",
    zernio_comment_id: `c_${itemId}`,
    text: "Open on Sunday?",
    received_at: new Date().toISOString(),
    status: "sent",
    category,
    confidence: 0.95,
  });
  const { error } = await db.from("drafts").insert({
    tenant_id: tenantId,
    item_id: itemId,
    body: "Sundays 8 to 4.",
    edited_body: d.edited ?? null,
    status: d.status,
    decided_by: d.byOwner === false ? null : userId,
  });
  if (error) throw error;
}

beforeAll(async () => {
  const { data } = await anonClient().auth.signUp({
    email: uniqueEmail(),
    password: "password123",
  });
  userId = data.user!.id;
  const { data: rows } = await db.rpc("create_owner_tenant", {
    p_user_id: userId,
    p_name: "Readiness Cafe",
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

  for (let i = 0; i < 3; i++) await draft("faq", { status: "sent" });
  await draft("faq", { status: "sent", edited: "Sundays 8am to 4pm!" });
  await draft("faq", { status: "rejected" });
  await draft("faq", { status: "sent", byOwner: false });
  await draft("lead", { status: "sent" });
});

afterAll(async () => {
  await db.from("tenants").delete().eq("id", tenantId);
  await db.auth.admin.deleteUser(userId);
});

describe("loadReadiness", () => {
  it("counts the owner's decisions per category; auto-sent replies don't count", async () => {
    const r = await loadReadiness(db, tenantId);
    expect(r.faq.summary).toBe(
      "Last 14 days: 5 replies drafted. You sent 3 as written, edited 1, rejected 1.",
    );
    expect(r.faq).toMatchObject({ ready: false, verdict: "Not ready yet: you changed 2 of 5." });
    expect(r.faq.edits).toEqual([
      expect.objectContaining({ suggested: "Sundays 8 to 4.", sent: "Sundays 8am to 4pm!" }),
    ]);
    expect(r.lead.summary).toBe(
      "Last 14 days: 1 reply drafted. You sent 1 as written, edited none, rejected none.",
    );
  });
});
