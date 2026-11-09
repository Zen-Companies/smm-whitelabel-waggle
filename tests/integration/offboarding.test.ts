import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { handleAccountConnected } from "@/features/accounts/events";
import { MCP_FLAG, mcpBrandsOn } from "@/features/mcp";
import {
  loadBrandRows,
  offboardBrand,
  purgeDueBrands,
  restoreBrand,
  retryOffboarding,
} from "@/features/offboarding";
import { MockSocialProvider } from "@/lib/social/mock";
import { anonClient, serviceClient, uniqueEmail } from "./helpers";

// T21 offboarding (decided 2026-11-09): soft delete now, Zernio accounts released, restore within
// 3 months, then the hard delete that keeps costs and a scrubbed audit log.

const db = serviceClient();
const social = new MockSocialProvider();
const deps = { db, social: () => social };
const run = { ...deps, shouldContinue: () => true };
const userIds: string[] = [];
let ownerClient: ReturnType<typeof anonClient>;
let ownerId: string;
let adminId: string;
let brand: string;
let second: string;
const profile = `prof_${randomUUID().slice(0, 8)}`;
const igZernio = `acc_ig_${randomUUID().slice(0, 8)}`;
const fbZernio = `acc_fb_${randomUUID().slice(0, 8)}`;
let itemId: string;

async function signUp() {
  const client = anonClient();
  const { data, error } = await client.auth.signUp({
    email: uniqueEmail(),
    password: "password123",
  });
  if (error || !data.user) throw error ?? new Error("no user");
  userIds.push(data.user.id);
  return { client, id: data.user.id };
}

const tenant = async (id: string) =>
  (
    await db
      .from("tenants")
      .select("offboarded_at, purge_after, purged_at, offboard_issue, zernio_profile_id")
      .eq("id", id)
      .single()
  ).data!;

beforeAll(async () => {
  const owner = await signUp();
  ownerClient = owner.client;
  ownerId = owner.id;
  adminId = (await signUp()).id;
  const { data: a } = await db.rpc("create_owner_tenant", {
    p_user_id: ownerId,
    p_name: "Leaving Bakery",
  });
  brand = a![0].tenant_id;
  const { data: b } = await db.rpc("create_brand", { p_user_id: ownerId, p_name: "Staying Cafe" });
  second = b![0].tenant_id;
  await db.from("tenants").update({ zernio_profile_id: profile }).eq("id", brand);

  const ig = await handleAccountConnected(db, {
    tenantId: brand,
    zernioAccountId: igZernio,
    platform: "instagram",
    username: "leavingbakery",
  });
  await handleAccountConnected(db, {
    tenantId: brand,
    zernioAccountId: fbZernio,
    platform: "facebook",
    username: "Leaving Bakery",
  });
  itemId = randomUUID();
  await db.from("inbound_items").insert({
    id: itemId,
    tenant_id: brand,
    social_account_id: ig.accountId,
    kind: "comment",
    zernio_comment_id: `c_${itemId}`,
    text: "fixture",
    received_at: new Date().toISOString(),
    status: "new",
  });
  await db.from("ai_usage").insert({
    tenant_id: brand,
    item_id: itemId,
    purpose: "draft",
    provider: "test",
    model: "test",
    cost_usd: 0.01,
  });
  await db.from("audit_log").insert({
    tenant_id: brand,
    item_id: itemId,
    action: "draft_created",
    actor: "system",
    details: { draftId: "d1", groundingIssues: ["free text"] },
  });
  await db.from("kb_entries").insert({ tenant_id: brand, title: "Hours", content: "7 to 5" });
  await db.from("feature_flags").insert({ key: MCP_FLAG, tenant_id: brand, enabled: true });
});

afterAll(async () => {
  await db.from("tenants").delete().in("id", [brand, second]);
  for (const id of userIds) await db.auth.admin.deleteUser(id);
});

describe("offboard", () => {
  it("stops Waggle at once even when Zernio fails to release an account", async () => {
    social.failRemoval.add(fbZernio);
    const out = await offboardBrand(deps, { tenantId: brand, actorId: adminId });
    expect(out).toMatchObject({
      ok: true,
      issue: "Facebook didn't disconnect: Zernio didn't answer.",
    });

    const t = await tenant(brand);
    expect(t.offboarded_at).not.toBeNull();
    const months = (new Date(t.purge_after!).getTime() - Date.now()) / (24 * 3600 * 1000);
    expect(months).toBeGreaterThan(88);
    expect(months).toBeLessThan(93);

    const { data: accounts } = await db
      .from("social_accounts")
      .select("platform, status, released_at")
      .eq("tenant_id", brand)
      .order("platform");
    expect(accounts?.map((a) => [a.platform, a.status, a.released_at !== null])).toEqual([
      ["facebook", "disconnected", false],
      ["instagram", "disconnected", true],
    ]);
    expect(social.disconnectedAccounts).toContain(igZernio);
    const { data: item } = await db
      .from("inbound_items")
      .select("status")
      .eq("id", itemId)
      .single();
    expect(item?.status).toBe("paused");

    expect(await offboardBrand(deps, { tenantId: brand, actorId: adminId })).toHaveProperty(
      "error",
    );
  });

  it("the owner loses the brand everywhere; AI assistants too", async () => {
    const { data: visible } = await ownerClient.from("tenants").select("id");
    expect(visible?.map((t) => t.id)).toEqual([second]);
    const { data: items } = await ownerClient
      .from("inbound_items")
      .select("id")
      .eq("tenant_id", brand);
    expect(items).toEqual([]);
    expect([...(await mcpBrandsOn(db, [brand]))]).toEqual([]);
  });

  it("the Brands page shows it as needing attention, with what Zernio still has", async () => {
    const { rows, counts } = await loadBrandRows(
      db,
      { q: "Leaving Bakery", filter: "attention" },
      new Date(),
    );
    expect(counts).toMatchObject({ attention: 1, offboarded: 0, active: 0 });
    expect(rows[0]).toMatchObject({
      id: brand,
      state: "attention",
      accounts: ["Facebook still connected", "Instagram disconnected"],
    });
    expect(rows[0].daysLeft).toBeGreaterThan(88);
  });

  it("Try again releases what's left and clears the issue", async () => {
    expect(await retryOffboarding(deps, { tenantId: brand, actorId: adminId })).toEqual({
      ok: true,
      issue: null,
    });
    expect(social.disconnectedAccounts).toContain(fbZernio);
    expect((await tenant(brand)).offboard_issue).toBeNull();
    const { rows } = await loadBrandRows(db, { q: "Leaving Bakery", filter: "all" }, new Date());
    expect(rows[0]).toMatchObject({ state: "offboarded", accounts: ["Disconnected"] });
  });
});

