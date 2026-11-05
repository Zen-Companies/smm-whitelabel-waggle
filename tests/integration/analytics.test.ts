import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { syncAnalytics } from "@/features/analytics";
import { MockSocialProvider } from "@/lib/social/mock";
import { SocialProviderError } from "@/lib/social/types";
import { anonClient, serviceClient, uniqueEmail } from "./helpers";

// T48: the job copies Zernio's analytics into our tables. Zernio is the in-process mock (rule 14).
const db = serviceClient();
const userIds: string[] = [];
let tenantId: string;
let igAccountId: string;
const now = new Date("2026-11-05T12:00:00Z");
let parked: { id: string; analytics_synced_at: string | null }[] = [];

const run = (social: MockSocialProvider, at = now) =>
  syncAnalytics({ db, social: () => social, shouldContinue: () => true, now: () => at });
const snapshotKeys = async () =>
  ((await db.from("analytics_snapshots").select("key").eq("tenant_id", tenantId)).data ?? [])
    .map((r) => r.key)
    .sort();
const postCount = async () =>
  (
    await db
      .from("post_metrics")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
  ).count;

beforeAll(async () => {
  const { data } = await anonClient().auth.signUp({
    email: uniqueEmail(),
    password: "password123",
  });
  userIds.push(data.user!.id);
  const { data: rows } = await db.rpc("create_owner_tenant", {
    p_user_id: data.user!.id,
    p_name: "Analytics Cafe",
  });
  tenantId = rows![0].tenant_id;
  await db
    .from("tenants")
    .update({ zernio_profile_id: `prof_${randomUUID().slice(0, 8)}` })
    .eq("id", tenantId);
  const { data: account } = await db
    .from("social_accounts")
    .insert({
      tenant_id: tenantId,
      zernio_account_id: `acc_${randomUUID().slice(0, 8)}`,
      platform: "instagram",
      username: "analyticscafe",
    })
    .select("id")
    .single();
  igAccountId = account!.id;
  // Other tenants (local demo data, other tests) may be due too: park them for this file.
  const { data: others } = await db
    .from("tenants")
    .select("id, analytics_synced_at")
    .neq("id", tenantId);
  parked = others ?? [];
  if (parked.length) {
    await db
      .from("tenants")
      .update({ analytics_synced_at: "2999-01-01T00:00:00Z" })
      .in(
        "id",
        parked.map((t) => t.id),
      );
  }
});

afterAll(async () => {
  for (const t of parked) {
    await db.from("tenants").update({ analytics_synced_at: t.analytics_synced_at }).eq("id", t.id);
  }
  await db.from("tenants").delete().eq("id", tenantId);
  for (const id of userIds) await db.auth.admin.deleteUser(id);
});

describe("analytics sync (T48)", () => {
  it("fills dashboards, posts and audience on the first pass", async () => {
    const social = new MockSocialProvider();
    const summary = await run(social);
    expect(summary).toMatchObject({ tenants: 1, failed: 0, rateLimited: false });
    expect(await snapshotKeys()).toEqual(
      [
        `audience:${igAccountId}`,
        "best_time",
        "dashboard:30:all",
        "dashboard:30:instagram",
        "dashboard:7:all",
        "dashboard:7:instagram",
        "dashboard:90:all",
        "dashboard:90:instagram",
        "followers",
      ].sort(),
    );
    // The first pass reads the last 12 months: about one mock post every 5 days.
    expect(await postCount()).toBeGreaterThan(60);
    const { data: audience } = await db
      .from("analytics_snapshots")
      .select("data")
      .eq("tenant_id", tenantId)
      .eq("key", `audience:${igAccountId}`)
      .single();
    expect(audience?.data).toMatchObject({ platform: "instagram", username: "analyticscafe" });
  });

  it("isn't due again within the hour; an hour later it updates rows instead of adding", async () => {
    const before = await postCount();
    const social = new MockSocialProvider();
    expect((await run(social, new Date(now.getTime() + 30 * 60_000))).tenants).toBe(0);
    expect(social.analyticsCalls).toBe(0);

    const later = new Date(now.getTime() + 61 * 60_000);
    expect((await run(social, later)).tenants).toBe(1);
    expect(await postCount()).toBe(before);
    // Hourly pass: 6 dashboards + 1 page of posts; audience waits for its daily turn.
    expect(social.analyticsCalls).toBe(7);
  });

  it("a rate limit stops the pass and leaves the brand due", async () => {
    class Limited extends MockSocialProvider {
      override async getAnalyticsDashboard(): Promise<never> {
        throw new SocialProviderError("slow down", { status: 429, ambiguous: false });
      }
    }
    const at = new Date(now.getTime() + 3 * 60 * 60_000);
    const { data: t0 } = await db
      .from("tenants")
      .select("analytics_synced_at")
      .eq("id", tenantId)
      .single();
    expect(await run(new Limited(), at)).toMatchObject({ rateLimited: true, failed: 0 });
    const { data: t1 } = await db
      .from("tenants")
      .select("analytics_synced_at")
      .eq("id", tenantId)
      .single();
    expect(t1?.analytics_synced_at).toBe(t0?.analytics_synced_at);
  });
});
