import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deliverCrmEvents } from "@/features/crm";
import { queueForOwners } from "@/lib/crm";
import type { GhlClient, GhlContactInput } from "@/lib/ghl/client";
import { anonClient, serviceClient, uniqueEmail } from "./helpers";

// Waggle → GoHighLevel (features/crm): events queue once, go out oldest first per owner, at
// least 30 s apart, with every field and the trigger tag. A fake HighLevel (rule 14).
const db = serviceClient();
let userId: string;
let orgId: string;
let email: string;

const calls: { upsert?: GhlContactInput; tags?: string[] }[] = [];
const fake: GhlClient = {
  async upsertContact(input) {
    calls.push({ upsert: input });
    return { contactId: "ghl-contact-1" };
  },
  async addTags(_id, tags) {
    calls.push({ tags });
  },
};

beforeAll(async () => {
  email = uniqueEmail();
  const { data } = await anonClient().auth.signUp({ email, password: "password123" });
  userId = data.user!.id;
  const { data: rows } = await db.rpc("create_owner_tenant", {
    p_user_id: userId,
    p_name: "CRM Cafe",
  });
  const tenantId = rows![0].tenant_id;
  const { data: t } = await db
    .from("tenants")
    .select("organization_id")
    .eq("id", tenantId)
    .single();
  orgId = t!.organization_id!;
});

afterAll(async () => {
  await db.from("organizations").delete().eq("id", orgId);
  await db.auth.admin.deleteUser(userId);
});

describe("crm queue", () => {
  it("queues once per thing that happened, then sends oldest first, 30 s apart", async () => {
    await queueForOwners(db, orgId, { event: "trial_started", dedupeKey: "evt_1:trial_started" });
    await queueForOwners(db, orgId, { event: "trial_started", dedupeKey: "evt_1:trial_started" });
    await queueForOwners(db, orgId, {
      event: "trial_converted",
      dedupeKey: "evt_2:trial_converted",
    });
    const { count } = await db
      .from("crm_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    expect(count).toBe(2);

    const t0 = new Date();
    const first = await deliverCrmEvents({ db, client: fake, now: () => t0 });
    expect(first.sent).toBe(1);
    expect(calls.at(-2)?.upsert).toMatchObject({
      email,
      companyName: "CRM Cafe",
      fields: {
        waggle_event: "trial_started",
        waggle_founding: "false",
        waggle_business: "CRM Cafe",
      },
    });
    expect(calls.at(-1)?.tags).toEqual(["waggle-app-event"]);

    // 10 s later: too soon for the same person.
    const early = await deliverCrmEvents({
      db,
      client: fake,
      now: () => new Date(t0.getTime() + 10_000),
    });
    expect(early.sent).toBe(0);

    // 31 s later: the next one, in order.
    const next = await deliverCrmEvents({
      db,
      client: fake,
      now: () => new Date(t0.getTime() + 31_000),
    });
    expect(next.sent).toBe(1);
    expect(calls.at(-2)?.upsert?.fields.waggle_event).toBe("trial_converted");

    const { data: rows } = await db
      .from("crm_events")
      .select("event, status, ghl_contact_id")
      .eq("user_id", userId)
      .order("created_at");
    expect(rows).toEqual([
      { event: "trial_started", status: "sent", ghl_contact_id: "ghl-contact-1" },
      { event: "trial_converted", status: "sent", ghl_contact_id: "ghl-contact-1" },
    ]);
  });

  it("without HighLevel set up, nothing is sent and the queue waits", async () => {
    await queueForOwners(db, orgId, { event: "inactive", dedupeKey: "inactive:x" });
    const r = await deliverCrmEvents({ db, client: null });
    expect(r.notConfigured).toBe(true);
    const { data } = await db
      .from("crm_events")
      .select("status")
      .eq("user_id", userId)
      .eq("event", "inactive")
      .single();
    expect(data?.status).toBe("pending");
  });

  it("a failed call is retried later, not lost", async () => {
    const broken: GhlClient = {
      async upsertContact() {
        throw new Error("HighLevel unreachable");
      },
      async addTags() {},
    };
    const later = new Date(Date.now() + 120_000);
    const r = await deliverCrmEvents({ db, client: broken, now: () => later });
    expect(r.retried).toBe(1);
    const { data } = await db
      .from("crm_events")
      .select("status, attempts, next_attempt_at")
      .eq("user_id", userId)
      .eq("event", "inactive")
      .single();
    expect(data?.status).toBe("pending");
    expect(data?.attempts).toBe(1);
    expect(data?.next_attempt_at).not.toBeNull();
  });
});
