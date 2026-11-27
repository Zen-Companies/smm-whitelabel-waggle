import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { insertInboundItem, recordConversation } from "@/features/inbox";
import { requestCheckNow, runWeeklyChecks } from "@/features/weekly/job";
import { parseWeekSummary } from "@/features/weekly/summary";
import { MockSocialProvider } from "@/lib/social/mock";
import { anonClient, serviceClient, uniqueEmail } from "./helpers";

// Weekly check-up (board "Your week", approved 26 Nov). The owner's rule: never a second draft.
// A message Waggle already has (whatever its draft) is only counted; one answered on the platform
// is "answered by you"; a DM past its reply window is counted as missed; only messages Waggle
// never saw are added, once, even when the check-up runs again. Zernio is the mock.

const db = serviceClient();
const social = new MockSocialProvider();
const NOW = new Date();
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();
const id = (p: string) => `${p}_${randomUUID().slice(0, 8)}`;
const deps = (now: Date) => ({ db, social: () => social, now });

let tenantId: string;
let userId: string;
let accountId: string;
const zernioAccountId = `acc_${randomUUID().slice(0, 8)}`;

const newComment = id("c");
const knownComment = id("c");
const ownerAnswered = id("c");
const newDm = id("m");
const knownDm = id("m");
const oldDm = id("m");
const knownConv = id("conv");

async function accountItems() {
  const { data } = await db
    .from("inbound_items")
    .select("id, kind, zernio_comment_id, platform_message_id")
    .eq("social_account_id", accountId);
  return data ?? [];
}

async function draftCount() {
  const { count } = await db
    .from("drafts")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId);
  return count ?? 0;
}

beforeAll(async () => {
  const { data } = await anonClient().auth.signUp({
    email: uniqueEmail(),
    password: "password123",
  });
  userId = data.user!.id;
  const { data: rows } = await db.rpc("create_owner_tenant", {
    p_user_id: userId,
    p_name: "Weekly Cafe",
  });
  tenantId = rows![0].tenant_id;
  const { data: account, error } = await db
    .from("social_accounts")
    .insert({
      tenant_id: tenantId,
      zernio_account_id: zernioAccountId,
      platform: "instagram",
      username: "weeklycafe",
    })
    .select("id")
    .single();
  if (error) throw error;
  accountId = account.id;

  // What Waggle already had: a comment whose draft the owner threw away, and a DM with a draft
  // waiting for approval.
  const comment = await insertInboundItem(db, {
    kind: "comment",
    tenantId,
    socialAccountId: accountId,
    zernioCommentId: knownComment,
    zernioPostId: "post_1",
    authorName: "jo",
    text: "Do you have oat milk?",
    receivedAt: hoursAgo(50),
  });
  const conversation = await recordConversation(db, {
    tenantId,
    socialAccountId: accountId,
    zernioConversationId: knownConv,
    platform: "instagram",
    participantName: "Sam",
    participantExternalId: "ig_sam",
    customerMessageAt: hoursAgo(5),
  });
  if ("foreign" in conversation) throw new Error("conversation belongs elsewhere");
  const dm = await insertInboundItem(db, {
    kind: "dm",
    tenantId,
    socialAccountId: accountId,
    zernioMessageId: id("zmsg"),
    conversationId: conversation.conversationId,
    platformMessageId: knownDm,
    authorName: "Sam",
    text: "Are you open late?",
    receivedAt: hoursAgo(5),
  });
  const { error: draftError } = await db.from("drafts").insert([
    { tenant_id: tenantId, item_id: comment.itemId, body: "Yes!", status: "rejected" },
    { tenant_id: tenantId, item_id: dm.itemId, body: "Until 9.", status: "pending" },
  ]);
  if (draftError) throw draftError;

  social.catchUpPosts = [
    {
      postId: "post_1",
      caption: "New menu",
      comments: [
        {
          id: newComment,
          text: "How much is the brunch?",
          authorName: "mika",
          fromOwner: false,
          createdAt: hoursAgo(30),
        },
        {
          id: knownComment,
          text: "Do you have oat milk?",
          authorName: "jo",
          fromOwner: false,
          createdAt: hoursAgo(50),
        },
        {
          id: ownerAnswered,
          text: "Open on Sunday?",
          authorName: "bea",
          fromOwner: false,
          createdAt: hoursAgo(40),
          ownerReplied: true,
        },
        {
          id: id("c"),
          text: "love this! 😍",
          authorName: "cy",
          fromOwner: false,
          createdAt: hoursAgo(20),
        },
      ],
    },
  ];
  social.catchUpConversations = [
    {
      id: id("conv"),
      participantId: "ig_lena",
      participantName: "Lena",
      updatedTime: hoursAgo(3),
      messages: [
        { id: newDm, direction: "incoming", text: "Table for 4?", createdAt: hoursAgo(3) },
      ],
    },
    {
      id: knownConv,
      participantId: "ig_sam",
      participantName: "Sam",
      updatedTime: hoursAgo(5),
      messages: [
        { id: knownDm, direction: "incoming", text: "Are you open late?", createdAt: hoursAgo(5) },
      ],
    },
    {
      id: id("conv"),
      participantId: "ig_chris",
      participantName: "Chris",
      updatedTime: hoursAgo(72),
      messages: [
        { id: oldDm, direction: "incoming", text: "Still open?", createdAt: hoursAgo(72) },
      ],
    },
    {
      id: id("conv"),
      participantId: "ig_al",
      participantName: "Al",
      updatedTime: hoursAgo(9),
      messages: [
        { id: id("m"), direction: "incoming", text: "Parking?", createdAt: hoursAgo(10) },
        { id: id("m"), direction: "outgoing", text: "Behind us.", createdAt: hoursAgo(9) },
      ],
    },
  ];
});

