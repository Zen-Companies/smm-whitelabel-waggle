import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { POST } from "@/app/api/webhooks/zernio/route";
import { handlePlatformPause } from "@/features/alerts/platform";
import type { Email, Mailer } from "@/lib/email/mailer";
import { approveDraft } from "@/features/approvals/decisions";
import { createSendStep } from "@/features/approvals/send-step";
import { processDueItems } from "@/features/inbox/processor";
import { signZernioBody } from "@/features/inbox/signature";
import { createDeadline } from "@/lib/jobs";
import { MockSocialProvider } from "@/lib/social/mock";
import { clearPlatformPause, getPlatformPause } from "@/lib/social/platform-pause";
import { SocialProviderError } from "@/lib/social/types";
import { anonClient, claimFor, serviceClient, uniqueEmail } from "./helpers";

// docs/tasks.md T12: an approved reply posts exactly once; an expired DM window escalates.
// Zernio is the in-process mock (rule 14); failures are scripted per call.
type Failure = { error: SocialProviderError; delivered?: boolean };

class ScriptedSocial extends MockSocialProvider {
  script: Failure[] = [];
  sendCalls: { kind: string; idempotencyKey: string; message: string }[] = [];

  private async scripted<T>(
    kind: string,
    input: { idempotencyKey: string; message: string },
    send: () => Promise<T>,
  ) {
    this.sendCalls.push({ kind, idempotencyKey: input.idempotencyKey, message: input.message });
    const failure = this.script.shift();
    if (failure) {
      // Delivered but the response was lost (5xx after the fact, timeout).
      if (failure.delivered) await send();
      throw failure.error;
    }
    return send();
  }
  override replyToComment(input: Parameters<MockSocialProvider["replyToComment"]>[0]) {
    return this.scripted("comment", input, () => super.replyToComment(input));
  }
  override sendDm(input: Parameters<MockSocialProvider["sendDm"]>[0]) {
    return this.scripted("dm", input, () => super.sendDm(input));
  }
  override sendPrivateReply(input: Parameters<MockSocialProvider["sendPrivateReply"]>[0]) {
    return this.scripted(
      "private_reply",
      { idempotencyKey: `private:${input.commentId}`, message: input.message },
      () => super.sendPrivateReply(input),
    );
  }
}

const err = (status: number | undefined, extra: Partial<SocialProviderError["details"]> = {}) =>
  new SocialProviderError(`Zernio send failed (${status ?? "timeout"})`, {
    status,
    ambiguous: status === undefined || status >= 500,
    ...extra,
  });

const db = serviceClient();
let social: ScriptedSocial;
let tenantId: string;
let userId: string;
let profileId: string;
let accountId: string;
let zernioAccountId: string;

const run = () =>
  processDueItems({
    db,
    steps: { sending: createSendStep({ social: () => social }) },
    deadline: createDeadline(),
    claim: claimFor(() => tenantId),
  });

async function approvedItem(opts: {
  kind: "comment" | "dm";
  lastCustomerMessageAgoMs?: number;
  edit?: string;
  category?: "faq" | "lead";
  /** T41: answer a comment in the commenter's DMs. */
  replyVia?: "public" | "dm";
  receivedAgoMs?: number;
}) {
  const itemId = randomUUID();
  let conversationId: string | null = null;
  if (opts.kind === "dm") {
    const { data } = await db
      .from("conversations")
      .insert({
        tenant_id: tenantId,
        social_account_id: accountId,
        zernio_conversation_id: `conv_${randomUUID()}`,
        platform: "instagram",
        last_customer_message_at: new Date(
          Date.now() - (opts.lastCustomerMessageAgoMs ?? 60_000),
        ).toISOString(),
      })
      .select("id")
      .single();
    conversationId = data!.id;
  }
  const { error } = await db.from("inbound_items").insert({
    id: itemId,
    tenant_id: tenantId,
    social_account_id: accountId,
    kind: opts.kind,
    ...(opts.kind === "comment"
      ? { zernio_comment_id: `c_${itemId}`, zernio_post_id: "1789000" }
      : { zernio_message_id: `m_${itemId}`, conversation_id: conversationId }),
    text: "Open on Sunday?",
    received_at: new Date(Date.now() - (opts.receivedAgoMs ?? 0)).toISOString(),
    status: "awaiting_approval",
    category: opts.category ?? "faq",
    confidence: 0.95,
  });
  if (error) throw error;
  const { data: draft } = await db
    .from("drafts")
    .insert({ tenant_id: tenantId, item_id: itemId, body: "Sundays 8am to 10pm.", model: "test" })
    .select("id, idempotency_key")
    .single();
  const result = await approveDraft(db, {
    tenantId,
    userId,
    itemId,
    draftId: draft!.id,
    editedBody: opts.edit ?? "Sundays 8am to 10pm.",
    replyVia: opts.replyVia,
  });
  expect(result).toEqual({ ok: true });
  // As if the 8-second undo window had passed (approveDraft holds the reply until then).
  await db.from("inbound_items").update({ next_run_at: null }).eq("id", itemId);
  return { itemId, draftId: draft!.id, key: draft!.idempotency_key };
}

