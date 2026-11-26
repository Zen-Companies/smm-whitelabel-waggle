import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import {
  countAutomatedSenders,
  countInboxTabs,
  loadInboxConversations,
  loadTodaySummary,
} from "@/features/approvals/inbox-data";
import { DEFAULT_FILTERS } from "@/features/approvals/inbox-groups";
import { loadThreadHistory } from "@/features/drafting/history";
import { closeAnsweredTogether } from "@/features/inbox/one-reply";
import type { Database } from "@/lib/supabase/database.types";
import { anonClient, serviceClient, uniqueEmail } from "./helpers";

// Inbox by sender (approved 26 Nov): the grouped list (one row per sender per account, the cap
// counting rows), the database filling sender keys, "N new" per login, automated senders, one
// reply per conversation, and RLS on the two new tables.
const db = serviceClient();
const userIds: string[] = [];
const tenantIds: string[] = [];

let tenant: string;
let owner: { userId: string; client: SupabaseClient<Database> };
let stranger: { userId: string; client: SupabaseClient<Database> };
let instagram: string;
let gmail: string;
const ids: Record<string, string> = {};

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

async function account(platform: string) {
  const { data, error } = await db
    .from("social_accounts")
    .insert({
      tenant_id: tenant,
      zernio_account_id: `acc_${randomUUID().slice(0, 8)}`,
      platform,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function conversation(accountId: string, platform: string, participant: string) {
  const { data, error } = await db
    .from("conversations")
    .insert({
      tenant_id: tenant,
      social_account_id: accountId,
      zernio_conversation_id: `conv_${randomUUID()}`,
      platform,
      participant_external_id: participant,
      participant_name: participant,
      last_customer_message_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

async function dm(
  key: string,
  accountId: string,
  conversationId: string,
  status: string,
  at: string,
  extra: Partial<Database["public"]["Tables"]["inbound_items"]["Insert"]> = {},
) {
  const id = randomUUID();
  const { error } = await db.from("inbound_items").insert({
    id,
    tenant_id: tenant,
    social_account_id: accountId,
    kind: "dm",
    zernio_message_id: `m_${id}`,
    conversation_id: conversationId,
    text: `message ${key}`,
    received_at: at,
    status,
    category: "faq",
    ...extra,
  });
  if (error) throw error;
  ids[key] = id;
  return id;
}

async function comment(key: string, post: string, status: string, at: string) {
  const id = randomUUID();
  const { error } = await db.from("inbound_items").insert({
    id,
    tenant_id: tenant,
    social_account_id: instagram,
    kind: "comment",
    zernio_comment_id: `c_${id}`,
    zernio_post_id: post,
    author_name: "@Jess.Bakes",
    text: `comment ${key}`,
    received_at: at,
    status,
    category: "faq",
  });
  if (error) throw error;
  ids[key] = id;
}

async function review(key: string, rating: number, at: string) {
  const id = randomUUID();
  const { error } = await db.from("inbound_items").insert({
    id,
    tenant_id: tenant,
    social_account_id: instagram,
    kind: "review",
    zernio_review_id: `r_${id}`,
    author_name: "Ben",
    text: `review ${key}`,
    received_at: at,
    status: "escalated",
    review_rating: rating,
  });
  if (error) throw error;
  ids[key] = id;
}

async function draft(itemId: string) {
  const { error } = await db
    .from("drafts")
    .insert({ tenant_id: tenant, item_id: itemId, body: "A reply" });
  if (error) throw error;
}

beforeAll(async () => {
  owner = await signUp();
  stranger = await signUp();
  const { data: rows } = await db.rpc("create_owner_tenant", {
    p_user_id: owner.userId,
    p_name: "Harbour Bakery",
  });
  tenant = rows![0].tenant_id;
  tenantIds.push(tenant);
  const { data: theirs } = await db.rpc("create_owner_tenant", {
    p_user_id: stranger.userId,
    p_name: "Other Shop",
  });
  tenantIds.push(theirs![0].tenant_id);

  instagram = await account("instagram");
  gmail = await account("google");

  // Maya: three DMs in one conversation, the last a lead with a reply ready.
  const maya = await conversation(instagram, "instagram", "ig_maya");
  await dm("maya1", instagram, maya, "sent", minutesAgo(600));
  await dm("maya2", instagram, maya, "awaiting_draft", minutesAgo(30));
  await dm("maya3", instagram, maya, "awaiting_approval", minutesAgo(20), { category: "lead" });
  await draft(ids.maya3);

  // Carla: two email threads, one sender (the trigger reads the address out of the participant).
  const carla1 = await conversation(gmail, "google", "Carla Mendoza <Carla@Example.com>");
  const carla2 = await conversation(gmail, "google", "carla@example.com");
  await dm("carla1", gmail, carla1, "escalated", minutesAgo(300));
  await dm("carla2", gmail, carla2, "escalated", minutesAgo(10));

  // Walter: a brand-new DM with a reply ready.
  const walter = await conversation(instagram, "instagram", "ig_walter");
  await dm("walter", instagram, walter, "awaiting_approval", minutesAgo(1));
  await draft(ids.walter);

  // Jess: comments on two posts, keyed by her handle.
  await comment("jess1", "post_a", "escalated", minutesAgo(50));
  await comment("jess2", "post_b", "escalated", minutesAgo(40));

  // Two reviews: one row each.
  await review("review1", 5, minutesAgo(70));
  await review("review2", 1, minutesAgo(80));

  // A newsletter sender: 5 failed threads, flagged automated.
  for (let i = 0; i < 5; i++) {
    const c = await conversation(gmail, "google", "hello@producthunt.com");
    await dm(`news${i}`, gmail, c, "failed", minutesAgo(1000 + i));
  }
  await db.from("inbox_senders").insert({
    tenant_id: tenant,
    social_account_id: gmail,
    sender_key: "hello@producthunt.com",
    automated: true,
    automated_reason: "unsubscribe_link",
  });
});

afterAll(async () => {
  await db.from("tenants").delete().in("id", tenantIds);
  for (const id of userIds) await db.auth.admin.deleteUser(id);
});

describe("sender keys", () => {
  it("the database fills them when the code didn't: email address, DM id, comment handle", async () => {
    const { data } = await db
      .from("inbound_items")
      .select("id, sender_key, group_key")
      .in("id", [ids.carla1, ids.carla2, ids.maya2, ids.jess1, ids.jess2, ids.review1]);
    const by = new Map((data ?? []).map((r) => [r.id, r]));
    expect(by.get(ids.carla1)?.sender_key).toBe("carla@example.com");
    expect(by.get(ids.carla2)?.sender_key).toBe("carla@example.com");
    expect(by.get(ids.carla1)?.group_key).toBe(by.get(ids.carla2)?.group_key);
    expect(by.get(ids.maya2)?.sender_key).toBe("ig_maya");
    expect(by.get(ids.jess1)?.sender_key).toBe("name:jess.bakes");
    expect(by.get(ids.jess1)?.group_key).toBe(by.get(ids.jess2)?.group_key);
    expect(by.get(ids.review1)?.sender_key).toBeNull();
    expect(by.get(ids.review1)?.group_key).toBe(`i:${ids.review1}`);
  });
});

describe("the grouped list", () => {
  it("For you: one row per sender, needs you now first, newsletters left out", async () => {
    const rows = await loadInboxConversations(owner.client, tenant, {
      tab: "for_you",
      filters: DEFAULT_FILTERS,
    });
    const names = rows.map((r) => r.text);
    // Maya (lead) and the 1-star review need the owner now; Walter is ready to approve; the
    // rest also for you. Newest first inside each.
    expect(names).toEqual([
      "message maya3",
      "review review2",
      "message walter",
      "message carla2",
      "comment jess2",
      "review review1",
    ]);
    const carla = rows.find((r) => r.itemId === ids.carla2)!;
    expect(carla.threads).toBe(2);
    expect(carla.messages).toBe(2);
    const jess = rows.find((r) => r.itemId === ids.jess2)!;
    expect(jess.posts).toBe(2);
    const maya = rows.find((r) => r.itemId === ids.maya3)!;
    expect(maya.waiting).toBe(2);
    expect(maya.group).toBe("now");
    // Never opened: "new" is what waits on the owner.
    expect(maya.newMessages).toBe(2);
  });

  it("counts rows, not messages, and the headline agrees", async () => {
    const counts = await countInboxTabs(owner.client, tenant);
    expect(counts.for_you).toBe(6);
    expect(counts.answered).toBe(1);
    expect((await loadTodaySummary(owner.client, tenant)).forYou).toBe(6);
    // From customers only off: the newsletter's 5 failed threads are one more row.
    expect((await countInboxTabs(owner.client, tenant, false)).for_you).toBe(7);
    expect(await countAutomatedSenders(owner.client, tenant)).toBe(1);
  });

  it("Updates & newsletters: the automated sender as one row", async () => {
    const rows = await loadInboxConversations(owner.client, tenant, {
      tab: "for_you",
      filters: DEFAULT_FILTERS,
      automated: true,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].threads).toBe(5);
    expect(rows[0].automated).toBe(true);
  });

  it("filters by platform, type and status", async () => {
    const load = (f: Partial<typeof DEFAULT_FILTERS>) =>
      loadInboxConversations(owner.client, tenant, {
        tab: "for_you",
        filters: { ...DEFAULT_FILTERS, ...f },
      });
    expect((await load({ platforms: ["google"] })).map((r) => r.itemId)).toEqual([ids.carla2]);
    expect((await load({ types: ["email"] })).map((r) => r.itemId)).toEqual([ids.carla2]);
    expect((await load({ types: ["review"] })).length).toBe(2);
    expect((await load({ flags: ["leads"] })).map((r) => r.itemId)).toEqual([ids.maya3]);
    expect((await load({ flags: ["complaints"] })).map((r) => r.itemId)).toEqual([ids.review2]);
    expect((await load({ flags: ["ready"] })).map((r) => r.itemId).sort()).toEqual(
      [ids.maya3, ids.walter].sort(),
    );
    expect(
      (await load({ customersOnly: false, flags: ["failed"] })).map((r) => r.automated),
    ).toEqual([true]);
  });

  it("Newest: plain latest-message-first", async () => {
    const rows = await loadInboxConversations(owner.client, tenant, {
      tab: "for_you",
      filters: { ...DEFAULT_FILTERS, sort: "newest" },
    });
    expect(rows[0].itemId).toBe(ids.walter);
  });

  it("the cap counts rows: 150 messages from one sender are one row", async () => {
    const lots = await conversation(instagram, "instagram", "ig_lots");
    const many = Array.from({ length: 150 }, (_, i) => {
      const id = randomUUID();
      return {
        id,
        tenant_id: tenant,
        social_account_id: instagram,
        kind: "dm",
        zernio_message_id: `m_${id}`,
        conversation_id: lots,
        text: `lots ${i}`,
        received_at: minutesAgo(2000 + i),
        status: "escalated",
        category: "faq",
      };
    });
    const { error } = await db.from("inbound_items").insert(many);
    expect(error).toBeNull();
    const rows = await loadInboxConversations(owner.client, tenant, {
      tab: "for_you",
      filters: DEFAULT_FILTERS,
    });
    expect(rows).toHaveLength(7);
    expect(rows.find((r) => r.text === "lots 0")?.messages).toBe(150);
    await db.from("inbound_items").delete().eq("conversation_id", lots);
  });

  it('"N new" counts from when this login last opened the row', async () => {
    const group = (
      await db.from("inbound_items").select("group_key").eq("id", ids.maya3).single()
    ).data!.group_key!;
    const { error } = await owner.client.from("inbox_reads").upsert(
      { tenant_id: tenant, user_id: owner.userId, group_key: group, seen_at: minutesAgo(25) },
      { onConflict: "tenant_id,user_id,group_key" },
    );
    expect(error).toBeNull();
    const rows = await loadInboxConversations(owner.client, tenant, {
      tab: "for_you",
      filters: { ...DEFAULT_FILTERS, flags: ["unread"] },
    });
    expect(rows.find((r) => r.itemId === ids.maya3)?.newMessages).toBe(1);
  });
});

describe("RLS on the new tables and the list", () => {
  it("a stranger lists nothing and counts nothing", async () => {
    const { data } = await stranger.client.rpc("inbox_conversations", {
      p_tenant_id: tenant,
      p_statuses: ["escalated", "awaiting_approval", "awaiting_draft", "failed"],
    });
    expect(data).toEqual([]);
    const { data: n } = await stranger.client.rpc("inbox_conversation_count", {
      p_tenant_id: tenant,
      p_statuses: ["escalated"],
    });
    expect(n).toBe(0);
  });

  it("reads are per login: nobody reads or writes another's", async () => {
    const { data } = await stranger.client.from("inbox_reads").select("*").eq("tenant_id", tenant);
    expect(data).toEqual([]);
    const { error } = await stranger.client
      .from("inbox_reads")
      .insert({ tenant_id: tenant, user_id: stranger.userId, group_key: "x" });
    expect(error).not.toBeNull();
    const { error: forOther } = await owner.client
      .from("inbox_reads")
      .insert({ tenant_id: tenant, user_id: stranger.userId, group_key: "x" });
    expect(forOther).not.toBeNull();
  });

  it("senders: members read their own brand's; nobody writes them from the browser", async () => {
    const { data: mine } = await owner.client.from("inbox_senders").select("sender_key");
    expect(mine?.map((s) => s.sender_key)).toEqual(["hello@producthunt.com"]);
    const { data: theirs } = await stranger.client.from("inbox_senders").select("sender_key");
    expect(theirs).toEqual([]);
    const { error } = await owner.client
      .from("inbox_senders")
      .update({ moved_to_for_you_at: new Date().toISOString() })
      .eq("tenant_id", tenant)
      .select();
    // No update grant: an error, or nothing changed.
    const { data: still } = await db
      .from("inbox_senders")
      .select("moved_to_for_you_at")
      .eq("tenant_id", tenant)
      .single();
    expect(error !== null || still?.moved_to_for_you_at === null).toBe(true);
    expect(still?.moved_to_for_you_at).toBeNull();
  });
});

describe("one reply per conversation", () => {
  it("the draft for the latest sees the earlier waiting message, marked", async () => {
    const history = await loadThreadHistory(db, ids.maya3);
    expect(history).toEqual([
      { from: "customer", text: "message maya1" },
      { from: "customer", text: "message maya2", waiting: true },
    ]);
  });

  it("the reply going out closes the earlier waiting message as answered together", async () => {
    const closed = await closeAnsweredTogether(db, { itemId: ids.maya3, actor: "system" });
    expect(closed).toBe(1);
    const { data } = await db.from("inbound_items").select("status").eq("id", ids.maya2).single();
    expect(data?.status).toBe("handled");
    const { data: audit } = await db
      .from("audit_log")
      .select("action, details")
      .eq("item_id", ids.maya2)
      .order("created_at");
    expect(audit?.map((a) => a.action)).toEqual(["status_changed", "answered_together"]);
    expect((audit?.[0].details as { reason: string }).reason).toBe("answered_together");
    // Nothing more to close.
    expect(await closeAnsweredTogether(db, { itemId: ids.maya3, actor: "system" })).toBe(0);
  });
});