afterAll(async () => {
  await db.from("tenants").delete().eq("id", tenantId);
  await db.auth.admin.deleteUser(userId);
});

describe("weekly check-up", () => {
  let firstRun: string;

  it("Check now adds only what Waggle never saw, once", async () => {
    const before = await draftCount();
    const asked = await requestCheckNow(db, { tenantId, userId, now: NOW });
    expect(asked.outcome).toBe("started");
    if (asked.outcome !== "started") return;
    firstRun = asked.runId;

    // While it runs, a second Check now (or the Monday run) can't start another.
    expect((await requestCheckNow(db, { tenantId, userId, now: NOW })).outcome).toBe("running");
    const { error: clash } = await db.from("weekly_checks").insert({
      tenant_id: tenantId,
      trigger: "monday",
      week_start: "2026-11-30",
      window_start: hoursAgo(7 * 24),
      window_end: NOW.toISOString(),
    });
    expect(clash?.code).toBe("23505");

    const result = await runWeeklyChecks(deps(NOW), { tenantId });
    expect(result).toMatchObject({ runs: 1, finished: 1, found: 2 });

    const items = await accountItems();
    expect(items).toHaveLength(4);
    expect(items.filter((i) => i.zernio_comment_id === newComment)).toHaveLength(1);
    expect(items.filter((i) => i.platform_message_id === newDm)).toHaveLength(1);
    // Already had: still one each, and no new drafts written by the check-up itself.
    expect(items.filter((i) => i.zernio_comment_id === knownComment)).toHaveLength(1);
    expect(items.filter((i) => i.platform_message_id === knownDm)).toHaveLength(1);
    expect(items.some((i) => i.zernio_comment_id === ownerAnswered)).toBe(false);
    expect(items.some((i) => i.platform_message_id === oldDm)).toBe(false);
    expect(await draftCount()).toBe(before);

    const { data: run } = await db
      .from("weekly_checks")
      .select("status, summary, email_status")
      .eq("id", firstRun)
      .single();
    expect(run!.status).toBe("done");
    // Check now never emails.
    expect(run!.email_status).toBe("none");
    const summary = parseWeekSummary(run!.summary)!;
    expect(summary).toMatchObject({
      found: 2,
      tooOld: 1,
      // The comment answered on Instagram and the DM answered there.
      answeredByYou: 2,
    });
    // 4 items Waggle has + 2 answered by you + 1 too old + 1 praise.
    expect(summary.cameIn).toBe(8);
    expect(summary.accounts).toEqual([
      expect.objectContaining({ id: accountId, state: "read", count: 8 }),
    ]);

    const { data: audit } = await db
      .from("audit_log")
      .select("action")
      .eq("tenant_id", tenantId)
      .in("action", [
        "weekly_check_now_requested",
        "weekly_check_started",
        "weekly_check_finished",
      ]);
    expect(new Set((audit ?? []).map((a) => a.action)).size).toBe(3);
  });

  it("Check now works once a day", async () => {
    const again = await requestCheckNow(db, {
      tenantId,
      userId,
      now: new Date(NOW.getTime() + 60_000),
    });
    expect(again.outcome).toBe("used");
  });

  it("a second check-up over the same week adds nothing and drafts nothing", async () => {
    const before = await draftCount();
    const { data: monday, error } = await db
      .from("weekly_checks")
      .insert({
        tenant_id: tenantId,
        trigger: "monday",
        week_start: "2026-11-30",
        window_start: hoursAgo(7 * 24),
        window_end: new Date(NOW.getTime() + 1000).toISOString(),
      })
      .select("id")
      .single();
    if (error) throw error;

    const result = await runWeeklyChecks(deps(NOW), { tenantId });
    expect(result).toMatchObject({ runs: 1, finished: 1, found: 0 });
    expect(await accountItems()).toHaveLength(4);
    expect(await draftCount()).toBe(before);

    const { data: run } = await db
      .from("weekly_checks")
      .select("summary, email_status")
      .eq("id", monday.id)
      .single();
    const summary = parseWeekSummary(run!.summary)!;
    expect(summary).toMatchObject({ found: 0, tooOld: 1, answeredByYou: 2, cameIn: 8 });
    // The Monday run's email waits for the email step.
    expect(run!.email_status).toBe("pending");
  });
});
