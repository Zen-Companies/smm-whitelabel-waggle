import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inject } from "vitest";
import { approveDraft, rejectDraft } from "@/features/approvals/decisions";
import { loadInbox } from "@/features/approvals/inbox-data";
import type { Database } from "@/lib/supabase/database.types";
import { anonClient, serviceClient, uniqueEmail } from "./helpers";

// docs/tasks.md T11: approve, edit and reject each work; a new draft arrives live (Realtime).
const db = serviceClient();
const userIds: string[] = [];

interface Owner {
  userId: string;
  tenantId: string;
  accountId: string;
  token: string;
}

async function owner(name: string): Promise<Owner> {
  const { data, error } = await anonClient().auth.signUp({
    email: uniqueEmail(),
    password: "password123",
  });
  if (error) throw error;
  userIds.push(data.user!.id);
  const { data: rows } = await db.rpc("create_owner_tenant", {
    p_user_id: data.user!.id,
    p_name: name,
  });
  const tenantId = rows![0].tenant_id;
  const { data: account } = await db
    .from("social_accounts")
    .insert({
      tenant_id: tenantId,
      zernio_account_id: `acc_${randomUUID().slice(0, 8)}`,
      platform: "instagram",
    })
    .select("id")
    .single();
  return {
    userId: data.user!.id,
    tenantId,
    accountId: account!.id,
    token: data.session!.access_token,
  };
}

/**
 * The owner's own client: RLS applies, as in the browser. `accessToken` (not a header + setAuth)
 * so Realtime always joins with the owner's token: without a session, supabase-js would hand
 * Realtime the anon key on a cold server, and the join fails closed.
 */
function ownerClient(o: Owner) {
  return createClient<Database>(inject("supabaseUrl"), inject("supabaseAnonKey"), {
    accessToken: async () => o.token,
  });
}

let kbHours: string;
async function waitingItem(o: Owner, body = "We're open 8am to 10pm on Sundays.") {
  const itemId = randomUUID();
  const { error } = await db.from("inbound_items").insert({
    id: itemId,
    tenant_id: o.tenantId,
    social_account_id: o.accountId,
    kind: "comment",
    zernio_comment_id: `c_${itemId}`,
    zernio_post_id: "post_1",
    author_name: "carlo",
    text: "Open on Sunday?",
    received_at: new Date().toISOString(),
    status: "awaiting_approval",
    category: "faq",
    confidence: 0.93,
  });
  if (error) throw error;
  const { data: draft } = await db
    .from("drafts")
    .insert({
      tenant_id: o.tenantId,
      item_id: itemId,
      body,
      model: "test",
      kb_entry_ids: kbHours ? [kbHours] : [],
    })
    .select("id")
    .single();
  return { itemId, draftId: draft!.id };
}

const row = async (itemId: string) => ({
  item: (await db.from("inbound_items").select("status").eq("id", itemId).single()).data,
  draft: (
    await db
      .from("drafts")
      .select("status, edited_body, decided_by, decided_at")
      .eq("item_id", itemId)
      .single()
  ).data,
  audit: (
    await db
      .from("audit_log")
      .select("action, actor, details")
      .eq("item_id", itemId)
      .order("created_at")
  ).data,
});

let a: Owner;
let b: Owner;

beforeAll(async () => {
  [a, b] = await Promise.all([owner("Approvals A"), owner("Approvals B")]);
  const { data } = await db
    .from("kb_entries")
    .insert({ tenant_id: a.tenantId, title: "Opening hours", content: "Sat-Sun 8am-10pm" })
    .select("id")
    .single();
  kbHours = data!.id;
});

afterAll(async () => {
  await db.from("tenants").delete().in("id", [a.tenantId, b.tenantId]);
  for (const id of userIds) await db.auth.admin.deleteUser(id);
});

