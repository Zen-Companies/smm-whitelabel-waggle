import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { checkTelegramFor, startTelegramFor } from "@/features/accounts/telegram";
import { dmRepliesSince } from "@/features/approvals/dm-replies";
import { signZernioBody } from "@/features/inbox/signature";
import { POST } from "@/app/api/webhooks/zernio/route";
import { MockSocialProvider } from "@/lib/social";
import { anonClient, serviceClient, uniqueEmail } from "./helpers";

// T61/T62: comments, DMs and Google reviews from the newer platforms arrive like Meta's; our own
// replies coming back as comments are skipped; X stays out until its cost is decided. T60:
// Telegram's code connect records the account only when it's on the brand's own profile.
const SECRET = "whsec_integration_test";
const db = serviceClient();
const userIds: string[] = [];
const tenantIds: string[] = [];
const short = () => randomUUID().slice(0, 8);

let tenantId: string;
let profileId: string;

async function newTenant(name: string) {
  const { data } = await anonClient().auth.signUp({
    email: uniqueEmail(),
    password: "password123",
  });
  userIds.push(data.user!.id);
  const { data: rows } = await db.rpc("create_owner_tenant", {
    p_user_id: data.user!.id,
    p_name: name,
  });
  const id = rows![0].tenant_id as string;
  tenantIds.push(id);
  const profile = `prof_${short()}`;
  await db.from("tenants").update({ zernio_profile_id: profile }).eq("id", id);
  return { tenantId: id, profileId: profile, userId: data.user!.id };
}

function deliver(payload: Record<string, unknown>) {
  const raw = JSON.stringify({
    id: `evt_${short()}`,
    profiles: [{ id: profileId, externalId: tenantId }],
    ...payload,
  });
  return POST(
    new Request("http://localhost/api/webhooks/zernio", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Zernio-Signature": signZernioBody(raw, SECRET),
      },
      body: raw,
    }),
  );
}

const account = (platform: string, username: string) => {
  const id = `acc_${platform}_${short()}`;
  return { id, accountId: id, platform, username };
};

const comment = (acc: ReturnType<typeof account>, author: string, text = "Open late?") => ({
  event: "comment.received",
  comment: {
    id: `c_${short()}`,
    postId: null,
    platformPostId: `p_${short()}`,
    platform: acc.platform,
    text,
    author: { id: `u_${short()}`, username: author },
    createdAt: new Date().toISOString(),
  },
  post: { permalink: null },
  account: acc,
});

beforeAll(async () => {
  process.env.ZERNIO_WEBHOOK_SECRET = SECRET;
  process.env.NEXT_PUBLIC_SUPABASE_URL = inject("supabaseUrl");
  process.env.SUPABASE_SERVICE_ROLE_KEY = inject("supabaseServiceKey");
  ({ tenantId, profileId } = await newTenant("Platforms Cafe"));
});

afterAll(async () => {
  await db.from("tenants").delete().in("id", tenantIds);
  for (const id of userIds) await db.auth.admin.deleteUser(id);
});

describe("comments from the newer platforms", () => {
  it.each(["tiktok", "threads", "youtube", "linkedin", "bluesky"])(
    "a %s comment becomes an inbox item",
    async (platform) => {
      const acc = account(platform, "harbourbean");
      const payload = comment(acc, "kape.lover");
      const res = await deliver(payload);
      expect(await res.json()).toEqual({ outcome: "processed", detail: "item_created" });
      const { data } = await db
        .from("inbound_items")
        .select("kind, status, social_accounts (platform)")
        .eq("zernio_comment_id", payload.comment.id);
      expect(data).toEqual([{ kind: "comment", status: "new", social_accounts: { platform } }]);
    },
  );

  it("skips the account's own handle (Zernio flags its own only on Meta)", async () => {
    const acc = account("threads", "harbourbean");
    const res = await deliver(comment(acc, "@HarbourBean"));
    expect(await res.json()).toEqual({ outcome: "skipped", reason: "own_account" });
  });

  it("skips a comment that is a reply Waggle sent", async () => {
    const acc = account("linkedin", "Harbour Bean");
    const first = comment(acc, "kape.lover");
    await deliver(first);
    const { data: item } = await db
      .from("inbound_items")
      .select("id")
      .eq("zernio_comment_id", first.comment.id)
      .single();
    const ourReplyId = `c_${short()}`;
    await db.from("drafts").insert({
      tenant_id: tenantId,
      item_id: item!.id,
      body: "Yes, until 10pm!",
      status: "sent",
      zernio_reply_id: ourReplyId,
    });

    const echo = comment(acc, "someone-else", "Yes, until 10pm!");
    echo.comment.id = ourReplyId;
    const res = await deliver(echo);
    expect(await res.json()).toEqual({ outcome: "skipped", reason: "own_reply" });
  });

  it("leaves X out until its per-call cost is decided", async () => {
    const res = await deliver(comment(account("twitter", "harbourbean"), "kape.lover"));
    expect(await res.json()).toEqual({ outcome: "skipped", reason: "unsupported_platform" });
  });
});