describe("restore", () => {
  it("brings the brand back to the owner; accounts wait for a reconnect", async () => {
    expect(await restoreBrand(db, { tenantId: brand, actorId: adminId })).toEqual({ ok: true });
    expect(await restoreBrand(db, { tenantId: brand, actorId: adminId })).toHaveProperty("error");
    const { data: visible } = await ownerClient.from("tenants").select("id").order("created_at");
    expect(visible?.map((t) => t.id)).toEqual([brand, second]);
    expect(await tenant(brand)).toMatchObject({ offboarded_at: null, purge_after: null });
    const { data: accounts } = await db
      .from("social_accounts")
      .select("status")
      .eq("tenant_id", brand);
    expect(accounts?.every((a) => a.status === "disconnected")).toBe(true);
    const { count } = await db
      .from("audit_log")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", brand)
      .in("action", ["brand_offboarded", "brand_restored"]);
    expect(count).toBe(2);
  });
});

describe("the hard delete after 3 months", () => {
  it("isn't due before the date", async () => {
    await offboardBrand(deps, { tenantId: brand, actorId: adminId });
    expect(await purgeDueBrands(run)).toEqual({ purged: 0, failed: 0 });
  });

  it("deletes the content and the Zernio profile; keeps costs and a scrubbed audit log", async () => {
    await db
      .from("tenants")
      .update({ purge_after: new Date(Date.now() - 1000).toISOString() })
      .eq("id", brand);
    expect(await purgeDueBrands(run)).toEqual({ purged: 1, failed: 0 });
    expect(social.deletedProfiles).toContain(profile);

    const t = await tenant(brand);
    expect(t.purged_at).not.toBeNull();
    expect(t.zernio_profile_id).toBeNull();
    for (const table of [
      "inbound_items",
      "social_accounts",
      "kb_entries",
      "tenant_members",
      "feature_flags",
    ] as const) {
      const { count } = await db
        .from(table)
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", brand);
      expect(count, table).toBe(0);
    }
    const { data: usage } = await db
      .from("ai_usage")
      .select("item_id, cost_usd")
      .eq("tenant_id", brand);
    expect(usage).toEqual([{ item_id: null, cost_usd: 0.01 }]);
    const { data: drafted } = await db
      .from("audit_log")
      .select("item_id, details")
      .eq("tenant_id", brand)
      .eq("action", "draft_created")
      .single();
    expect(drafted).toEqual({ item_id: null, details: { draftId: "d1" } });
    // Gone from the Brands page; the owner keeps their other brand.
    const { rows } = await loadBrandRows(db, { q: "Leaving Bakery", filter: "all" }, new Date());
    expect(rows).toEqual([]);
    const { data: visible } = await ownerClient.from("tenants").select("id");
    expect(visible?.map((x) => x.id)).toEqual([second]);
  });

  it("a Zernio failure leaves the content and shows why; retried an hour later", async () => {
    const otherProfile = `prof_${randomUUID().slice(0, 8)}`;
    await db.from("tenants").update({ zernio_profile_id: otherProfile }).eq("id", second);
    await offboardBrand(deps, { tenantId: second, actorId: adminId });
    await db
      .from("tenants")
      .update({ purge_after: new Date(Date.now() - 1000).toISOString() })
      .eq("id", second);
    social.failRemoval.add(otherProfile);
    expect(await purgeDueBrands(run)).toEqual({ purged: 0, failed: 1 });
    expect(await tenant(second)).toMatchObject({
      purged_at: null,
      offboard_issue: "The Zernio profile wasn't deleted: Zernio didn't answer.",
    });
    expect(await purgeDueBrands(run)).toEqual({ purged: 0, failed: 0 });
    // Try again makes it due for the next run.
    await retryOffboarding(deps, { tenantId: second, actorId: adminId });
    expect(await purgeDueBrands(run)).toEqual({ purged: 1, failed: 0 });
  });
});
