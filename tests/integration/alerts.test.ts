import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deliverPendingAlerts } from "@/features/alerts/deliver";
import { logMailer, type Email, type Mailer } from "@/lib/email/mailer";
import { enqueueDraftNudges } from "@/features/alerts/nudges";
import { escalateClosingDmWindows } from "@/features/approvals/sweeps";
import { transitionItem } from "@/features/inbox/status";
import { anonClient, serviceClient, uniqueEmail } from "./helpers";

// docs/tasks.md T13: each alert type sends one email; leads link to the conversation.
const db = serviceClient();
const APP = "https://app.test";
let tenantId: string;
let userId: string;
let ownerEmail: string;
let accountId: string;

const sent: Email[] = [];
let failNext = 0;
const mailer: Mailer = {
  async send(email) {
    if (failNext > 0) {
      failNext -= 1;
      throw new Error("Resend send failed (503)");
    }
    sent.push(email);
    return { providerId: `re_${sent.length}`, mode: "sent" };
  },
};
const deliver = (m: Mailer = mailer) =>
  deliverPendingAlerts({ db, mailer: m, appUrl: APP, tenantId });

async function item(
  opts: { kind?: "comment" | "dm"; status?: string; lastCustomerAgoMs?: number } = {},
) {
  const id = randomUUID();
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
          Date.now() - (opts.lastCustomerAgoMs ?? 60_000),
        ).toISOString(),
      })
      .select("id")
      .single();
    conversationId = data!.id;
  }
  const { error } = await db.from("inbound_items").insert({
    id,
    tenant_id: tenantId,
    social_account_id: accountId,
    kind: opts.kind ?? "comment",
    ...(opts.kind === "dm"
      ? { zernio_message_id: `m_${id}`, conversation_id: conversationId }
      : { zernio_comment_id: `c_${id}`, zernio_post_id: "p1" }),
    author_name: "jen",
    text: "Is your kitchen halal certified?",
    received_at: new Date().toISOString(),
    status: opts.status ?? "classified",
    category: "faq",
    confidence: 0.9,
  });
  if (error) throw error;
  return id;
}

const alertsFor = async (kind: string) =>
  (
    await db
      .from("alerts")
      .select("id, status, item_id, attempts, last_error")
      .eq("tenant_id", tenantId)
      .eq("kind", kind)
  ).data ?? [];

beforeAll(async () => {
  ownerEmail = uniqueEmail();
  const { data } = await anonClient().auth.signUp({ email: ownerEmail, password: "password123" });
  userId = data.user!.id;
  const { data: rows } = await db.rpc("create_owner_tenant", {
    p_user_id: userId,
    p_name: "Alerts Cafe",
  });
  tenantId = rows![0].tenant_id;
  const { data: account } = await db
    .from("social_accounts")
    .insert({
      tenant_id: tenantId,
      zernio_account_id: `acc_${randomUUID().slice(0, 8)}`,
      platform: "instagram",
      username: "alertscafe",
    })
    .select("id")
    .single();
  accountId = account!.id;
});

afterAll(async () => {
  await db.from("tenants").delete().eq("id", tenantId);
  await db.auth.admin.deleteUser(userId);
});

