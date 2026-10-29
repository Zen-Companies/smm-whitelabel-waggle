import { randomUUID } from "node:crypto";
import { createClient, type RealtimeChannel } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { anonClient, serviceClient, uniqueEmail } from "./helpers";

// Realtime isolation (docs/tdd.md §13): tenant A's signed-in client must never receive tenant B's
// drafts, whatever it subscribes to. postgres_changes are authorized by RLS (realtime.apply_rls
// runs the subscriber's SELECT under their JWT), not by the client's filter, so this test uses
// filters A controls: none, and B's own tenant id.
//
// Deterministic: Realtime delivers a subscription's changes in WAL order. Every B change is made
// before A's sentinel draft; once the sentinel arrives on the unfiltered channel, anything B's
// changes would have produced has been delivered. A short grace period covers the second channel.
const db = serviceClient();
const userIds: string[] = [];
const tenantIds: string[] = [];

interface Owner {
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
  tenantIds.push(tenantId);
  const { data: account } = await db
    .from("social_accounts")
    .insert({
      tenant_id: tenantId,
      zernio_account_id: `acc_${randomUUID().slice(0, 8)}`,
      platform: "instagram",
    })
    .select("id")
    .single();
  return { tenantId, accountId: account!.id, token: data.session!.access_token };
}

async function itemFor(o: Owner) {
  const id = randomUUID();
  const { error } = await db.from("inbound_items").insert({
    id,
    tenant_id: o.tenantId,
    social_account_id: o.accountId,
    kind: "comment",
    zernio_comment_id: `c_${id}`,
    zernio_post_id: "p",
    text: "secret question",
    received_at: new Date().toISOString(),
    status: "awaiting_approval",
    category: "faq",
    confidence: 0.9,
  });
  if (error) throw error;
  return id;
}

async function draftFor(o: Owner, body: string) {
  const itemId = await itemFor(o);
  const { data, error } = await db
    .from("drafts")
    .insert({ tenant_id: o.tenantId, item_id: itemId, body })
    .select("id")
    .single();
  if (error) throw error;
  return { itemId, draftId: data.id };
}

type Event = { table: string; type: string; record: Record<string, unknown> };

/**
 * Subscribes A's own client and resolves once Realtime confirms the postgres_changes listeners.
 * A refused join is retried up to 5 times, 2 s apart (a freshly started local Realtime can
 * refuse early joins). Only a refused subscription is retried, never a delivered event.
 */
async function subscribe(
  token: string,
  name: string,
  filter: string | undefined,
  events: Event[],
  attempt = 1,
): Promise<{ close: () => Promise<void> }> {
  // accessToken + an awaited setAuth, so Realtime joins as the user (a join without the token is
  // evaluated as anon: fails closed, but then the test proves nothing).
  const client = createClient<Database>(inject("supabaseUrl"), inject("supabaseAnonKey"), {
    accessToken: async () => token,
  });
  // The token callback is async: a join sent before it resolves carries only the anon key.
  await client.realtime.setAuth();
  const channel: RealtimeChannel = client.channel(`${name}-${attempt}`);
  for (const table of ["drafts", "inbound_items"] as const) {
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table, ...(filter ? { filter } : {}) },
      (p) =>
        events.push({
          table,
          type: p.eventType,
          record: { ...(p.old as object), ...(p.new as object) },
        }),
    );
  }
  const close = async () => {
    await client.removeChannel(channel);
    client.realtime.disconnect();
  };
  try {
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`${name}: subscribe timed out`)), 15_000);
      channel.on("system", {}, (msg: { extension?: string; status?: string; message?: string }) => {
        if (msg.extension !== "postgres_changes") return;
        clearTimeout(t);
        if (msg.status === "ok") resolve();
        else reject(new Error(`${name}: postgres_changes ${msg.status}: ${msg.message}`));
      });
      channel.subscribe();
    });
  } catch (error) {
    await close();
    if (attempt >= 5) throw error;
    await new Promise((r) => setTimeout(r, 2_000));
    return subscribe(token, name, filter, events, attempt + 1);
  }
  return { close };
}

