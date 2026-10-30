import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from "vitest";
import { signZernioBody } from "@/features/inbox/signature";
import { POST } from "@/app/api/webhooks/zernio/route";
import { anonClient, serviceClient, uniqueEmail } from "./helpers";

// docs/tasks.md T5: verify, dedupe, map. Replaying a fixture twice creates one item; a bad
// signature returns 400. Runs the real route handler against local Supabase.
const SECRET = "whsec_integration_test";
const db = serviceClient();
const userIds: string[] = [];
const tenantIds: string[] = [];

interface Vars {
  tenantId: string;
  profileId: string;
  accountId: string;
  postId?: string;
}
let vars: Vars;

function fixture(name: string, overrides: Partial<Vars> = {}, eventId?: string) {
  const v = { ...vars, ...overrides };
  const text = readFileSync(`tests/fixtures/zernio/${name}.json`, "utf8")
    .replaceAll("__TENANT_ID__", v.tenantId)
    .replaceAll("__PROFILE_ID__", v.profileId)
    .replaceAll("__ACCOUNT_ID__", v.accountId)
    .replaceAll("__POST_ID__", v.postId ?? "post_none");
  const payload = JSON.parse(text);
  // Unique ids per test so runs don't collide on Zernio's global ids.
  payload.id = eventId ?? `${payload.id}_${randomUUID().slice(0, 8)}`;
  return payload;
}

function deliver(payload: unknown, opts: { signature?: string; raw?: string } = {}) {
  const raw = opts.raw ?? JSON.stringify(payload);
  return POST(
    new Request("http://localhost/api/webhooks/zernio", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Zernio-Signature": opts.signature ?? signZernioBody(raw, SECRET),
      },
      body: raw,
    }),
  );
}

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
  const tenantId = rows![0].tenant_id;
  tenantIds.push(tenantId);
  const profileId = `prof_${randomUUID().slice(0, 8)}`;
  await db.from("tenants").update({ zernio_profile_id: profileId }).eq("id", tenantId);
  return { tenantId, profileId };
}

const count = async (
  table: "inbound_items" | "webhook_events" | "social_accounts",
  col: string,
  val: string,
) => (await db.from(table).select("*", { count: "exact", head: true }).eq(col, val)).count;

beforeAll(async () => {
  process.env.ZERNIO_WEBHOOK_SECRET = SECRET;
  process.env.NEXT_PUBLIC_SUPABASE_URL = inject("supabaseUrl");
  process.env.SUPABASE_SERVICE_ROLE_KEY = inject("supabaseServiceKey");
});

beforeEach(async () => {
  const tenant = await newTenant("Webhook Cafe");
  vars = { ...tenant, accountId: `acc_${randomUUID().slice(0, 8)}` };
  await deliver(fixture("account-connected"));
});

afterAll(async () => {
  await db.from("tenants").delete().in("id", tenantIds);
  for (const id of userIds) await db.auth.admin.deleteUser(id);
});

function withUniqueComment<T extends { comment: { id: string } }>(payload: T): T {
  payload.comment.id = `c_${randomUUID().slice(0, 12)}`;
  return payload;
}