const state = async (itemId: string) => {
  const item = (
    await db
      .from("inbound_items")
      .select("status, attempts, next_run_at, last_error")
      .eq("id", itemId)
      .single()
  ).data!;
  const draft = (
    await db
      .from("drafts")
      .select("status, zernio_reply_id, sent_at, send_attempted_at")
      .eq("item_id", itemId)
      .single()
  ).data!;
  const audit =
    (await db.from("audit_log").select("action, details").eq("item_id", itemId).order("created_at"))
      .data ?? [];
  return { item, draft, audit };
};
/** Make a retried item due now instead of after its backoff. */
const dueNow = (itemId: string) =>
  db.from("inbound_items").update({ next_run_at: null }).eq("id", itemId);
const sendsFor = (key: string) => social.sendCalls.filter((c) => c.idempotencyKey === key);

beforeAll(async () => {
  const { data } = await anonClient().auth.signUp({
    email: uniqueEmail(),
    password: "password123",
  });
  userId = data.user!.id;
  const { data: rows } = await db.rpc("create_owner_tenant", {
    p_user_id: userId,
    p_name: "Sending Cafe",
  });
  tenantId = rows![0].tenant_id;
  profileId = `prof_${randomUUID().slice(0, 8)}`;
  await db.from("tenants").update({ zernio_profile_id: profileId }).eq("id", tenantId);
  zernioAccountId = `acc_${randomUUID().slice(0, 8)}`;
  const { data: account } = await db
    .from("social_accounts")
    .insert({ tenant_id: tenantId, zernio_account_id: zernioAccountId, platform: "instagram" })
    .select("id")
    .single();
  accountId = account!.id;
});

afterAll(async () => {
  await db.from("tenants").delete().eq("id", tenantId);
  await db.auth.admin.deleteUser(userId);
});

