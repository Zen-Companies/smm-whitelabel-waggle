import { createHash, randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { loadInboxTab } from "@/features/approvals/inbox-data";
import type { Database } from "@/lib/supabase/database.types";
import { anonClient, serviceClient, uniqueEmail } from "./helpers";

// T53: an organization with two brands. A member invited to one brand only never reads the other
// brand's rows, even by asking for it by id; removing them takes the brand away at once.
const db = serviceClient();
const userIds: string[] = [];
const tenantIds: string[] = [];
const orgIds: string[] = [];

let org: string;
let poblacion: string;
let makati: string;
let ownerId: string;
let marco: { userId: string; email: string; client: SupabaseClient<Database> };

async function signUp() {
  const email = uniqueEmail();
  const { data, error } = await anonClient().auth.signUp({ email, password: "password123" });
  if (error) throw error;
  userIds.push(data.user!.id);
  const token = data.session!.access_token;
  const client = createClient<Database>(inject("supabaseUrl"), inject("supabaseAnonKey"), {
    accessToken: async () => token,
  });
  return { userId: data.user!.id, email, client };
}

async function item(tenantId: string, text: string) {
  const { data: account } = await db
    .from("social_accounts")
    .insert({
      tenant_id: tenantId,
      zernio_account_id: `acc_${randomUUID().slice(0, 8)}`,
      platform: "instagram",
    })
    .select("id")
    .single();
  const id = randomUUID();
  const { error } = await db.from("inbound_items").insert({
    id,
    tenant_id: tenantId,
    social_account_id: account!.id,
    kind: "comment",
    zernio_comment_id: `c_${id}`,
    zernio_post_id: "p",
    text,
    received_at: new Date().toISOString(),
    status: "escalated",
    category: "faq",
    confidence: 0.9,
  });
  if (error) throw error;
  return id;
}

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

beforeAll(async () => {
  ownerId = (await signUp()).userId;
  const { data: orgId, error } = await db.rpc("create_organization", {
    p_user: ownerId,
    p_name: "Harbour Bean Group",
  });
  if (error) throw error;
  org = orgId;
  orgIds.push(org);
  for (const name of ["Poblacion", "Makati"]) {
    const { data } = await db.rpc("create_brand_in_org", {
      p_org: org,
      p_actor: ownerId,
      p_name: name,
    });
    tenantIds.push(data![0].tenant_id);
  }
  [poblacion, makati] = tenantIds;
  await item(poblacion, "poblacion question");
  await item(makati, "makati question");

  marco = await signUp();
  const { data: invite } = await db.rpc("invite_member", {
    p_org: org,
    p_actor: ownerId,
    p_email: marco.email,
    p_role: "member",
    p_all_brands: false,
    p_tenant_ids: [poblacion],
    p_token_hash: hash("marco-token"),
  });
  expect(invite![0].status).toBe("sent");
  const { data: accepted } = await db.rpc("accept_invite", {
    p_token_hash: hash("marco-token"),
    p_user: marco.userId,
  });
  expect(accepted![0].status).toBe("joined");
});

afterAll(async () => {
  for (const id of tenantIds) await db.from("tenants").delete().eq("id", id);
  for (const id of orgIds) await db.from("organizations").delete().eq("id", id);
  for (const id of userIds) {
    await db.from("organizations").delete().eq("personal_of", id);
    await db.auth.admin.deleteUser(id);
  }
});

describe("organizations (T53)", () => {
  it("a member limited to one brand reads only that brand", async () => {
    const { data: brands } = await marco.client.from("tenants").select("id").in("id", tenantIds);
    expect(brands?.map((b) => b.id)).toEqual([poblacion]);

    const mine = await loadInboxTab(marco.client, poblacion, "for_you");
    expect(mine.map((e) => e.text)).toEqual(["poblacion question"]);
    // Asking for the other brand by id gets nothing, not an error.
    expect(await loadInboxTab(marco.client, makati, "for_you")).toEqual([]);
    const { data: items } = await marco.client.from("inbound_items").select("text");
    expect(items?.map((i) => i.text)).toEqual(["poblacion question"]);
  });

  it("the member's access row carries the role", async () => {
    const { data } = await db
      .from("tenant_members")
      .select("tenant_id, role")
      .eq("user_id", marco.userId)
      .in("tenant_id", tenantIds);
    expect(data).toEqual([{ tenant_id: poblacion, role: "member" }]);
  });

  it("removing the member takes the brand away at once", async () => {
    const { error } = await db.rpc("remove_member", {
      p_org: org,
      p_actor: ownerId,
      p_user: marco.userId,
    });
    expect(error).toBeNull();
    const { data } = await marco.client.from("inbound_items").select("id").in("tenant_id", tenantIds);
    expect(data).toEqual([]);
  });

  it("signing up gives the login a personal organization of its own", async () => {
    const { data: personal } = await db.rpc("create_personal_org", { p_user: marco.userId });
    const { data: orgs } = await marco.client.from("organizations").select("id, personal_of");
    expect(orgs).toEqual([{ id: personal, personal_of: marco.userId }]);
  });
});