describe("POST /api/webhooks/zernio", () => {
  it("account.connected fixture creates the account (T4)", async () => {
    const { data } = await db
      .from("social_accounts")
      .select("tenant_id, platform, username, status")
      .eq("zernio_account_id", vars.accountId);
    expect(data).toEqual([
      { tenant_id: vars.tenantId, platform: "instagram", username: "democafe", status: "active" },
    ]);
  });

  it("a comment delivered twice creates exactly one item", async () => {
    const payload = withUniqueComment(fixture("comment-received"));

    const first = await deliver(payload);
    const second = await deliver(payload);

    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ outcome: "processed", detail: "item_created" });
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ outcome: "duplicate" });
    const { data: items } = await db
      .from("inbound_items")
      .select("tenant_id, kind, status, text, author_name, zernio_post_id, permalink")
      .eq("zernio_comment_id", payload.comment.id);
    expect(items).toEqual([
      {
        tenant_id: vars.tenantId,
        kind: "comment",
        status: "new",
        text: "What time do you open on Sunday?",
        author_name: "hungry.harriet",
        zernio_post_id: "17890000000000001",
        permalink: "https://www.instagram.com/p/DEMO01/",
      },
    ]);
    expect(await count("webhook_events", "id", payload.id)).toBe(1);
    const { data: event } = await db
      .from("webhook_events")
      .select("processed_at, error")
      .eq("id", payload.id)
      .single();
    expect(event?.processed_at).not.toBeNull();
    expect(event?.error).toBeNull();
  });

  it("the same comment under a new event id (Zernio redelivery) still makes one item", async () => {
    const payload = withUniqueComment(fixture("comment-received"));
    await deliver(payload);
    const res = await deliver({ ...payload, id: `${payload.id}_redelivered` });
    expect(await res.json()).toEqual({ outcome: "processed", detail: "item_exists" });
    expect(await count("inbound_items", "zernio_comment_id", payload.comment.id)).toBe(1);
  });

  it("rejects a bad signature with 400 and stores nothing", async () => {
    const payload = withUniqueComment(fixture("comment-received"));
    const raw = JSON.stringify(payload);

    const wrongSecret = await deliver(payload, { raw, signature: signZernioBody(raw, "other") });
    const missing = await deliver(payload, { raw, signature: "" });
    const tampered = await deliver(payload, {
      raw: raw.replace("Sunday", "Monday"),
      signature: signZernioBody(raw, SECRET),
    });

    expect([wrongSecret.status, missing.status, tampered.status]).toEqual([400, 400, 400]);
    expect(await count("webhook_events", "id", payload.id)).toBe(0);
    expect(await count("inbound_items", "zernio_comment_id", payload.comment.id)).toBe(0);
  });

  it("skips comments written by the connected account itself", async () => {
    const payload = withUniqueComment(fixture("comment-received-own-account"));
    const res = await deliver(payload);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ outcome: "skipped", reason: "own_account" });
    expect(await count("inbound_items", "zernio_comment_id", payload.comment.id)).toBe(0);
    const { data: event } = await db
      .from("webhook_events")
      .select("processed_at")
      .eq("id", payload.id)
      .single();
    expect(event?.processed_at).not.toBeNull();
  });

  it("a DM creates the conversation and one item, with the 24-hour window start", async () => {
    const payload = fixture("message-received");
    payload.message.id = `m_${randomUUID().slice(0, 12)}`;
    payload.message.conversationId = `conv_${randomUUID().slice(0, 12)}`;

    await deliver(payload);
    await deliver(payload);

    const { data: conversation } = await db
      .from("conversations")
      .select("id, tenant_id, participant_name, last_customer_message_at")
      .eq("zernio_conversation_id", payload.message.conversationId)
      .single();
    expect(conversation).toMatchObject({
      tenant_id: vars.tenantId,
      participant_name: "Sam Rivera",
    });
    expect(new Date(conversation!.last_customer_message_at!).toISOString()).toBe(
      "2026-10-28T10:00:00.000Z",
    );
    const { data: items } = await db
      .from("inbound_items")
      .select("kind, conversation_id, status")
      .eq("zernio_message_id", payload.message.id);
    expect(items).toEqual([{ kind: "dm", conversation_id: conversation!.id, status: "new" }]);
  });

  it("ignores our own outgoing messages", async () => {
    const payload = fixture("message-received-outgoing");
    payload.message.id = `m_${randomUUID().slice(0, 12)}`;
    const res = await deliver(payload);
    expect(await res.json()).toEqual({ outcome: "skipped", reason: "outgoing_message" });
    expect(await count("inbound_items", "zernio_message_id", payload.message.id)).toBe(0);
  });

  describe("tenant guard", () => {
    it("unknown externalId: stored as unknown_tenant, nothing created", async () => {
      const payload = withUniqueComment(fixture("comment-received", { tenantId: randomUUID() }));
      const res = await deliver(payload);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ outcome: "rejected", reason: "unknown_tenant" });
      const { data: event } = await db
        .from("webhook_events")
        .select("error, processed_at")
        .eq("id", payload.id)
        .single();
      expect(event?.error).toBe("unknown_tenant");
      expect(event?.processed_at).not.toBeNull();
      expect(await count("inbound_items", "zernio_comment_id", payload.comment.id)).toBe(0);
    });

    it("externalId of a real tenant but another profile id: unknown_tenant", async () => {
      const payload = withUniqueComment(fixture("comment-received", { profileId: "prof_spoofed" }));
      const res = await deliver(payload);
      expect(await res.json()).toEqual({ outcome: "rejected", reason: "unknown_tenant" });
      expect(await count("inbound_items", "zernio_comment_id", payload.comment.id)).toBe(0);
    });

    it("verified tenant + unknown account: the account is upserted and the item stored", async () => {
      const unknownAccount = `acc_${randomUUID().slice(0, 8)}`;
      const payload = withUniqueComment(fixture("comment-received", { accountId: unknownAccount }));
      payload.account.username = `new_${randomUUID().slice(0, 6)}`;

      const res = await deliver(payload);

      expect(await res.json()).toEqual({ outcome: "processed", detail: "item_created" });
      const { data: account } = await db
        .from("social_accounts")
        .select("id, tenant_id, status")
        .eq("zernio_account_id", unknownAccount)
        .single();
      expect(account).toMatchObject({ tenant_id: vars.tenantId, status: "active" });
      const { data: item } = await db
        .from("inbound_items")
        .select("social_account_id")
        .eq("zernio_comment_id", payload.comment.id)
        .single();
      expect(item?.social_account_id).toBe(account!.id);
    });

    it("an account id belonging to another tenant is never attached", async () => {
      const other = await newTenant("Other Webhook Cafe");
      const payload = withUniqueComment(
        fixture("comment-received", { tenantId: other.tenantId, profileId: other.profileId }),
      );
      const res = await deliver(payload);
      expect(await res.json()).toEqual({ outcome: "rejected", reason: "foreign_account" });
      expect(await count("inbound_items", "zernio_comment_id", payload.comment.id)).toBe(0);
    });
  });

  it("account.disconnected pauses the account's open items", async () => {
    const payload = withUniqueComment(fixture("comment-received"));
    await deliver(payload);

    const res = await deliver(fixture("account-disconnected"));

    expect(await res.json()).toEqual({ outcome: "processed", detail: "account_disconnected" });
    const { data: item } = await db
      .from("inbound_items")
      .select("status")
      .eq("zernio_comment_id", payload.comment.id)
      .single();
    expect(item?.status).toBe("paused");
  });

  it("post.* events update the post's status and error", async () => {
    const postId = `post_${randomUUID().slice(0, 8)}`;
    const { data: account } = await db
      .from("social_accounts")
      .select("id")
      .eq("zernio_account_id", vars.accountId)
      .single();
    await db.from("posts").insert({
      tenant_id: vars.tenantId,
      content: "Fresh croissants today!",
      target_account_ids: [account!.id],
      status: "scheduled",
      zernio_post_id: postId,
    });

    await deliver(fixture("post-failed", { postId }));
    const { data: failed } = await db
      .from("posts")
      .select("status, last_error")
      .eq("zernio_post_id", postId)
      .single();
    expect(failed).toEqual({
      status: "failed",
      last_error: "instagram: Media could not be processed",
    });

    await deliver(fixture("post-published", { postId }));
    const { data: published } = await db
      .from("posts")
      .select("status, last_error")
      .eq("zernio_post_id", postId)
      .single();
    expect(published).toEqual({ status: "published", last_error: null });
  });

  it("Zernio test events are stored but not mapped", async () => {
    const payload = fixture("webhook-test");
    const res = await deliver(payload);
    expect(await res.json()).toEqual({ outcome: "skipped", reason: "test_event" });
    expect(await count("inbound_items", "zernio_comment_id", payload.comment.id)).toBe(0);
  });

  it("rejects valid-signature bodies that aren't JSON or Zernio events with 400", async () => {
    const notJson = await deliver(null, { raw: "not json" });
    const noId = await deliver({ event: "comment.received" });
    expect([notJson.status, noId.status]).toEqual([400, 400]);
  });

  it("answers fast (well under Zernio's 5 s)", async () => {
    const payload = withUniqueComment(fixture("comment-received"));
    const started = performance.now();
    await deliver(payload);
    expect(performance.now() - started).toBeLessThan(1000);
  });
});
