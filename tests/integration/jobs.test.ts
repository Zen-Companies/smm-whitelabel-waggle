import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from "vitest";
import { POST } from "@/app/api/jobs/process/route";
import { processDueItems, type Step, type Steps } from "@/features/inbox/processor";
import { claimItems, createDeadline, releaseItems, type ClaimedItem } from "@/lib/jobs";
import type { ServiceClient } from "@/lib/supabase/service";
import { anonClient, serviceClient, uniqueEmail } from "./helpers";

// docs/tasks.md T6: seeded `new` items move through mocked steps; a failing step retries, then
// fails and escalates.
const db = serviceClient();
const userIds: string[] = [];
let tenantId: string;
let accountId: string;

/** Only this test's tenant: other (live) items are released untouched. */
async function ownClaim(client: ServiceClient, limit: number): Promise<ClaimedItem[]> {
  const items = await claimItems(client, limit);
  const foreign = items.filter((i) => i.tenantId !== tenantId).map((i) => i.id);
  await releaseItems(client, foreign);
  return items.filter((i) => i.tenantId === tenantId);
}

const run = (steps: Steps, deadline = createDeadline()) =>
  processDueItems({ db, steps, deadline, claim: ownClaim });

async function seedItems(n: number) {
  const ids = Array.from({ length: n }, () => randomUUID());
  const { error } = await db.from("inbound_items").insert(
    ids.map((id, i) => ({
      id,
      tenant_id: tenantId,
      social_account_id: accountId,
      kind: "comment",
      zernio_comment_id: `jc_${id}`,
      text: "fixture",
      received_at: new Date(Date.now() - (n - i) * 1000).toISOString(),
    })),
  );
  if (error) throw error;
  return ids;
}

async function items(ids: string[]) {
  const { data } = await db
    .from("inbound_items")
    .select("id, status, attempts, next_run_at, locked_at, last_error")
    .in("id", ids);
  return new Map((data ?? []).map((r) => [r.id, r]));
}

/** Makes retried items due now, as if the backoff had passed. */
const fastForward = (ids: string[]) =>
  db
    .from("inbound_items")
    .update({ next_run_at: new Date(Date.now() - 1000).toISOString() })
    .in("id", ids);

const mockSteps: Steps = {
  new: async () => ({ event: "classified", details: { category: "faq" } }),
  classified: async () => ({ event: "drafted" }),
  drafted: async () => ({ event: "await_approval" }),
};

beforeAll(async () => {
  const { data } = await anonClient().auth.signUp({
    email: uniqueEmail(),
    password: "password123",
  });
  userIds.push(data.user!.id);
  const { data: rows } = await db.rpc("create_owner_tenant", {
    p_user_id: data.user!.id,
    p_name: "Jobs Cafe",
  });
  tenantId = rows![0].tenant_id;
  const { data: account } = await db
    .from("social_accounts")
    .insert({
      tenant_id: tenantId,
      zernio_account_id: `acc_${randomUUID().slice(0, 8)}`,
      platform: "instagram",
    })
    .select("id")
    .single();
  accountId = account!.id;
  process.env.NEXT_PUBLIC_SUPABASE_URL = inject("supabaseUrl");
  process.env.SUPABASE_SERVICE_ROLE_KEY = inject("supabaseServiceKey");
});

beforeEach(async () => {
  await db.from("inbound_items").delete().eq("tenant_id", tenantId);
  await db.from("social_accounts").update({ status: "active" }).eq("id", accountId);
});

afterAll(async () => {
  await db.from("tenants").delete().eq("id", tenantId);
  for (const id of userIds) await db.auth.admin.deleteUser(id);
});

