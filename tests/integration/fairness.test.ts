import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { processDueItems } from "@/features/inbox/processor";
import { claimItems, createDeadline, JOB_CLAIM_PER_TENANT, releaseItems } from "@/lib/jobs";
import type { ServiceClient } from "@/lib/supabase/service";
import { anonClient, serviceClient, uniqueEmail } from "./helpers";

// docs/tasks.md T6b: a tenant with 100 due items and one with 1 both get processed in the same
// tick; a batch takes at most JOB_CLAIM_PER_TENANT items per tenant.
const db = serviceClient();
const userIds: string[] = [];
const tenants: { id: string; accountId: string }[] = [];

async function tenant(name: string) {
  const { data } = await anonClient().auth.signUp({
    email: uniqueEmail(),
    password: "password123",
  });
  userIds.push(data.user!.id);
  const { data: rows } = await db.rpc("create_owner_tenant", {
    p_user_id: data.user!.id,
    p_name: name,
  });
  const id = rows![0].tenant_id;
  const { data: account } = await db
    .from("social_accounts")
    .insert({
      tenant_id: id,
      zernio_account_id: `acc_${randomUUID().slice(0, 8)}`,
      platform: "instagram",
    })
    .select("id")
    .single();
  const t = { id, accountId: account!.id };
  tenants.push(t);
  return t;
}

async function seed(t: { id: string; accountId: string }, n: number, ageSeconds: number) {
  const rows = Array.from({ length: n }, (_, i) => {
    const id = randomUUID();
    return {
      id,
      tenant_id: t.id,
      social_account_id: t.accountId,
      kind: "comment",
      zernio_comment_id: `fc_${id}`,
      text: "fixture",
      // Older than the other tenant's, so plain oldest-first would take only these.
      received_at: new Date(Date.now() - (ageSeconds + n - i) * 1000).toISOString(),
    };
  });
  const { error } = await db.from("inbound_items").insert(rows);
  if (error) throw error;
  return rows.map((r) => r.id);
}

/** claimItems narrowed to this test's tenants; anything else is released untouched. */
const ownClaim = async (client: ServiceClient, limit: number, statuses?: string[]) => {
  const mine = new Set(tenants.map((t) => t.id));
  const items = await claimItems(client, limit, { statuses });
  await releaseItems(
    client,
    items.filter((i) => !mine.has(i.tenantId)).map((i) => i.id),
  );
  return items.filter((i) => mine.has(i.tenantId));
};

let big: { id: string; accountId: string };
let small: { id: string; accountId: string };

beforeAll(async () => {
  big = await tenant("Busy Cafe");
  small = await tenant("Quiet Cafe");
});

afterAll(async () => {
  await db
    .from("tenants")
    .delete()
    .in(
      "id",
      tenants.map((t) => t.id),
    );
  for (const id of userIds) await db.auth.admin.deleteUser(id);
});

describe("per-tenant fairness (T6b)", () => {
  it("one batch takes at most the cap per tenant, so a small tenant isn't starved", async () => {
    const bigIds = await seed(big, 100, 3600);
    const [smallId] = await seed(small, 1, 0);

    const batch = await ownClaim(db, 20);
    await releaseItems(
      db,
      batch.map((i) => i.id),
    );

    const byTenant = (id: string) => batch.filter((i) => i.tenantId === id);
    expect(byTenant(big.id)).toHaveLength(JOB_CLAIM_PER_TENANT);
    expect(byTenant(small.id).map((i) => i.id)).toEqual([smallId]);
    // Oldest first within the busy tenant.
    expect(new Set(byTenant(big.id).map((i) => i.id))).toEqual(
      new Set(bigIds.slice(0, JOB_CLAIM_PER_TENANT)),
    );
  });

  it("both tenants are processed in the same tick, and the backlog keeps draining", async () => {
    const processed = new Set<string>();
    await processDueItems({
      db,
      steps: {
        new: async (item) => {
          processed.add(item.tenantId);
          return { event: "classified" };
        },
      },
      deadline: createDeadline(),
      claim: ownClaim,
    });

    expect(processed).toEqual(new Set([big.id, small.id]));
    const { count } = await db
      .from("inbound_items")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", big.id)
      .eq("status", "classified");
    // Several batches in one run: far more than one batch's share.
    expect(count).toBeGreaterThan(JOB_CLAIM_PER_TENANT);
  });
});