describe("send step", () => {
  it("an approved comment reply posts exactly once, with the draft's idempotency key", async () => {
    social = new ScriptedSocial();
    const { itemId, key } = await approvedItem({ kind: "comment", edit: "Yes! Sundays 8 to 10." });

    await run();
    await run();

    const { item, draft, audit } = await state(itemId);
    expect(item.status).toBe("sent");
    expect(sendsFor(key)).toEqual([
      { kind: "comment", idempotencyKey: key, message: "Yes! Sundays 8 to 10." },
    ]);
    expect(social.sends).toEqual([
      expect.objectContaining({
        kind: "comment",
        accountId: zernioAccountId,
        targetId: `c_${itemId}`,
      }),
    ]);
    expect(draft).toMatchObject({ status: "sent", send_attempted_at: null });
    expect(draft.zernio_reply_id).toBe(social.sends[0].providerId);
    expect(draft.sent_at).not.toBeNull();
    expect(audit.map((a) => a.action)).toContain("reply_sent");
    expect(JSON.stringify(audit)).not.toContain("Sundays");
  });

  it("a DM inside the 24-hour window is sent", async () => {
    social = new ScriptedSocial();
    const { itemId, key } = await approvedItem({
      kind: "dm",
      lastCustomerMessageAgoMs: 23 * 3_600_000,
    });

    await run();

    expect((await state(itemId)).item.status).toBe("sent");
    expect(sendsFor(key)).toHaveLength(1);
    expect(social.sends.at(-1)).toMatchObject({ kind: "dm" });
  });

  it("a DM whose window closed while waiting escalates without calling Zernio", async () => {
    social = new ScriptedSocial();
    const { itemId, key } = await approvedItem({
      kind: "dm",
      lastCustomerMessageAgoMs: 25 * 3_600_000,
    });

    await run();

    const { item, draft, audit } = await state(itemId);
    expect(item.status).toBe("escalated");
    expect(sendsFor(key)).toEqual([]);
    expect(draft.status).toBe("approved");
    expect(audit.at(-1)?.details).toMatchObject({
      to: "escalated",
      policyReason: "dm_window_closed",
    });
  });

  it("a 500 after delivery: the retry reconciles and does not send again", async () => {
    social = new ScriptedSocial();
    social.script.push({ error: err(500), delivered: true });
    const { itemId, key } = await approvedItem({ kind: "dm" });

    await run();
    let s = await state(itemId);
    expect(s.item).toMatchObject({ status: "sending", attempts: 1 });
    expect(s.draft.send_attempted_at).not.toBeNull();

    await dueNow(itemId);
    await run();

    s = await state(itemId);
    expect(s.item.status).toBe("sent");
    expect(sendsFor(key)).toHaveLength(1);
    expect(s.draft.zernio_reply_id).toBe(social.sends.at(-1)!.providerId);
    expect(s.audit.find((a) => a.action === "reply_sent")?.details).toMatchObject({
      reconciled: true,
    });
  });

  it("a comment timeout after delivery is found among the comment's replies", async () => {
    social = new ScriptedSocial();
    social.script.push({ error: err(undefined), delivered: true });
    const { itemId, key } = await approvedItem({ kind: "comment" });

    await run();
    await dueNow(itemId);
    await run();

    expect((await state(itemId)).item.status).toBe("sent");
    expect(sendsFor(key)).toHaveLength(1);
  });

  it("a 500 that never arrived: the retry finds nothing and resends with the same key", async () => {
    social = new ScriptedSocial();
    social.script.push({ error: err(502) });
    const { itemId, key } = await approvedItem({ kind: "dm" });

    await run();
    await dueNow(itemId);
    await run();

    expect((await state(itemId)).item.status).toBe("sent");
    expect(sendsFor(key).map((c) => c.idempotencyKey)).toEqual([key, key]);
    expect(social.sends.filter((x) => x.idempotencyKey === key)).toHaveLength(1);
  });

  it("three ambiguous failures: failed and escalated, never more than 3 sends", async () => {
    social = new ScriptedSocial();
    social.script.push({ error: err(500) }, { error: err(500) }, { error: err(500) });
    const { itemId, key } = await approvedItem({ kind: "comment" });

    for (let i = 0; i < 3; i++) {
      await run();
      await dueNow(itemId);
    }

    const { item, audit } = await state(itemId);
    expect(item.status).toBe("failed");
    expect(sendsFor(key)).toHaveLength(3);
    expect(audit.some((a) => a.action === "escalated")).toBe(true);
  });

  it("429 waits for X-RateLimit-Reset and doesn't count an attempt", async () => {
    social = new ScriptedSocial();
    social.script.push({ error: err(429, { retryAfterSeconds: 120 }) });
    const { itemId } = await approvedItem({ kind: "comment" });
    const before = Date.now();

    await run();

    const { item, draft } = await state(itemId);
    expect(item).toMatchObject({ status: "sending", attempts: 0 });
    const wait = new Date(item.next_run_at!).getTime() - before;
    expect(wait).toBeGreaterThan(110_000);
    expect(wait).toBeLessThan(130_000);
    expect(draft.send_attempted_at).toBeNull();
  });

  it("a definite refusal (400) escalates at once and marks the draft failed", async () => {
    social = new ScriptedSocial();
    social.script.push({ error: err(400, { code: "platform_api_error" }) });
    const { itemId, key } = await approvedItem({ kind: "comment" });

    await run();

    const { item, draft, audit } = await state(itemId);
    expect(item.status).toBe("escalated");
    expect(draft.status).toBe("failed");
    expect(sendsFor(key)).toHaveLength(1);
    expect(audit.find((a) => a.action === "send_failed")?.details).toMatchObject({
      status: 400,
      code: "platform_api_error",
    });
  });

  it("an account that disconnected while the reply waited: escalated, nothing sent", async () => {
    social = new ScriptedSocial();
    const { itemId, key } = await approvedItem({ kind: "comment" });
    await db.from("social_accounts").update({ status: "disconnected" }).eq("id", accountId);
    try {
      await run();
    } finally {
      await db.from("social_accounts").update({ status: "active" }).eq("id", accountId);
    }

    const { item, audit } = await state(itemId);
    expect(item.status).toBe("escalated");
    expect(sendsFor(key)).toEqual([]);
    expect(audit.at(-1)?.details).toMatchObject({ policyReason: "account_inactive" });
  });

  it("auto-approved, then the owner switched to approve: back to the inbox, not sent", async () => {
    social = new ScriptedSocial();
    const { itemId, draftId, key } = await approvedItem({ kind: "comment", category: "lead" });
    // As if the policy step had auto-approved it (no owner).
    await db.from("drafts").update({ decided_by: null }).eq("id", draftId);
    await db
      .from("autonomy_settings")
      .update({ mode: "approve" })
      .eq("tenant_id", tenantId)
      .eq("category", "lead");

    await run();

    const { item, draft } = await state(itemId);
    expect(item.status).toBe("awaiting_approval");
    expect(draft.status).toBe("pending");
    expect(sendsFor(key)).toEqual([]);
  });
});