describe("Google reviews (review.new)", () => {
  const review = (acc: ReturnType<typeof account>, over: Record<string, unknown> = {}) => ({
    event: "review.new",
    review: {
      id: `accounts/1/locations/2/reviews/${short()}`,
      platform: "googlebusiness",
      rating: 2,
      text: "Waited 30 minutes for a latte.",
      reviewer: { id: null, name: "Maria S.", profileImage: null },
      createdAt: new Date().toISOString(),
      hasReply: false,
      ...over,
    },
    account: acc,
  });

  it("becomes a review item with its stars, once", async () => {
    const acc = account("googlebusiness", "Harbour Bean Café");
    const payload = review(acc);
    expect(await (await deliver(payload)).json()).toEqual({
      outcome: "processed",
      detail: "item_created",
    });
    // Zernio delivers again (new event id, same review): still one item.
    expect(await (await deliver(payload)).json()).toEqual({
      outcome: "processed",
      detail: "item_exists",
    });
    const { data } = await db
      .from("inbound_items")
      .select("kind, author_name, review_rating, text")
      .eq("zernio_review_id", payload.review.id);
    expect(data).toEqual([
      {
        kind: "review",
        author_name: "Maria S.",
        review_rating: 2,
        text: "Waited 30 minutes for a latte.",
      },
    ]);
  });

  it("skips a review that already has a reply", async () => {
    const acc = account("googlebusiness", "Harbour Bean Café");
    const res = await deliver(review(acc, { hasReply: true }));
    expect(await res.json()).toEqual({ outcome: "skipped", reason: "already_replied" });
  });
});

describe("Google reviews answered in Google itself (review.updated, T65)", () => {
  const google = () => account("googlebusiness", "Harbour Bean Café");
  const newReview = (acc: ReturnType<typeof account>) => ({
    event: "review.new",
    review: {
      id: `accounts/1/locations/2/reviews/${short()}`,
      platform: "googlebusiness",
      rating: 2,
      text: "Slow service.",
      reviewer: { name: "Maria S." },
      createdAt: new Date().toISOString(),
      hasReply: false,
    },
    account: acc,
  });
  const updated = (acc: ReturnType<typeof account>, id: string, hasReply = true) => ({
    event: "review.updated",
    review: { id, platform: "googlebusiness", hasReply },
    account: acc,
  });
  const itemFor = async (reviewId: string) =>
    (
      await db
        .from("inbound_items")
        .select("id, status, answered_on_platform_at")
        .eq("zernio_review_id", reviewId)
        .single()
    ).data!;

  it("drops Waggle's waiting draft when the owner replied in Google", async () => {
    const acc = google();
    const review = newReview(acc);
    await deliver(review);
    const item = await itemFor(review.review.id);
    await db.from("inbound_items").update({ status: "awaiting_approval" }).eq("id", item.id);
    const { data: draft } = await db
      .from("drafts")
      .insert({ tenant_id: tenantId, item_id: item.id, body: "Sorry, Maria!", status: "pending" })
      .select("id")
      .single();

    const res = await deliver(updated(acc, review.review.id));
    expect(await res.json()).toEqual({ outcome: "processed", detail: "answered_on_platform" });
    const after = await itemFor(review.review.id);
    expect(after.status).toBe("handled");
    expect(after.answered_on_platform_at).not.toBeNull();
    const { data: d } = await db.from("drafts").select("status").eq("id", draft!.id).single();
    expect(d?.status).toBe("rejected");
  });

  it("leaves a review alone when the reply is Waggle's own (sending or sent)", async () => {
    const acc = google();
    const review = newReview(acc);
    await deliver(review);
    const item = await itemFor(review.review.id);
    await db.from("inbound_items").update({ status: "sent" }).eq("id", item.id);
    const res = await deliver(updated(acc, review.review.id));
    expect(await res.json()).toEqual({ outcome: "skipped", reason: "already_answered" });
    expect((await itemFor(review.review.id)).status).toBe("sent");
  });

  it("ignores an update without a reply, and reviews it doesn't know", async () => {
    const acc = google();
    const review = newReview(acc);
    await deliver(review);
    expect(await (await deliver(updated(acc, review.review.id, false))).json()).toEqual({
      outcome: "skipped",
      reason: "no_reply",
    });
    expect(await (await deliver(updated(acc, "accounts/9/reviews/none"))).json()).toEqual({
      outcome: "skipped",
      reason: "unknown_review",
    });
  });
});

