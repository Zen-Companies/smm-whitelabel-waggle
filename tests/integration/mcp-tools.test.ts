import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { callTool, toolByName, type McpPrincipal } from "@/features/mcp";
import { MockSocialProvider } from "@/lib/social/mock";
import { anonClient, serviceClient, uniqueEmail } from "./helpers";

// MCP Phase 1 (docs/mcp/PLAN.md §3): the tools against the real schema. Zernio is the mock
// (rule 14). Tokens come in Phase 2; here the principal is built by hand, as the auth layer will.
const db = serviceClient();
const social = new MockSocialProvider();
const deps = { db, social: () => social };
const userIds: string[] = [];
const tenantIds: string[] = [];

async function signUp() {
  const { data, error } = await anonClient().auth.signUp({
    email: uniqueEmail(),
    password: "password123",
  });
  if (error) throw error;
  userIds.push(data.user!.id);
  return data.user!.id;
}

async function brand(userId: string, name: string, first: boolean) {
  const { data } = first
    ? await db.rpc("create_owner_tenant", { p_user_id: userId, p_name: name })
    : await db.rpc("create_brand", { p_user_id: userId, p_name: name });
  const tenantId = data![0].tenant_id as string;
  tenantIds.push(tenantId);
  const { data: account } = await db
    .from("social_accounts")
    .insert({
      tenant_id: tenantId,
      zernio_account_id: `acc_${randomUUID().slice(0, 8)}`,
      platform: "facebook",
      username: name.toLowerCase().replace(/\W/g, ""),
    })
    .select("id")
    .single();
  return { tenantId, accountId: account!.id };
}

async function item(
  b: { tenantId: string; accountId: string },
  status: string,
  category: string,
  text = "Open on Sunday?",
) {
  const id = randomUUID();
  const { error } = await db.from("inbound_items").insert({
    id,
    tenant_id: b.tenantId,
    social_account_id: b.accountId,
    kind: "comment",
    zernio_comment_id: `c_${id}`,
    zernio_post_id: "post_1",
    author_name: "carlo",
    text,
    received_at: new Date().toISOString(),
    status,
    category,
    confidence: 0.9,
  });
  if (error) throw error;
  return id;
}

const call = async (p: McpPrincipal, name: string, args: Record<string, unknown>) => {
  const r = await callTool(toolByName(name)!, deps, p, args);
  return r.isError
    ? { error: JSON.parse(r.content[0].text).error as string }
    : (r.structuredContent as Record<string, unknown>);
};

let maria: string;
let cafe: { tenantId: string; accountId: string };
let florist: { tenantId: string; accountId: string };
let other: { tenantId: string; accountId: string };
let claude: McpPrincipal;

beforeAll(async () => {
  // The deployment's switch (MCP_ENABLED); brands are switched on one by one below.
  process.env.MCP_ENABLED = "true";
  maria = await signUp();
  cafe = await brand(maria, "Harbour Bean Cafe", true);
  florist = await brand(maria, "Bloom and Stem", false);
  other = await brand(await signUp(), "Someone Else", true);
  // Maria ticked only the café for Claude.
  claude = {
    userId: maria,
    clientId: "client_claude",
    clientName: "Claude",
    brandIds: [cafe.tenantId],
  };
  // AI assistants on for the café only (Phase 3 switches; the florist stays off).
  await db.from("feature_flags").insert({ key: "mcp", tenant_id: cafe.tenantId, enabled: true });
  await db.from("kb_entries").insert([
    { tenant_id: cafe.tenantId, title: "Sunday hours", content: "Open 8am to 10pm on Sundays." },
    { tenant_id: cafe.tenantId, title: "Parking", content: "Free parking behind the shop." },
  ]);
});

afterAll(async () => {
  for (const id of tenantIds) await db.from("tenants").delete().eq("id", id);
  for (const id of userIds) await db.auth.admin.deleteUser(id);
});