describe("Pause all replies (T27)", () => {
  it("an approved reply is held without an attempt, then sent once replies are back on", async () => {
    social = new ScriptedSocial();
    const { itemId, key } = await approvedItem({ kind: "comment" });
    await db.from("tenants").update({ replies_paused: true }).eq("id", tenantId);
    try {
      await run();
      const held = await state(itemId);
      expect(held.item).toMatchObject({ status: "sending", attempts: 0 });
      expect(sendsFor(key)).toEqual([]);
    } finally {
      await db.from("tenants").update({ replies_paused: false }).eq("id", tenantId);
    }

    await dueNow(itemId);
    await run();
    expect((await state(itemId)).item.status).toBe("sent");
    expect(sendsFor(key)).toHaveLength(1);
  });

  it("an auto-approved reply goes back to the owner instead", async () => {
    social = new ScriptedSocial();
    const { itemId, draftId, key } = await approvedItem({ kind: "comment" });
    await db.from("drafts").update({ decided_by: null }).eq("id", draftId);
    await db
      .from("autonomy_settings")
      .update({ mode: "auto" })
      .eq("tenant_id", tenantId)
      .eq("category", "faq");
    await db.from("tenants").update({ replies_paused: true }).eq("id", tenantId);
    try {
      await run();
    } finally {
      await db.from("tenants").update({ replies_paused: false }).eq("id", tenantId);
      await db
        .from("autonomy_settings")
        .update({ mode: "approve" })
        .eq("tenant_id", tenantId)
        .eq("category", "faq");
    }

    const { item, draft } = await state(itemId);
    expect(item.status).toBe("awaiting_approval");
    expect(draft.status).toBe("pending");
    expect(sendsFor(key)).toEqual([]);
  });
});

