import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { countInboxTabs, loadInboxTab, loadTodaySummary } from "@/features/approvals/inbox-data";
import { pickBrand } from "@/features/tenants/brand-pick";
import type { Database } from "@/lib/supabase/database.types";
import { anonClient, serviceClient, uniqueEmail } from "./helpers";

// T47: one login owns two brands. Each brand's inbox shows only its own items, though RLS lets the
// login read both: every query must filter on the open brand. A stranger sees neither.
const db = serviceClient();
const userIds: string[] = [];
const tenantIds: string[] = [];

let harbour: string;
let bloom: string;
let owner: SupabaseClient<Database>;
let stranger: SupabaseClient<Database>;

async function signUp() {
  const { data, error } = await anonClient().auth.signUp({
    email: uniqueEmail(),
    password: "password123",
  });
  if (error) throw error;
  userIds.push(data.user!.id);
  const token = data.session!.access_token;
  const client = createClient<Database>(inject("supabaseUrl"), inject("supabaseAnonKey"), {
    accessToken: async () => token,
  });
  return { userId: data.user!.id, client };
}

async function item(tenantId: string, text: string, status = "escalated") {
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
    status,
    category: "faq",
    confidence: 0.9,
  });
  if (error) throw error;
  return id;
}

beforeAll(async () => {
  const me = await signUp();
  owner = me.client;
  const { data: first } = await db.rpc("create_owner_tenant", {
    p_user_id: me.userId,
    p_name: "Harbour Bean",
  });
  harbour = first![0].tenant_id;
  const { data: second } = await db.rpc("create_brand", {
    p_user_id: me.userId,
    p_name: "Bloom Florist",
  });
  expect(second![0].created).toBe(true);
  bloom = second![0].tenant_id;
  tenantIds.push(harbour, bloom);
  stranger = (await signUp()).client;

  await item(harbour, "harbour question");
  await item(harbour, "harbour complaint", "failed");
  await item(bloom, "bloom question");
});

afterAll(async () => {
  for (const id of tenantIds) await db.from("tenants").delete().eq("id", id);
  for (const id of userIds) await db.auth.admin.deleteUser(id);
});

describe("brands (T47)", () => {
  it("the login reads both brands, oldest first; a stranger reads neither", async () => {
    const { data: mine } = await owner.from("tenants").select("id").order("created_at");
    expect(mine?.map((t) => t.id)).toEqual([harbour, bloom]);
    const { data: theirs } = await stranger.from("tenants").select("id").in("id", tenantIds);
    expect(theirs).toEqual([]);
  });

  it("a cookie naming a stranger's tenant falls back to the login's first brand", async () => {
    const { data: mine } = await owner.from("tenants").select("id").order("created_at");
    const { data: strangerTenant } = await db.rpc("create_owner_tenant", {
      p_user_id: userIds[1],
      p_name: "Stranger Shop",
    });
    tenantIds.push(strangerTenant![0].tenant_id);
    expect(pickBrand(mine ?? [], strangerTenant![0].tenant_id)?.id).toBe(harbour);
    expect(pickBrand(mine ?? [], bloom)?.id).toBe(bloom);
  });

  it("each brand's inbox lists and counts only its own items", async () => {
    const harbourItems = await loadInboxTab(owner, harbour, "for_you");
    const bloomItems = await loadInboxTab(owner, bloom, "for_you");
    expect(harbourItems.map((e) => e.text).sort()).toEqual([
      "harbour complaint",
      "harbour question",
    ]);
    expect(bloomItems.map((e) => e.text)).toEqual(["bloom question"]);

    expect((await countInboxTabs(owner, harbour)).for_you).toBe(2);
    expect((await countInboxTabs(owner, bloom)).for_you).toBe(1);
    expect((await loadTodaySummary(owner, bloom)).forYou).toBe(1);
  });

  it("the same name again doesn't make a second brand", async () => {
    const { data } = await db.rpc("create_brand", {
      p_user_id: userIds[0],
      p_name: " bloom florist ",
    });
    expect(data![0]).toEqual({ tenant_id: bloom, created: false });
  });
});
