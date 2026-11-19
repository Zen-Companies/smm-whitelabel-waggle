import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deliverCrmEvents } from "@/features/crm";
import { queueCrmEvent, queueForOwners } from "@/lib/crm";
import type { GhlClient, GhlContactInput } from "@/lib/ghl/client";
import { anonClient, serviceClient, uniqueEmail } from "./helpers";

// Waggle → GoHighLevel (features/crm): events queue once, go out oldest first per owner, at
// least 30 s apart, with every field and the trigger tag. A fake HighLevel (rule 14).
const db = serviceClient();
let userId: string;
let orgId: string;
let email: string;

const calls: {
  upsert?: GhlContactInput;
  tags?: string[];
  note?: { title: string; body: string };
}[] = [];
const fake: GhlClient = {
  async upsertContact(input) {
    calls.push({ upsert: input });
    return { contactId: "ghl-contact-1" };
  },
  async addTags(_id, tags) {
    calls.push({ tags });
  },
  async addNote(_id, note) {
    calls.push({ note });
  },
  async contactFields() {
    return existingFields;
  },
};
/** What HighLevel already has on the contact (first-touch UTM tests). */
let existingFields: Record<string, string> = {};

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
      async addNote() {},
      async contactFields() {
        return {};
      },
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

  it("sign-up: a full event (signed_up) with its first campaign, the trigger and waggle-signup", async () => {
    await db.from("crm_events").update({ status: "sent" }).eq("user_id", userId);
    await queueCrmEvent(db, {
      event: "signed_up",
      userId,
      orgId,
      dedupeKey: "signed_up",
      details: { utm: JSON.stringify({ utm_source: "meta", utm_campaign: "launch" }) },
    });
    const at = new Date(Date.now() + 10 * 60_000);
    calls.length = 0;
    existingFields = {};
    expect((await deliverCrmEvents({ db, client: fake, now: () => at })).sent).toBe(1);
    expect(calls).toHaveLength(2);
    expect(calls[0]?.upsert?.fields).toMatchObject({
      waggle_event: "signed_up",
      waggle_founding: "false",
      utm_source: "meta",
      utm_campaign: "launch",
    });
    // No paid plan is Free (19 Nov).
    expect(calls[0]?.upsert?.fields.waggle_plan).toBe("free");
    expect(calls[1]).toEqual({ tags: ["waggle-app-event", "waggle-signup"] });
  });

  it("a contact that already has a campaign keeps it", async () => {
    await queueCrmEvent(db, {
      event: "signed_up",
      userId,
      orgId,
      dedupeKey: "signed_up-again",
      details: { utm: JSON.stringify({ utm_source: "google" }) },
    });
    const at = new Date(Date.now() + 20 * 60_000);
    calls.length = 0;
    existingFields = { utm_source: "meta" };
    await deliverCrmEvents({ db, client: fake, now: () => at });
    expect(calls.at(0)?.upsert?.fields).not.toHaveProperty("utm_source");
  });

  it("feedback: a note on the contact, no fields, no tag", async () => {
    await queueCrmEvent(db, {
      event: "feedback",
      userId,
      orgId,
      dedupeKey: "feedback:1",
      note: { title: "Waggle feedback · Bug", body: "The inbox is slow" },
    });
    const at = new Date(Date.now() + 30 * 60_000);
    calls.length = 0;
    await deliverCrmEvents({ db, client: fake, now: () => at });
    expect(calls).toEqual([
      { upsert: { email, name: null, fields: {} } },
      { note: { title: "Waggle feedback · Bug", body: "The inbox is slow" } },
    ]);
  });
});