let a: Owner;
let b: Owner;

beforeAll(async () => {
  [a, b] = await Promise.all([owner("Isolation A"), owner("Isolation B")]);
});

afterAll(async () => {
  await db.from("tenants").delete().in("id", tenantIds);
  for (const id of userIds) await db.auth.admin.deleteUser(id);
});

describe("Realtime isolation: tenant A never receives tenant B's rows", () => {
  it("unfiltered, and filtered to B's tenant id: B's rows never arrive, and no DELETE event at all", async () => {
    const unfiltered: Event[] = [];
    const filteredToB: Event[] = [];
    const subs = [
      await subscribe(a.token, `iso-unfiltered-${randomUUID()}`, undefined, unfiltered),
    ];

    try {
      // Warm-up: after a cold start Realtime confirms the subscription before the replication
      // stream delivers. Wait until A's own change arrives, so the stream is live before B acts.
      const arrived = (events: Event[], id: string) =>
        events.some((e) => e.table === "drafts" && e.record.id === id);
      const waitFor = async (id: string, ms: number) => {
        const until = Date.now() + ms;
        while (!arrived(unfiltered, id) && Date.now() < until) {
          await new Promise((r) => setTimeout(r, 100));
        }
        return arrived(unfiltered, id);
      };
      let live = false;
      for (let i = 0; i < 3 && !live; i++) {
        live = await waitFor((await draftFor(a, `A warm-up ${i}`)).draftId, 15_000);
      }
      expect(live, "Realtime delivers A's own changes (stream live)").toBe(true);
      // Joined once the server is warm: a cold server refuses filtered joins for a while.
      subs.push(
        await subscribe(
          a.token,
          `iso-b-filter-${randomUUID()}`,
          `tenant_id=eq.${b.tenantId}`,
          filteredToB,
        ),
      );

      // B: inserts, an update, and a delete of both a draft and an item.
      const bRows = [];
      for (let i = 0; i < 5; i++) bRows.push(await draftFor(b, `B private reply ${i}`));
      await db.from("drafts").update({ body: "B edited" }).eq("id", bRows[0].draftId);
      await db.from("inbound_items").update({ status: "rejected" }).eq("id", bRows[1].itemId);
      await db.from("drafts").delete().eq("id", bRows[2].draftId);
      await db.from("inbound_items").delete().eq("id", bRows[3].itemId);
      // A's own delete: deletes aren't published at all (migration realtime_no_deletes).
      const aDeleted = await draftFor(a, "A deleted");
      await db.from("drafts").delete().eq("id", aDeleted.draftId);

      // A's sentinel, after every B change.
      const mine = await draftFor(a, "A sentinel");
      await waitFor(mine.draftId, 15_000);
      await new Promise((r) => setTimeout(r, 1_500));

      const bIds = new Set(bRows.flatMap((r) => [r.draftId, r.itemId]));
      const fromB = (events: Event[]) =>
        events.filter((e) => e.record.tenant_id === b.tenantId || bIds.has(e.record.id as string));

      expect(
        unfiltered.some((e) => e.table === "drafts" && e.record.id === mine.draftId),
        "A's own draft arrives",
      ).toBe(true);
      expect(
        [...unfiltered, ...filteredToB].filter((e) => e.type === "DELETE"),
        "no DELETE event at all (deletes skip RLS in Realtime, so they aren't published)",
      ).toEqual([]);
      expect(fromB(unfiltered), "unfiltered: nothing of B's").toEqual([]);
      expect(fromB(filteredToB), "filtered to B's tenant id: nothing of B's").toEqual([]);
      expect(filteredToB, "filtered to B: nothing at all").toEqual([]);
      // Only A's tenant ever appears.
      expect(
        unfiltered.filter((e) => e.record.tenant_id && e.record.tenant_id !== a.tenantId),
        "unfiltered: no other tenant id",
      ).toEqual([]);
    } finally {
      for (const s of subs) await s.close();
    }
  }, 120_000);
});