describe("brands: only the ticked brands of the signed-in owner", () => {
  it("list_brands shows the ticked brand only", async () => {
    const out = (await call(claude, "list_brands", {})) as {
      brands: { brand_id: string; accounts: unknown[] }[];
    };
    expect(out.brands.map((b) => b.brand_id)).toEqual([cafe.tenantId]);
    expect(out.brands[0].accounts).toHaveLength(1);
  });

  it("an unticked brand of the same owner, or someone else's, is refused", async () => {
    expect(await call(claude, "list_inbox", { brand_id: florist.tenantId })).toEqual({
      error: "brand_not_allowed",
    });
    expect(await call(claude, "list_inbox", { brand_id: other.tenantId })).toEqual({
      error: "brand_not_allowed",
    });
    // Even if a grant listed it, the owner must still be a member.
    const forged = { ...claude, brandIds: [other.tenantId] };
    expect(await call(forged, "list_inbox", { brand_id: other.tenantId })).toEqual({
      error: "brand_not_allowed",
    });
  });

  it("another brand's message can't be opened through this brand", async () => {
    const theirs = await item(other, "awaiting_approval", "faq");
    expect(
      await call(claude, "get_conversation", { brand_id: cafe.tenantId, item_id: theirs }),
    ).toEqual({ error: "not_found" });
  });
});

describe("the owner's own reply to a handed-over complaint (Q1)", () => {
  it("write_reply → sending, then undo, then approve again", async () => {
    const id = await item(cafe, "escalated", "complaint", "My latte was cold!");
    const convo = (await call(claude, "get_conversation", { item_id: id })) as {
      customer_text: string;
      can: { write_reply: boolean; approve_reply: boolean };
    };
    expect(convo.customer_text).toBe("My latte was cold!");
    expect(convo.can).toMatchObject({ write_reply: true, approve_reply: false });

    const sent = (await call(claude, "write_reply", {
      item_id: id,
      body: "So sorry! Your next latte is on us.",
    })) as { status: string; draft_id: string };
    expect(sent.status).toBe("sending");
    const { data: draft } = await db
      .from("drafts")
      .select("status, owner_written, decided_by")
      .eq("id", sent.draft_id)
      .single();
    expect(draft).toEqual({ status: "approved", owner_written: true, decided_by: maria });
    const { data: audit } = await db
      .from("audit_log")
      .select("details")
      .eq("item_id", id)
      .eq("action", "owner_reply_written")
      .single();
    expect(audit?.details).toMatchObject({
      via: { mcpClientId: "client_claude", clientName: "Claude" },
    });

    expect(await call(claude, "undo_reply", { item_id: id, draft_id: sent.draft_id })).toEqual({
      undone: true,
    });
    const back = (await db.from("inbound_items").select("status").eq("id", id).single()).data;
    expect(back?.status).toBe("awaiting_approval");

    const again = (await call(claude, "approve_reply", {
      item_id: id,
      draft_id: sent.draft_id,
    })) as { status: string };
    expect(again.status).toBe("sending");
    // A second write on a message already going out is refused.
    expect(await call(claude, "write_reply", { item_id: id, body: "Hi" })).toEqual({
      error: "already_decided",
    });
  });

  it("list_inbox pages the For you tab, customer text marked as customer_*", async () => {
    await item(cafe, "awaiting_approval", "faq");
    const out = (await call(claude, "list_inbox", { tab: "for_you" })) as {
      items: { customer_text: string }[];
      counts: { for_you: number };
    };
    expect(out.items.length).toBeGreaterThan(0);
    expect(out.counts.for_you).toBe(out.items.length);
    expect(out.items[0]).toHaveProperty("customer_text");
  });
});

describe("business info, posts", () => {
  it("search_knowledge finds by keyword, never another brand's facts", async () => {
    const out = (await call(claude, "search_knowledge", { query: "sunday" })) as {
      entries: { title: string }[];
    };
    expect(out.entries.map((e) => e.title)).toEqual(["Sunday hours"]);
    const all = (await call(claude, "search_knowledge", {})) as { entries: unknown[] };
    expect(all.entries).toHaveLength(2);
  });

  it("create_post only on this brand's accounts; cancel a scheduled one", async () => {
    expect(
      await call(claude, "create_post", { content: "Hi", account_ids: [florist.accountId] }),
    ).toEqual({ error: "invalid_input" });
    const at = new Date(Date.now() + 3 * 60 * 60_000).toISOString();
    const made = (await call(claude, "create_post", {
      content: "Ube pandesal this Saturday",
      account_ids: [cafe.accountId],
      publish_at: at,
    })) as { post_id: string; outcome: string };
    expect(["scheduled", "waiting"]).toContain(made.outcome);
    const listed = (await call(claude, "list_posts", { show: "upcoming" })) as {
      posts: { post_id: string }[];
    };
    expect(listed.posts.map((p) => p.post_id)).toContain(made.post_id);
    expect(await call(claude, "cancel_post", { post_id: made.post_id })).toEqual({
      cancelled: true,
    });
  });
});