describe("Zernio 402 PAYMENT_REQUIRED (T19)", () => {
  const paid = () =>
    new SocialProviderError("Zernio sendDm failed (402)", {
      status: 402,
      code: "PAYMENT_REQUIRED",
      ambiguous: false,
    });

  it("pauses all sending: no attempt, no escalation; one operator alert; resumes after a good probe", async () => {
    social = new ScriptedSocial();
    social.script.push({ error: paid() });
    const first = await approvedItem({ kind: "dm" });
    const second = await approvedItem({ kind: "comment" });
    const emails: Email[] = [];
    const mailer: Mailer = {
      async send(email) {
        emails.push(email);
        return { providerId: "re_op", mode: "sent" };
      },
    };
    try {
      await run();

      // The 402 paused the platform; neither item failed, escalated or counted an attempt.
      expect(await getPlatformPause(db)).not.toBeNull();
      for (const id of [first.itemId, second.itemId]) {
        const s = await state(id);
        expect(s.item).toMatchObject({ status: "sending", attempts: 0 });
        expect(s.draft).toMatchObject({ status: "approved", send_attempted_at: null });
        expect(s.audit.some((a) => ["escalated", "send_failed"].includes(a.action))).toBe(false);
      }
      // Only one item tried Zernio (whichever was claimed first); the other waited on the
      // recorded pause without calling it.
      expect(
        social.sendCalls.filter((c) => [first.key, second.key].includes(c.idempotencyKey)),
      ).toHaveLength(1);
      const { count: alerts } = await db
        .from("alerts")
        .select("*", { count: "exact", head: true })
        .in("item_id", [first.itemId, second.itemId]);
      expect(alerts).toBe(0);

      // Job route sweep: one operator email, however many ticks; no probe yet (just paused).
      const opts = {
        db,
        social: () => social,
        mailer,
        operatorEmail: "ops@example.com",
        appUrl: "",
      };
      await handlePlatformPause(opts);
      await handlePlatformPause(opts);
      expect(emails.map((e) => e.to)).toEqual([["ops@example.com"]]);
      expect(emails[0].subject).toContain("Zernio paused");

      // Five minutes later the probe succeeds: the pause ends and both replies go out.
      const later = new Date(Date.now() + 6 * 60_000);
      expect(await handlePlatformPause({ ...opts, now: later })).toMatchObject({ resumed: true });
      expect(await getPlatformPause(db)).toBeNull();
      await dueNow(first.itemId);
      await dueNow(second.itemId);
      await run();
      expect((await state(first.itemId)).item.status).toBe("sent");
      expect((await state(second.itemId)).item.status).toBe("sent");
    } finally {
      await clearPlatformPause(db);
    }
  });

  it("a probe that still gets 402 keeps the pause and waits another 5 minutes", async () => {
    social = new ScriptedSocial();
    social.ping = async () => {
      throw paid();
    };
    const { recordPlatformPause } = await import("@/lib/social/platform-pause");
    await recordPlatformPause(db, new Date(Date.now() - 10 * 60_000));
    try {
      const result = await handlePlatformPause({
        db,
        social: () => social,
        mailer: { send: async () => ({ providerId: null, mode: "logged" }) },
        operatorEmail: undefined,
        appUrl: "",
      });
      expect(result).toMatchObject({ paused: true });
      expect(result.resumed).toBeUndefined();
      const pause = await getPlatformPause(db);
      expect(pause?.lastProbeAt && Date.parse(pause.lastProbeAt)).toBeGreaterThan(
        Date.now() - 5_000,
      );
    } finally {
      await clearPlatformPause(db);
    }
  });
});

describe("message.failed webhook", () => {
  const SECRET = "whsec_sending_test";

  async function deliverFailed(platformMessageId: string) {
    const raw = readFileSync("tests/fixtures/zernio/message-failed.json", "utf8")
      .replaceAll("__TENANT_ID__", tenantId)
      .replaceAll("__PROFILE_ID__", profileId)
      .replaceAll("__ACCOUNT_ID__", zernioAccountId)
      .replaceAll("__MESSAGE_ID__", platformMessageId);
    const payload = JSON.parse(raw);
    payload.id = `evt_failed_${randomUUID().slice(0, 8)}`;
    const body = JSON.stringify(payload);
    return POST(
      new Request("http://localhost/api/webhooks/zernio", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Zernio-Signature": signZernioBody(body, SECRET),
        },
        body,
      }),
    );
  }

  beforeAll(() => {
    process.env.ZERNIO_WEBHOOK_SECRET = SECRET;
    process.env.NEXT_PUBLIC_SUPABASE_URL = inject("supabaseUrl");
    process.env.SUPABASE_SERVICE_ROLE_KEY = inject("supabaseServiceKey");
  });

  it("a sent reply reported undelivered: draft and item fail, audited with the code only", async () => {
    social = new ScriptedSocial();
    const { itemId } = await approvedItem({ kind: "dm" });
    await run();
    const { draft } = await state(itemId);

    const res = await deliverFailed(draft.zernio_reply_id!);

    expect(await res.json()).toEqual({ outcome: "processed", detail: "delivery_failed" });
    const s = await state(itemId);
    expect(s.item.status).toBe("failed");
    expect(s.draft.status).toBe("failed");
    const audit = s.audit.find((a) => a.action === "delivery_failed");
    expect(audit?.details).toMatchObject({ code: 131047, title: "Re-engagement message" });
    expect(JSON.stringify(s.audit)).not.toContain("24 hours");
  });

  it("an unknown message id is skipped", async () => {
    const res = await deliverFailed("wamid.unknown");
    expect(await res.json()).toEqual({ outcome: "skipped", reason: "unknown_message" });
  });
});

