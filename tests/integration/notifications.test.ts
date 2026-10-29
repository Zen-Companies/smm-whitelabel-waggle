import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { countUnreadNeedingAction, loadNotifications } from "@/features/alerts/notifications";
import { transitionItem } from "@/features/inbox/status";
import type { Database } from "@/lib/supabase/database.types";
import { anonClient, serviceClient, uniqueEmail } from "./helpers";

// docs/design.md §5: the notification center is fed by the T13 alerts, post outcomes and replies
// sent automatically (batched); the badge counts unread items that need action; RLS scopes it.
const db = serviceClient();
const userIds: string[] = [];
const tenantIds: string[] = [];

async function owner(name: string) {
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
  const { data: account } = await db
    .from("social_accounts")
    .insert({
      tenant_id: tenantId,
      zernio_account_id: `acc_${randomUUID().slice(0, 8)}`,
      platform: "instagram",
      username: name.toLowerCase().replaceAll(" ", ""),
    })
    .select("id")
    .single();
  const token = data.session!.access_token;
  const client = createClient<Database>(inject("supabaseUrl"), inject("supabaseAnonKey"), {
    accessToken: async () => token,
  });
  return { tenantId, accountId: account!.id, client };
}

async function item(t: { tenantId: string; accountId: string }, status = "classified") {
  const id = randomUUID();
  await db.from("inbound_items").insert({
    id,
    tenant_id: t.tenantId,
    social_account_id: t.accountId,
    kind: "comment",
    zernio_comment_id: `c_${id}`,
    zernio_post_id: "p",
    author_name: "jen.dc",
    text: "Grabe ang tagal.",
    received_at: new Date().toISOString(),
    status,
    category: "complaint",
    confidence: 0.9,
  });
  return id;
}

let a: Awaited<ReturnType<typeof owner>>;
let b: Awaited<ReturnType<typeof owner>>;

beforeAll(async () => {
  [a, b] = await Promise.all([owner("Notify A"), owner("Notify B")]);
});

afterAll(async () => {
  await db.from("tenants").delete().in("id", tenantIds);
  for (const id of userIds) await db.auth.admin.deleteUser(id);
});

const kinds = async (tenantId: string) =>
  (
    await db
      .from("notifications")
      .select("kind, needs_action, details, read_at")
      .eq("tenant_id", tenantId)
      .order("created_at")
  ).data ?? [];

describe("notification center", () => {
  it("an escalation, a lead and a disconnect each become one notification that needs action", async () => {
    const held = await item(a);
    await transitionItem(db, { itemId: held, from: "classified", event: "escalate" });
    const leadItem = await item(a, "drafted");
    await db.from("leads").insert({ tenant_id: a.tenantId, item_id: leadItem, name: "Carlo" });
    await db.from("social_accounts").update({ status: "disconnected" }).eq("id", a.accountId);
    await db.from("social_accounts").update({ status: "active" }).eq("id", a.accountId);

    const rows = await kinds(a.tenantId);
    expect(rows.map((r) => r.kind).sort()).toEqual(["account", "lead", "needs_you"]);
    expect(rows.every((r) => r.needs_action && r.read_at === null)).toBe(true);
    expect(await countUnreadNeedingAction(a.client, a.tenantId)).toBe(3);

    const views = await loadNotifications(a.client, a.tenantId);
    expect(views.map((v) => v.title)).toEqual(
      expect.arrayContaining([
        "jen.dc needs you",
        "New lead: Carlo",
        "Instagram @notifya disconnected",
      ]),
    );
  });

  it("post outcomes: published is an update, failed needs action", async () => {
    const insert = async () =>
      (
        await db
          .from("posts")
          .insert({
            tenant_id: a.tenantId,
            content: "Ube cheese pandesal is back!",
            target_account_ids: [a.accountId],
            status: "scheduled",
          })
          .select("id")
          .single()
      ).data!.id;
    const ok = await insert();
    const bad = await insert();
    await db.from("posts").update({ status: "published" }).eq("id", ok);
    await db
      .from("posts")
      .update({ status: "failed", failure_reason: "zernio_paused" })
      .eq("id", bad);

    const rows = (await kinds(a.tenantId)).filter((r) => r.kind.startsWith("post_"));
    expect(rows).toEqual([
      expect.objectContaining({ kind: "post_published", needs_action: false }),
      expect.objectContaining({
        kind: "post_failed",
        needs_action: true,
        details: { status: "failed", failureReason: "zernio_paused" },
      }),
    ]);
  });

  it("replies sent automatically batch into one row per day; owner-approved ones don't count", async () => {
    const draft = async (decidedBy: string | null) => {
      const itemId = await item(a, "sending");
      const { data } = await db
        .from("drafts")
        .insert({ tenant_id: a.tenantId, item_id: itemId, body: "x", status: "approved" })
        .select("id")
        .single();
      await db.from("drafts").update({ decided_by: decidedBy }).eq("id", data!.id);
      return data!.id;
    };
    const auto1 = await draft(null);
    const auto2 = await draft(null);
    const byOwner = await draft(userIds[0]);
    for (const id of [auto1, auto2, byOwner]) {
      await db
        .from("drafts")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", id);
    }
    const batch = (await kinds(a.tenantId)).filter((r) => r.kind === "auto_sent");
    expect(batch).toEqual([
      expect.objectContaining({ needs_action: false, details: { count: 2 } }),
    ]);
  });

  it("owners read and mark only their own; others see nothing; only read_at can change", async () => {
    expect(await loadNotifications(b.client, a.tenantId)).toEqual([]);
    const { data: own } = await a.client
      .from("notifications")
      .select("id")
      .eq("tenant_id", a.tenantId);
    expect(own!.length).toBeGreaterThan(0);

    // B can't mark A's read.
    await b.client
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("tenant_id", a.tenantId);
    expect(await countUnreadNeedingAction(a.client, a.tenantId)).toBeGreaterThan(0);
    // Only read_at is writable.
    const { error } = await a.client
      .from("notifications")
      .update({ needs_action: false })
      .eq("tenant_id", a.tenantId);
    expect(error).not.toBeNull();

    await a.client
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("tenant_id", a.tenantId);
    expect(await countUnreadNeedingAction(a.client, a.tenantId)).toBe(0);
  });
});
