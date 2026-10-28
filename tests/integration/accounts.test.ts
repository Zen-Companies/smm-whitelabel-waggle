import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { handleAccountConnected, handleAccountDisconnected } from "@/features/accounts/events";
import { anonClient, serviceClient, uniqueEmail } from "./helpers";

// docs/tasks.md T4: accounts come from account.connected; a disconnect pauses open items.
const db = serviceClient();
let tenantId: string;
let otherTenantId: string;
let ownerClient: ReturnType<typeof anonClient>;
const userIds: string[] = [];

async function ownerTenant(name: string) {
  const client = anonClient();
  const { data, error } = await client.auth.signUp({
    email: uniqueEmail(),
    password: "password123",
  });
  if (error || !data.user) throw error ?? new Error("no user");
  userIds.push(data.user.id);
  const { data: rows } = await db.rpc("create_owner_tenant", {
    p_user_id: data.user.id,
    p_name: name,
  });
  return { tenantId: rows![0].tenant_id, client };
}

async function addItem(accountId: string, status: string) {
  const id = randomUUID();
  const { error } = await db.from("inbound_items").insert({
    id,
    tenant_id: tenantId,
    social_account_id: accountId,
    kind: "comment",
    zernio_comment_id: `c_${id}`,
    text: "fixture",
    received_at: new Date().toISOString(),
    status,
  });
  if (error) throw error;
  return id;
}

async function statuses(ids: string[]) {
  const { data } = await db.from("inbound_items").select("id, status").in("id", ids);
  return Object.fromEntries((data ?? []).map((r) => [r.id, r.status]));
}

beforeAll(async () => {
  const owner = await ownerTenant("Accounts Cafe");
  tenantId = owner.tenantId;
  ownerClient = owner.client;
  otherTenantId = (await ownerTenant("Other Cafe")).tenantId;
});

afterAll(async () => {
  await db.from("tenants").delete().in("id", [tenantId, otherTenantId]);
  for (const id of userIds) await db.auth.admin.deleteUser(id);
});

describe("account events", () => {
  const zernioId = `acc_${randomUUID().slice(0, 8)}`;
  let accountId: string;

  it("account.connected creates an active account the owner can see", async () => {
    const result = await handleAccountConnected(db, {
      tenantId,
      zernioAccountId: zernioId,
      platform: "instagram",
      username: "AccountsCafe",
    });
    expect(result.outcome).toBe("created");
    accountId = result.accountId;

    // What the settings page reads: the owner's own client, through RLS.
    const { data } = await ownerClient
      .from("social_accounts")
      .select("platform, username, status")
      .eq("tenant_id", tenantId);
    expect(data).toEqual([{ platform: "instagram", username: "AccountsCafe", status: "active" }]);
  });

  it("the same event again changes nothing and writes no second audit row", async () => {
    const again = await handleAccountConnected(db, {
      tenantId,
      zernioAccountId: zernioId,
      platform: "instagram",
      username: "AccountsCafe",
    });
    expect(again).toMatchObject({ outcome: "existing", accountId });
    const { count } = await db
      .from("audit_log")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("action", "account_connected");
    expect(count).toBe(1);
  });

  it("account.disconnected pauses only new/classified/drafted items", async () => {
    const ids = {
      new: await addItem(accountId, "new"),
      classified: await addItem(accountId, "classified"),
      drafted: await addItem(accountId, "drafted"),
      awaiting: await addItem(accountId, "awaiting_approval"),
      sending: await addItem(accountId, "sending"),
      sent: await addItem(accountId, "sent"),
    };

    const result = await handleAccountDisconnected(db, {
      tenantId,
      zernioAccountId: zernioId,
      disconnectionType: "unintentional",
      reason: "Token expired",
    });

    expect(result).toEqual({ accountId, pausedItems: 3 });
    expect(await statuses(Object.values(ids))).toEqual({
      [ids.new]: "paused",
      [ids.classified]: "paused",
      [ids.drafted]: "paused",
      [ids.awaiting]: "awaiting_approval",
      [ids.sending]: "sending",
      [ids.sent]: "sent",
    });
    const { data: account } = await db
      .from("social_accounts")
      .select("status")
      .eq("id", accountId)
      .single();
    expect(account?.status).toBe("disconnected");
    const { data: audit } = await db
      .from("audit_log")
      .select("item_id, details")
      .eq("action", "status_changed")
      .eq("item_id", ids.classified);
    expect(audit).toEqual([
      {
        item_id: ids.classified,
        details: { from: "classified", to: "paused", reason: "account_disconnected" },
      },
    ]);
  });

  it("a reconnect with a NEW Zernio id updates the same row and resumes paused items", async () => {
    const newZernioId = `acc_${randomUUID().slice(0, 8)}`;
    const result = await handleAccountConnected(db, {
      tenantId,
      zernioAccountId: newZernioId,
      platform: "instagram",
      username: "accountscafe", // case differs
    });

    expect(result).toEqual({ accountId, outcome: "reconnected", resumedItems: 3 });
    const { data: rows } = await db
      .from("social_accounts")
      .select("id, zernio_account_id, status")
      .eq("tenant_id", tenantId);
    expect(rows).toEqual([{ id: accountId, zernio_account_id: newZernioId, status: "active" }]);
    const { data: items } = await db
      .from("inbound_items")
      .select("status")
      .eq("social_account_id", accountId)
      .eq("status", "paused");
    expect(items).toEqual([]);
    const { data: audit } = await db
      .from("audit_log")
      .select("details")
      .eq("tenant_id", tenantId)
      .eq("action", "account_connected")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    expect(audit?.details).toMatchObject({
      outcome: "reconnected",
      previousZernioAccountId: zernioId,
    });
  });

  it("the same username on the other platform is a different account", async () => {
    const result = await handleAccountConnected(db, {
      tenantId,
      zernioAccountId: `acc_${randomUUID().slice(0, 8)}`,
      platform: "facebook",
      username: "accountscafe",
    });
    expect(result.outcome).toBe("created");
    expect(result.accountId).not.toBe(accountId);
  });

  it("never takes over another tenant's Zernio account id", async () => {
    const { data: before } = await db
      .from("social_accounts")
      .select("zernio_account_id")
      .eq("id", accountId)
      .single();
    const result = await handleAccountConnected(db, {
      tenantId: otherTenantId,
      zernioAccountId: before!.zernio_account_id,
      platform: "instagram",
      username: "intruder",
    });
    expect(result.outcome).toBe("foreign");
    const { data: after } = await db
      .from("social_accounts")
      .select("tenant_id, username")
      .eq("id", accountId)
      .single();
    expect(after).toEqual({ tenant_id: tenantId, username: "accountscafe" });
  });

  it("a disconnect for an unknown account does nothing", async () => {
    await expect(
      handleAccountDisconnected(db, { tenantId, zernioAccountId: "acc_unknown" }),
    ).resolves.toEqual({ accountId: null, pausedItems: 0 });
  });
});