describe("a comment answered in DM (T41)", () => {
  const dmCalls = (itemId: string) => sendsFor(`private:c_${itemId}`);

  it("goes out once as a private reply and is recorded with replyVia dm", async () => {
    const { itemId } = await approvedItem({ kind: "comment", category: "lead", replyVia: "dm" });
    await run();
    const { item, draft, audit } = await state(itemId);
    expect(item.status).toBe("sent");
    expect(draft.status).toBe("sent");
    expect(dmCalls(itemId)).toHaveLength(1);
    expect(audit.find((r) => r.action === "reply_sent")?.details).toMatchObject({
      replyVia: "dm",
      reconciled: false,
    });
  });

  it("after an unknown outcome (502), the retry is answered 'consumed': it counts as sent, once", async () => {
    const { itemId } = await approvedItem({ kind: "comment", category: "lead", replyVia: "dm" });
    social.script.push({ error: err(502), delivered: true });
    await run();
    expect((await state(itemId)).item.status).toBe("sending");
    await dueNow(itemId);
    await run();
    const { item, draft } = await state(itemId);
    expect(item.status).toBe("sent");
    expect(draft.zernio_reply_id).toBe("private_reply_consumed");
    // Two calls, but Meta's one-per-comment limit delivered it only once.
    expect(
      social.sends.filter((x) => x.kind === "private_reply" && x.targetId === `c_${itemId}`),
    ).toHaveLength(1);
  });

  it("a comment whose DM is already spent comes to the owner, then Reply publicly re-queues it", async () => {
    const { itemId } = await approvedItem({ kind: "comment", category: "lead", replyVia: "dm" });
    await social.sendPrivateReply({
      accountId: zernioAccountId,
      postId: "1789000",
      commentId: `c_${itemId}`,
      message: "someone got there first",
    });
    await run();
    const first = await state(itemId);
    expect(first.item.status).toBe("escalated");
    expect(first.draft.status).toBe("failed");
    expect(
      first.audit.find(
        (r) => r.action === "status_changed" && (r.details as { to?: string }).to === "escalated",
      )?.details,
    ).toMatchObject({ sendReason: "private_reply_used" });

    const { replyPublicly } = await import("@/features/approvals/decisions");
    expect(await replyPublicly(db, { tenantId, userId, itemId })).toEqual({ ok: true });
    const after = await db
      .from("drafts")
      .select("status, reply_via")
      .eq("item_id", itemId)
      .single();
    expect(after.data).toEqual({ status: "pending", reply_via: "public" });
    expect((await state(itemId)).item.status).toBe("awaiting_approval");
  });

  it("more than 7 days after the comment, it isn't sent in DM", async () => {
    const { itemId } = await approvedItem({
      kind: "comment",
      category: "lead",
      replyVia: "dm",
      receivedAgoMs: 8 * 24 * 60 * 60 * 1000,
    });
    await run();
    expect((await state(itemId)).item.status).toBe("escalated");
    expect(dmCalls(itemId)).toHaveLength(0);
  });

  it("approving with replyVia on a DM item is ignored: DMs answer in their own thread", async () => {
    const { itemId } = await approvedItem({ kind: "dm", replyVia: "dm" });
    const { data } = await db.from("drafts").select("reply_via").eq("item_id", itemId).single();
    expect(data?.reply_via).toBe("public");
  });
});
