import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { handleAccountConnected } from "@/features/accounts/events";
import { runCatchUps } from "@/features/catch-up/job";
import { insertInboundItem } from "@/features/inbox/items";
import { MockSocialProvider } from "@/lib/social/mock";
import { anonClient, serviceClient, uniqueEmail } from "./helpers";

// First-connect catch-up (19 Nov): 30 days of comments and DMs on the first connect. DMs within
// 24 hours become items, older unanswered ones are only listed, and a later webhook for a pulled
// DM never makes a second item. Zernio is the mock.

const db = serviceClient();
const social = new MockSocialProvider();
const deps = (now: Date) => ({ db, social: () => social, now });
const run = (now: Date) => runCatchUps(deps(now), { tenantId });
let tenantId: string;
let userId: string;
let accountId: string;
const zernioAccountId = `acc_${randomUUID().slice(0, 8)}`;
const NOW = new Date();
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();
const id = (p: string) => `${p}_${randomUUID().slice(0, 8)}`;

const fresh = id("c");
const answered = id("c");
const tooOld = id("c");
const recentDm = id("m");
const oldDm = id("m");
const repliedConv = id("conv");

beforeAll(async () => {
  const { data } = await anonClient().auth.signUp({
    email: uniqueEmail(),
    password: "password123",
  });
  userId = data.user!.id;
  const { data: rows } = await db.rpc("create_owner_tenant", {
    p_user_id: userId,
    p_name: "Catch-up Cafe",
  });
  tenantId = rows![0].tenant_id;

  social.catchUpPosts = [
    {
      postId: id("post"),
      comments: [
        {
          id: fresh,
          text: "Open Sunday?",
          authorName: "mika",
          fromOwner: false,
          createdAt: hoursAgo(72),
        },
        {
          id: answered,
          text: "Price?",
          authorName: "jo",
          fromOwner: false,
          createdAt: hoursAgo(80),
          ownerReplied: true,
        },
        {
          id: tooOld,
          text: "Old",
          authorName: "al",
          fromOwner: false,
          createdAt: hoursAgo(40 * 24),
        },
      ],
    },
  ];
  social.catchUpConversations = [
    {
      id: id("conv"),
      participantId: "ig_1",
      participantName: "Lena",
      updatedTime: hoursAgo(2),
      messages: [
        { id: recentDm, direction: "incoming", text: "Table for 4?", createdAt: hoursAgo(2) },
      ],
    },
    {
      id: id("conv"),
      participantId: "ig_2",
      participantName: "Chris",
      updatedTime: hoursAgo(72),
      messages: [
        { id: oldDm, direction: "incoming", text: "Still open?", createdAt: hoursAgo(72) },
      ],
    },
    {
      id: repliedConv,
      participantId: "ig_3",
      participantName: "Sam",
      updatedTime: hoursAgo(5),
      messages: [
        { id: id("m"), direction: "incoming", text: "Hi", createdAt: hoursAgo(6) },
        { id: id("m"), direction: "outgoing", text: "Hello!", createdAt: hoursAgo(5) },
      ],
    },
  ];
});

afterAll(async () => {
  await db.from("tenants").delete().eq("id", tenantId);
  await db.auth.admin.deleteUser(userId);
});

describe("first-connect catch-up", () => {
  it("a first connect asks for a catch-up instead of the 24-hour backfill", async () => {
    const result = await handleAccountConnected(db, {
      tenantId,
      zernioAccountId,
      platform: "instagram",
      username: "catchupcafe",
    });
    expect(result.outcome).toBe("created");
    accountId = result.accountId;
    const { data: account } = await db
      .from("social_accounts")
      .select("backfill_from")
      .eq("id", accountId)
      .single();
    expect(account!.backfill_from).toBeNull();
    const { data: row } = await db
      .from("catch_ups")
      .select("stage")
      .eq("social_account_id", accountId)
      .single();
    expect(row!.stage).toBe("comments");
  });

  it("drafts unanswered comments and recent DMs; older DMs are only listed", async () => {
    const first = await run(new Date());
    expect(first).toMatchObject({ comments: 1, dms: 1, missed: 1 });

    const { data: items } = await db
      .from("inbound_items")
      .select("kind, status, zernio_comment_id, platform_message_id")
      .eq("social_account_id", accountId)
      .order("kind");
    expect(items).toEqual([
      { kind: "comment", status: "new", zernio_comment_id: fresh, platform_message_id: null },
      { kind: "dm", status: "new", zernio_comment_id: null, platform_message_id: recentDm },
    ]);
    const { data: missed } = await db
      .from("missed_messages")
      .select("platform_message_id, sender_name")
      .eq("social_account_id", accountId);
    expect(missed).toEqual([{ platform_message_id: oldDm, sender_name: "Chris" }]);

    // DMs are swept once more a little later (Zernio's replay can finish late).
    const { data: row } = await db
      .from("catch_ups")
      .select("stage, comments_created, dms_created")
      .eq("social_account_id", accountId)
      .single();
    expect(row).toEqual({ stage: "dms_again", comments_created: 1, dms_created: 1 });
  });

  it("the second sweep creates nothing twice, then it's done", async () => {
    const later = new Date(Date.now() + 16 * 60_000);
    expect(await run(later)).toMatchObject({ dms: 0, missed: 0, finished: 1 });
    const { count } = await db
      .from("inbound_items")
      .select("id", { count: "exact", head: true })
      .eq("social_account_id", accountId);
    expect(count).toBe(2);
    const { data: row } = await db
      .from("catch_ups")
      .select("stage, finished_at")
      .eq("social_account_id", accountId)
      .single();
    expect(row!.stage).toBe("done");
    expect(row!.finished_at).not.toBeNull();
  });

  it("a later webhook for a pulled DM finds the same item", async () => {
    const { data: item } = await db
      .from("inbound_items")
      .select("id, conversation_id")
      .eq("platform_message_id", recentDm)
      .single();
    const again = await insertInboundItem(db, {
      kind: "dm",
      tenantId,
      socialAccountId: accountId,
      zernioMessageId: id("zernio"),
      conversationId: item!.conversation_id!,
      platformMessageId: recentDm,
      authorName: "Lena",
      text: "Table for 4?",
      receivedAt: hoursAgo(2),
    });
    expect(again).toEqual({ itemId: item!.id, created: false });
  });

  it("a reconnect keeps the 24-hour backfill and starts no second catch-up", async () => {
    await db.from("social_accounts").update({ status: "disconnected" }).eq("id", accountId);
    const result = await handleAccountConnected(db, {
      tenantId,
      zernioAccountId,
      platform: "instagram",
      username: "catchupcafe",
    });
    expect(result.outcome).not.toBe("created");
    const { data: account } = await db
      .from("social_accounts")
      .select("backfill_from")
      .eq("id", accountId)
      .single();
    expect(account!.backfill_from).not.toBeNull();
    const { count } = await db
      .from("catch_ups")
      .select("id", { count: "exact", head: true })
      .eq("social_account_id", accountId);
    expect(count).toBe(1);
  });
});