describe("processDueItems", () => {
  it("moves seeded new items through all mocked steps in one run", async () => {
    const ids = await seedItems(3);

    const summary = await run(mockSteps);

    expect(summary).toMatchObject({ claimed: 3, advanced: 3, released: 0 });
    const final = await items(ids);
    for (const id of ids) {
      expect(final.get(id)).toMatchObject({ status: "awaiting_approval", locked_at: null });
    }
    // Nothing left to do for them: the next run claims nothing.
    expect(await run(mockSteps)).toMatchObject({ claimed: 0 });

    const { data: audit } = await db
      .from("audit_log")
      .select("details")
      .eq("item_id", ids[0])
      .eq("action", "status_changed")
      .order("created_at");
    expect(
      audit?.map((a) => [(a.details as { from: string }).from, (a.details as { to: string }).to]),
    ).toEqual([
      ["new", "classified"],
      ["classified", "drafted"],
      ["drafted", "awaiting_approval"],
    ]);
    expect(audit?.[0].details).toMatchObject({ reason: "classified", category: "faq" });
  });

  it("a failing step retries with backoff, then fails and escalates after 3 attempts", async () => {
    const [id] = await seedItems(1);
    let calls = 0;
    const failing: Step = async () => {
      calls += 1;
      throw new Error("classifier unavailable");
    };

    const r1 = await run({ new: failing });
    expect(r1).toMatchObject({ retried: 1 });
    let row = (await items([id])).get(id)!;
    expect(row).toMatchObject({
      status: "new",
      attempts: 1,
      locked_at: null,
      last_error: "Error: classifier unavailable",
    });
    const delayMs = new Date(row.next_run_at!).getTime() - Date.now();
    expect(delayMs).toBeGreaterThan(110_000); // 2^1 minutes
    expect(delayMs).toBeLessThan(125_000);

    // Not due yet: the next run leaves it alone.
    expect(await run({ new: failing })).toMatchObject({ claimed: 0 });

    await fastForward([id]);
    await run({ new: failing });
    row = (await items([id])).get(id)!;
    expect(row).toMatchObject({ status: "new", attempts: 2 });
    expect(new Date(row.next_run_at!).getTime() - Date.now()).toBeGreaterThan(230_000); // 2^2 minutes

    await fastForward([id]);
    expect(await run({ new: failing })).toMatchObject({ failed: 1 });
    row = (await items([id])).get(id)!;
    expect(row).toMatchObject({
      status: "failed",
      attempts: 3,
      locked_at: null,
      next_run_at: null,
    });
    expect(calls).toBe(3);

    const { data: escalated } = await db
      .from("audit_log")
      .select("details")
      .eq("item_id", id)
      .eq("action", "escalated")
      .single();
    expect(escalated?.details).toEqual({ reason: "retries_exhausted", attempts: 3, step: "new" });

    // A failed item is never claimed again.
    await fastForward([id]);
    expect(await run({ new: failing })).toMatchObject({ claimed: 0 });
  });

  it("counts attempts per step: a step that recovers resets them for the next step", async () => {
    const [id] = await seedItems(1);
    let classifyCalls = 0;
    const steps: Steps = {
      new: async () => {
        classifyCalls += 1;
        if (classifyCalls < 3) throw new Error("flaky");
        return { event: "classified" };
      },
      classified: async (item) => {
        expect(item.attempts).toBe(0);
        return { event: "drafted" };
      },
    };
    await run(steps);
    await fastForward([id]);
    await run(steps);
    await fastForward([id]);
    await run(steps);
    expect((await items([id])).get(id)).toMatchObject({
      status: "drafted",
      attempts: 0,
      last_error: null,
    });
  });

  it("a rate-limited step waits as asked without counting an attempt", async () => {
    const [id] = await seedItems(1);
    const { RetryLaterError } = await import("@/lib/jobs");
    await run({
      new: async () => {
        throw new RetryLaterError(30);
      },
    });
    const row = (await items([id])).get(id)!;
    expect(row.attempts).toBe(0);
    const delayMs = new Date(row.next_run_at!).getTime() - Date.now();
    expect(delayMs).toBeGreaterThan(25_000);
    expect(delayMs).toBeLessThanOrEqual(31_000);
  });

  it("pauses open items of a disconnected account instead of running the step", async () => {
    const [id] = await seedItems(1);
    await db.from("social_accounts").update({ status: "disconnected" }).eq("id", accountId);
    let called = false;

    const summary = await run({
      new: async () => {
        called = true;
        return { event: "classified" };
      },
    });

    expect(summary).toMatchObject({ paused: 1 });
    expect(called).toBe(false);
    expect((await items([id])).get(id)?.status).toBe("paused");
  });

  it("leaves items whose step isn't built yet untouched and unlocked", async () => {
    const [id] = await seedItems(1);
    const summary = await run({});
    expect(summary).toMatchObject({ claimed: 1, released: 1, advanced: 0 });
    expect((await items([id])).get(id)).toMatchObject({
      status: "new",
      attempts: 0,
      locked_at: null,
    });
  });

  it("stops at the deadline: unstarted items are released for the next tick", async () => {
    const ids = await seedItems(3);
    let t = 0;
    const deadline = createDeadline({ now: () => t });
    const slowStep: Step = async () => {
      t += 25_000; // each item takes 25 s of the 60 s run
      return { event: "classified" };
    };

    const summary = await run({ new: slowStep }, deadline);

    // Item 1 at 0 s, item 2 at 25 s (35 s left), item 3 at 50 s → only 10 s left, not started.
    expect(summary).toMatchObject({ advanced: 2, released: 1 });
    const rows = await items(ids);
    expect([...rows.values()].filter((r) => r.status === "classified")).toHaveLength(2);
    const left = [...rows.values()].find((r) => r.status === "new")!;
    expect(left).toMatchObject({ locked_at: null, attempts: 0 });
  });

  it("does not claim at all once 45 s of the run have passed", async () => {
    await seedItems(1);
    let t = 0;
    const deadline = createDeadline({ now: () => t });
    t = 45_000;
    expect(await run(mockSteps, deadline)).toMatchObject({ claimed: 0 });
  });
});

describe("POST /api/jobs/process", () => {
  const call = (auth?: string) =>
    POST(
      new Request("http://localhost/api/jobs/process", {
        method: "POST",
        headers: auth ? { Authorization: auth } : {},
      }),
    );

  it("rejects missing or wrong CRON_SECRET with 401", async () => {
    process.env.CRON_SECRET = "cron_integration_test";
    expect((await call()).status).toBe(401);
    expect((await call("Bearer wrong")).status).toBe(401);
    expect((await call("cron_integration_test")).status).toBe(401);
  });

  it("runs with the right secret and returns a summary", async () => {
    process.env.CRON_SECRET = "cron_integration_test";
    const res = await call("Bearer cron_integration_test");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ claimed: expect.any(Number), advanced: 0 });
  });
});
