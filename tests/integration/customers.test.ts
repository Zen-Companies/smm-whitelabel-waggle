import { afterAll, beforeAll, expect, it } from "vitest";
import { loadCustomerDetail, loadCustomerList } from "@/features/customers/load";
import { parseListParams } from "@/features/customers/derive";
import { anonClient, serviceClient, uniqueEmail } from "./helpers";

// Staff → Customers: the list and the trace read the real tables (connect_attempts, crm_events,
// audit_log, ...) and derive where a business stopped, its flags and source.
const db = serviceClient();
let tenantId: string;
let userId: string;
let email: string;

beforeAll(async () => {
  email = uniqueEmail();
  const { data, error } = await anonClient().auth.signUp({ email, password: "password123" });
  if (error || !data.user) throw error ?? new Error("no user");
  userId = data.user.id;
  const { data: rows } = await db.rpc("create_owner_tenant", {
    p_user_id: userId,
    p_name: "Customers IT Lechon",
  });
  tenantId = rows![0].tenant_id;
  await db.from("connect_attempts").insert([
    {
      tenant_id: tenantId,
      user_id: userId,
      platform: "instagram",
      started_at: "2026-11-24T09:10:00Z",
      outcome: "failed",
      outcome_at: "2026-11-24T09:10:40Z",
      error: "oauth_failed",
      error_reason: "in_app_browser_blocked",
      is_user_fixable: true,
      user_agent_class: "in_app_instagram",
    },
    {
      tenant_id: tenantId,
      user_id: userId,
      platform: "facebook",
      started_at: "2026-11-24T09:13:00Z",
      outcome: "returned_without_account",
      outcome_at: "2026-11-24T09:13:30Z",
      user_agent_class: "in_app_instagram",
    },
  ]);
  await db.from("crm_events").insert({
    user_id: userId,
    event: "signed_up",
    dedupe_key: `signed_up:${userId}`,
    details: { utm: JSON.stringify({ utm_source: "meta", utm_campaign: "nov-reels-food" }) },
    status: "sent",
  });
});

afterAll(async () => {
  await db.from("crm_events").delete().eq("user_id", userId);
  await db.from("tenants").delete().eq("id", tenantId);
  await db.auth.admin.deleteUser(userId);
});

it("lists the business as stuck at Connect, from an ad, in Instagram's browser", async () => {
  const list = await loadCustomerList(db, parseListParams({ q: email }), new Date());
  expect(list.rows).toHaveLength(1);
  expect(list.rows[0]).toMatchObject({
    id: tenantId,
    ownerEmail: email,
    stage: "connect",
    source: "ad",
    sourceLabel: "meta · nov-reels-food",
    browser: "in_app_instagram",
    where: "Came back without an account",
  });
  expect(list.rows[0].flags.map((f) => f.label)).toContain("Connect failed ×2");
  const filtered = await loadCustomerList(
    db,
    parseListParams({ q: email, stuck: "active" }),
    new Date(),
  );
  expect(filtered.rows).toHaveLength(0);
  expect(filtered.counts.connect).toBe(1);
});

it("traces one business: attempts, timeline, funnel", async () => {
  const d = await loadCustomerDetail(db, tenantId, new Date());
  expect(d).not.toBeNull();
  expect(d!.attempts.map((a) => a.platform)).toEqual(["facebook", "instagram"]);
  expect(d!.funnel.connected).toBeNull();
  const kinds = d!.timeline.map((e) => e.kind);
  expect(kinds).toContain("connect");
  expect(kinds).toContain("crm");
  expect(d!.triesByPlatformNotConnected).toEqual(
    expect.arrayContaining([{ platform: "instagram", tries: 1 }]),
  );
});