describe("approval inbox", () => {
  it("lists the waiting item with its draft, category and the facts used, own tenant only", async () => {
    const { itemId, draftId } = await waitingItem(a);
    const other = await waitingItem(b);

    const inbox = await loadInbox(ownerClient(a), a.tenantId);

    const entry = inbox.waiting.find((e) => e.itemId === itemId);
    expect(entry).toMatchObject({
      kind: "comment",
      authorName: "carlo",
      text: "Open on Sunday?",
      category: "faq",
      confidence: 0.93,
      draft: { id: draftId, body: "We're open 8am to 10pm on Sundays.", facts: ["Opening hours"] },
    });
    expect(inbox.waiting.some((e) => e.itemId === other.itemId)).toBe(false);
    // RLS, not just the filter: asking for B's tenant with A's session returns nothing.
    expect((await loadInbox(ownerClient(a), b.tenantId)).waiting).toEqual([]);
  });

  it("approve as is: draft approved by the owner, item sending, audited", async () => {
    const { itemId, draftId } = await waitingItem(a);

    const result = await approveDraft(db, {
      tenantId: a.tenantId,
      userId: a.userId,
      itemId,
      draftId,
      editedBody: "We're open 8am to 10pm on Sundays.",
    });

    expect(result).toEqual({ ok: true });
    const { item, draft, audit } = await row(itemId);
    expect(item?.status).toBe("sending");
    expect(draft).toMatchObject({ status: "approved", edited_body: null, decided_by: a.userId });
    expect(draft?.decided_at).not.toBeNull();
    expect(audit?.map((r) => r.action)).toEqual(["draft_approved", "status_changed"]);
    expect(audit?.[0]).toMatchObject({ actor: a.userId, details: { draftId, edited: false } });
  });

  it("edit then approve: the edited text is stored and the edit audited (no text in the log)", async () => {
    const { itemId, draftId } = await waitingItem(a);

    await approveDraft(db, {
      tenantId: a.tenantId,
      userId: a.userId,
      itemId,
      draftId,
      editedBody: "  Yes! Sundays 8am to 10pm.  ",
    });

    const { item, draft, audit } = await row(itemId);
    expect(item?.status).toBe("sending");
    expect(draft).toMatchObject({ status: "approved", edited_body: "Yes! Sundays 8am to 10pm." });
    expect(audit?.map((r) => r.action)).toEqual([
      "draft_edited",
      "draft_approved",
      "status_changed",
    ]);
    expect(JSON.stringify(audit)).not.toContain("Sundays");
  });

  it("reject closes the item without sending", async () => {
    const { itemId, draftId } = await waitingItem(a);

    expect(
      await rejectDraft(db, { tenantId: a.tenantId, userId: a.userId, itemId, draftId }),
    ).toEqual({ ok: true });

    const { item, draft, audit } = await row(itemId);
    expect(item?.status).toBe("rejected");
    expect(draft).toMatchObject({ status: "rejected", decided_by: a.userId });
    expect(audit?.map((r) => r.action)).toEqual(["status_changed", "draft_rejected"]);
  });

  it("a second decision, an empty edit and another tenant's item are refused", async () => {
    const { itemId, draftId } = await waitingItem(a);
    const input = { tenantId: a.tenantId, userId: a.userId, itemId, draftId };

    expect(await approveDraft(db, { ...input, editedBody: "   " })).toEqual({
      ok: false,
      error: "empty_reply",
    });
    expect(await approveDraft(db, { ...input, editedBody: "x".repeat(1001) })).toEqual({
      ok: false,
      error: "too_long",
    });
    // B's session can't touch A's item: the tenant id comes from B's session.
    expect(await approveDraft(db, { ...input, tenantId: b.tenantId, userId: b.userId })).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(await rejectDraft(db, { ...input, tenantId: b.tenantId, userId: b.userId })).toEqual({
      ok: false,
      error: "not_found",
    });

    expect(await approveDraft(db, input)).toEqual({ ok: true });
    expect(await approveDraft(db, input)).toEqual({ ok: false, error: "already_decided" });
    expect(await rejectDraft(db, input)).toEqual({ ok: false, error: "already_decided" });
    expect((await row(itemId)).item?.status).toBe("sending");
  });

  it("an approval that died before the status change completes on the next approve", async () => {
    const { itemId, draftId } = await waitingItem(a);
    await db.from("drafts").update({ status: "approved", decided_by: a.userId }).eq("id", draftId);

    expect(
      await approveDraft(db, { tenantId: a.tenantId, userId: a.userId, itemId, draftId }),
    ).toEqual({ ok: true });
    expect((await row(itemId)).item?.status).toBe("sending");
  });

  it("a new draft reaches the owner's Realtime subscription; another tenant's doesn't", async () => {
    // Cross-tenant isolation in depth (unfiltered, B's filter, updates, deletes) is
    // realtime-isolation.test.ts; this is the inbox's own subscription.
    const client = ownerClient(a);
    const received: string[] = [];
    const unfiltered: string[] = [];
    // A freshly started local Realtime can refuse early joins: retry the join. SUBSCRIBED comes before the postgres_changes
    // listener is registered; Realtime confirms that with a system message.
    // The token callback is async: a join sent before it resolves carries only the anon key.
    await client.realtime.setAuth();
    let channel!: ReturnType<typeof client.channel>;
    for (let attempt = 1; ; attempt++) {
      channel = client
        .channel(`test-inbox-${a.tenantId}-${attempt}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "drafts",
            filter: `tenant_id=eq.${a.tenantId}`,
          },
          (payload) => received.push((payload.new as { item_id: string }).item_id),
        )
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "drafts" }, (p) =>
          unfiltered.push((p.new as { tenant_id: string }).tenant_id),
        );
      try {
        await new Promise<void>((resolve, reject) => {
          const t = setTimeout(() => reject(new Error("subscribe timed out")), 15_000);
          channel.on(
            "system",
            {},
            (msg: { extension?: string; status?: string; message?: string }) => {
              if (msg.extension !== "postgres_changes") return;
              clearTimeout(t);
              if (msg.status === "ok") resolve();
              else reject(new Error(`postgres_changes: ${msg.message}`));
            },
          );
          channel.subscribe();
        });
        break;
      } catch (error) {
        await client.removeChannel(channel);
        if (attempt >= 5) throw error;
        await new Promise((r) => setTimeout(r, 2_000));
      }
    }

    const other = await waitingItem(b);
    const mine = await waitingItem(a);
    const deadline = Date.now() + 10_000;
    while (!received.includes(mine.itemId) && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 100));
    }
    await client.removeChannel(channel);

    expect(received, "own new draft delivered").toContain(mine.itemId);
    expect(received, "filtered channel: no other-tenant draft").not.toContain(other.itemId);
    expect(unfiltered, "RLS: other tenant's draft never delivered").not.toContain(b.tenantId);
  }, 30_000);
});