describe("alerts", () => {
  it("an escalated item sends one email to the owner with why and a link", async () => {
    const id = await item();
    await transitionItem(db, {
      itemId: id,
      from: "classified",
      event: "escalate",
      details: { policyReason: "needs_human" },
    });
    // Unrelated updates to the escalated row don't queue another alert.
    await db.from("inbound_items").update({ last_error: null }).eq("id", id);

    const before = sent.length;
    await deliver();
    await deliver();

    const mine = sent.slice(before);
    expect(mine).toHaveLength(1);
    expect(mine[0].to).toEqual([ownerEmail]);
    expect(mine[0].subject).toBe("Alerts Cafe: a Instagram comment from jen needs you");
    expect(mine[0].text).toContain("Your knowledge base doesn't cover the question.");
    expect(mine[0].text).toContain(`${APP}/inbox/items/${id}`);
    expect(mine[0].text).not.toContain("halal");
    const [alert] = (await alertsFor("escalation")).filter((a) => a.item_id === id);
    expect(alert.status).toBe("sent");
    expect(mine[0].idempotencyKey).toBe(alert.id);
    const { count } = await db
      .from("audit_log")
      .select("*", { count: "exact", head: true })
      .eq("item_id", id)
      .eq("action", "alert_sent");
    expect(count).toBe(1);
  });

  it("a failed item (retries exhausted) is an escalation email too", async () => {
    const id = await item({ status: "new" });
    await transitionItem(db, { itemId: id, from: "new", event: "fail" });
    const before = sent.length;
    await deliver();
    const mine = sent.slice(before).filter((e) => e.text.includes(id));
    expect(mine).toHaveLength(1);
    expect(mine[0].text).toContain("after 3 tries");
  });

  it("a new lead sends one email with the lead and a link to the conversation", async () => {
    const id = await item({ kind: "dm", status: "drafted" });
    await db.from("leads").insert({
      tenant_id: tenantId,
      item_id: id,
      name: "Carlo",
      contact: "0917 555 0101",
      request: "Table for 8, Saturday 7pm",
    });
    const before = sent.length;
    await deliver();
    await deliver();

    const mine = sent.slice(before);
    expect(mine).toHaveLength(1);
    expect(mine[0].subject).toBe("Alerts Cafe: new lead from Carlo");
    expect(mine[0].text).toContain("Contact: 0917 555 0101");
    expect(mine[0].text).toContain(`${APP}/inbox/items/${id}`);
  });

  it("a disconnect sends one email per drop, linking to settings", async () => {
    const before = sent.length;
    await db.from("social_accounts").update({ status: "disconnected" }).eq("id", accountId);
    await db.from("social_accounts").update({ status: "error" }).eq("id", accountId); // still down
    await deliver();
    expect(sent.slice(before)).toHaveLength(1);
    expect(sent.at(-1)!.subject).toBe("Alerts Cafe: Instagram @alertscafe disconnected");
    expect(sent.at(-1)!.text).toContain(`${APP}/settings`);

    // Reconnected, then dropped again: a new email.
    await db.from("social_accounts").update({ status: "active" }).eq("id", accountId);
    await db.from("social_accounts").update({ status: "disconnected" }).eq("id", accountId);
    await deliver();
    expect(sent.slice(before)).toHaveLength(2);
    await db.from("social_accounts").update({ status: "active" }).eq("id", accountId);
  });

  it("drafts waiting more than 30 minutes: one nudge, once", async () => {
    const a = await item({ status: "awaiting_approval" });
    const b = await item({ status: "awaiting_approval" });
    const fresh = await item({ status: "awaiting_approval" });
    const old = new Date(Date.now() - 31 * 60_000).toISOString();
    const { error: insertError } = await db.from("drafts").insert([
      { tenant_id: tenantId, item_id: a, body: "x", created_at: old },
      { tenant_id: tenantId, item_id: b, body: "y", created_at: old },
      { tenant_id: tenantId, item_id: fresh, body: "z", created_at: new Date().toISOString() },
    ]);
    expect(insertError).toBeNull();

    await enqueueDraftNudges(db);
    await enqueueDraftNudges(db);
    const before = sent.length;
    await deliver();

    expect(await alertsFor("draft_waiting")).toHaveLength(1);
    const mine = sent.slice(before);
    expect(mine).toHaveLength(1);
    expect(mine[0].subject).toBe("Alerts Cafe: 2 replies are waiting for your approval");
    expect(mine[0].text).toContain(`${APP}/inbox`);
    const { data: nudged } = await db
      .from("drafts")
      .select("item_id, nudged_at")
      .in("item_id", [a, b, fresh]);
    expect(
      nudged
        ?.filter((d) => d.nudged_at)
        .map((d) => d.item_id)
        .sort(),
    ).toEqual([a, b].sort());
  });

  it("a waiting DM with under an hour of its window left is escalated, and emailed", async () => {
    const closing = await item({
      kind: "dm",
      status: "awaiting_approval",
      lastCustomerAgoMs: 23.5 * 3_600_000,
    });
    const fine = await item({
      kind: "dm",
      status: "awaiting_approval",
      lastCustomerAgoMs: 2 * 3_600_000,
    });

    await escalateClosingDmWindows(db, { tenantId });

    const status = async (id: string) =>
      (await db.from("inbound_items").select("status").eq("id", id).single()).data?.status;
    expect(await status(closing)).toBe("escalated");
    expect(await status(fine)).toBe("awaiting_approval");
    const before = sent.length;
    await deliver();
    const mine = sent.slice(before).filter((e) => e.text.includes(closing));
    expect(mine).toHaveLength(1);
    expect(mine[0].text).toContain("closes within the hour");
  });

  it("without Resend the alert is logged, not emailed", async () => {
    const id = await item();
    await transitionItem(db, { itemId: id, from: "classified", event: "escalate" });
    const before = sent.length;
    const info = console.info;
    console.info = () => {};
    try {
      await deliver(logMailer);
    } finally {
      console.info = info;
    }
    expect(sent.length).toBe(before);
    const [alert] = (await alertsFor("escalation")).filter((a) => a.item_id === id);
    expect(alert.status).toBe("logged");
  });

  it("a failed send is retried later, and given up after 5 attempts", async () => {
    const id = await item();
    await transitionItem(db, { itemId: id, from: "classified", event: "escalate" });
    const dueNow = () => db.from("alerts").update({ next_attempt_at: null }).eq("item_id", id);

    failNext = 1;
    await deliver();
    let [alert] = (await alertsFor("escalation")).filter((a) => a.item_id === id);
    expect(alert).toMatchObject({
      status: "pending",
      attempts: 1,
      last_error: "Error: Resend send failed (503)",
    });

    failNext = 10;
    for (let i = 0; i < 5; i++) {
      await dueNow();
      await deliver();
    }
    failNext = 0;
    [alert] = (await alertsFor("escalation")).filter((a) => a.item_id === id);
    expect(alert).toMatchObject({ status: "failed", attempts: 5 });
  });
});