describe("TikTok DM reply count", () => {
  it("counts the replies sent since the customer's last message", async () => {
    const acc = account("tiktok", "harbourbean");
    const conversationId = `conv_${short()}`;
    const sentAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    await deliver({
      event: "message.received",
      message: {
        id: `m_${short()}`,
        conversationId,
        platform: "tiktok",
        direction: "incoming",
        text: "Do you deliver?",
        sender: { id: "u_1", username: "kape.lover" },
        sentAt,
      },
      account: acc,
    });
    const { data: conv } = await db
      .from("conversations")
      .select("id")
      .eq("zernio_conversation_id", conversationId)
      .single();
    const { data: item } = await db
      .from("inbound_items")
      .select("id")
      .eq("conversation_id", conv!.id)
      .single();
    const sent = (minutesAgo: number) => ({
      tenant_id: tenantId,
      item_id: item!.id,
      body: "Yes!",
      status: "sent",
      sent_at: new Date(Date.now() - minutesAgo * 60 * 1000).toISOString(),
    });
    // One before the customer's message, two after.
    await db.from("drafts").insert([sent(120), sent(30), sent(10)]);

    await expect(
      dmRepliesSince(db, { platform: "tiktok", conversationId: conv!.id, since: sentAt }),
    ).resolves.toBe(2);
    // Instagram has no cap: not counted.
    await expect(
      dmRepliesSince(db, { platform: "instagram", conversationId: conv!.id, since: sentAt }),
    ).resolves.toBeUndefined();
  });
});

describe("Telegram connect (T60)", () => {
  it("waits for the code, then records the channel", async () => {
    const social = new MockSocialProvider();
    const owner = await newTenant("Telegram Cafe");
    const { code } = await startTelegramFor(
      { db, social },
      { tenantId: owner.tenantId, actor: owner.userId, profileId: owner.profileId },
    );
    const check = () =>
      checkTelegramFor(
        { db, social },
        { tenantId: owner.tenantId, profileId: owner.profileId, code },
      );
    await expect(check()).resolves.toEqual({ status: "pending" });
    await expect(check()).resolves.toEqual({
      status: "connected",
      username: "Harbour Bean Channel",
    });
    const { data } = await db
      .from("social_accounts")
      .select("platform, status")
      .eq("tenant_id", owner.tenantId);
    expect(data).toEqual([{ platform: "telegram", status: "active" }]);
  });

  it("won't attach a channel that another brand's code connected", async () => {
    const social = new MockSocialProvider();
    const victim = await newTenant("Victim Cafe");
    const thief = await newTenant("Thief Cafe");
    // The code was shown to the victim (and posted in their channel, where anyone can read it).
    const { code } = await startTelegramFor(
      { db, social },
      { tenantId: victim.tenantId, actor: victim.userId, profileId: victim.profileId },
    );
    const asThief = () =>
      checkTelegramFor(
        { db, social },
        { tenantId: thief.tenantId, profileId: thief.profileId, code },
      );
    await asThief();
    await expect(asThief()).resolves.toEqual({ status: "foreign" });
    const { count } = await db
      .from("social_accounts")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", thief.tenantId);
    expect(count).toBe(0);
  });

  it("an expired code says so", async () => {
    const social = new MockSocialProvider();
    await expect(
      checkTelegramFor({ db, social }, { tenantId, profileId, code: "ZRN-EXPIRED" }),
    ).resolves.toEqual({ status: "expired" });
  });
});
