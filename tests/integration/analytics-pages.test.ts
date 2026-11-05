import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import {
  latestSync,
  loadAccounts,
  loadAudience,
  loadOverview,
  loadPostComments,
  loadPostDetail,
  loadPostMetrics,
  loadWork,
} from "@/features/analytics/data";
import { dashboardKey, audienceKey, BEST_TIME_KEY, FOLLOWERS_KEY } from "@/features/analytics/sync";
import { mockDashboard, mockDemographics } from "@/lib/social/mock-analytics";
import type { Database, Json } from "@/lib/supabase/database.types";
import { anonClient, serviceClient, uniqueEmail } from "./helpers";

// T49-T52: the Analytics loaders. One login owns two brands; RLS lets it read both, so every loader
// must filter on the open brand. A stranger reads nothing.
const db = serviceClient();
const userIds: string[] = [];
const tenantIds: string[] = [];
const now = new Date();
const today = now.toISOString().slice(0, 10);
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString();

let owner: SupabaseClient<Database>;
let stranger: SupabaseClient<Database>;
const brand = {
  harbour: { id: "", account: "", post: "" },
  bloom: { id: "", account: "", post: "" },
};

async function signUp() {
  const { data, error } = await anonClient().auth.signUp({
    email: uniqueEmail(),
    password: "password123",
  });
  if (error) throw error;
  userIds.push(data.user!.id);
  const token = data.session!.access_token;
  const client = createClient<Database>(inject("supabaseUrl"), inject("supabaseAnonKey"), {
    accessToken: async () => token,
  });
  return { userId: data.user!.id, client };
}

/** One brand's numbers: reach is the brand's own marker, so a leak shows. */
async function fill(tenantId: string, name: string, reach: number) {
  const { data: account } = await db
    .from("social_accounts")
    .insert({
      tenant_id: tenantId,
      zernio_account_id: `acc_${randomUUID().slice(0, 8)}`,
      platform: "instagram",
      username: name,
    })
    .select("id")
    .single();
  const dashboard = mockDashboard({ profileId: name, fromDate: today, toDate: today });
  dashboard.fromDate = new Date(now.getTime() - 29 * 86_400_000).toISOString().slice(0, 10);
  dashboard.totals.reach = reach;
  const snapshots: [string, unknown][] = [
    [dashboardKey(30, "all"), dashboard],
    [BEST_TIME_KEY, { slots: [{ dayOfWeek: 5, hourUtc: 0, avgEngagement: 9, postCount: 3 }] }],
    [
      FOLLOWERS_KEY,
      {
        accounts: [
          {
            socialAccountId: account!.id,
            platform: "instagram",
            username: name,
            points: [{ date: today, followers: reach }],
          },
        ],
      },
    ],
    [
      audienceKey(account!.id),
      {
        platform: "instagram",
        username: name,
        demographics: mockDemographics("instagram"),
        online: null,
      },
    ],
  ];
  for (const [key, data] of snapshots) {
    const { error } = await db
      .from("analytics_snapshots")
      .insert({ tenant_id: tenantId, key, data: data as Json });
    if (error) throw error;
  }

  const zernioPostId = `zp_${randomUUID().slice(0, 8)}`;
  const providerPostId = `pp_${randomUUID().slice(0, 8)}`;
  await db.from("posts").insert({
    tenant_id: tenantId,
    content: `${name} post`,
    target_account_ids: [account!.id],
    status: "published",
    published_at: hoursAgo(30),
    zernio_post_id: zernioPostId,
  });
  const { data: metrics, error } = await db
    .from("post_metrics")
    .insert([
      {
        tenant_id: tenantId,
        provider_post_id: providerPostId,
        platform: "instagram",
        zernio_post_id: zernioPostId,
        published_at: hoursAgo(30),
        caption: `${name} made in Waggle`,
        format: "reel",
        is_external: false,
        reach,
      },
      {
        tenant_id: tenantId,
        provider_post_id: `pp_${randomUUID().slice(0, 8)}`,
        platform: "instagram",
        published_at: hoursAgo(20),
        caption: `${name} posted on Instagram`,
        format: "photo",
        is_external: true,
        reach: 10,
      },
    ])
    .select("id, zernio_post_id");
  if (error) throw error;

  // Two comments on the Waggle post: one answered by Waggle on its own, one waiting.
  const items = [randomUUID(), randomUUID()];
  for (const [i, id] of items.entries()) {
    const { error: itemError } = await db.from("inbound_items").insert({
      id,
      tenant_id: tenantId,
      social_account_id: account!.id,
      kind: "comment",
      zernio_comment_id: `c_${id}`,
      zernio_post_id: providerPostId,
      text: "what time do you open?",
      received_at: hoursAgo(10 - i),
      status: i === 0 ? "sent" : "escalated",
      category: "faq",
      confidence: 0.9,
    });
    if (itemError) throw itemError;
  }
  const { error: draftError } = await db.from("drafts").insert({
    tenant_id: tenantId,
    item_id: items[0],
    body: "We open at 7.",
    status: "sent",
    sent_at: new Date(Date.parse(hoursAgo(10)) + 6000).toISOString(),
  });
  if (draftError) throw draftError;

  const post = metrics!.find((m) => m.zernio_post_id === zernioPostId)!.id;
  return { id: tenantId, account: account!.id, post };
}

beforeAll(async () => {
  const me = await signUp();
  owner = me.client;
  const { data: first } = await db.rpc("create_owner_tenant", {
    p_user_id: me.userId,
    p_name: "Harbour Bean",
  });
  const { data: second } = await db.rpc("create_brand", {
    p_user_id: me.userId,
    p_name: "Bloom Florist",
  });
  tenantIds.push(first![0].tenant_id, second![0].tenant_id);
  brand.harbour = await fill(first![0].tenant_id, "harbour", 1111);
  brand.bloom = await fill(second![0].tenant_id, "bloom", 2222);
  stranger = (await signUp()).client;
});

afterAll(async () => {
  await db.from("tenants").delete().in("id", tenantIds);
  for (const id of userIds) await db.auth.admin.deleteUser(id);
});

describe("analytics loaders keep brands apart (T49-T52)", () => {
  it("Overview reads only the open brand's dashboard and posts", async () => {
    for (const [b, reach] of [
      [brand.harbour, 1111],
      [brand.bloom, 2222],
    ] as const) {
      const o = await loadOverview(owner, b.id, {
        period: 30,
        platform: "all",
        platforms: ["instagram"],
        now,
      });
      expect(o.summary?.totals.reach).toBe(reach);
      expect(o.posts.map((p) => p.reach).sort()).toEqual([10, reach]);
      expect(o.bestTimes).toHaveLength(1);
      // The Waggle post's comments: two came in, Waggle answered one on its own.
      expect(o.waggleComments).toEqual({ comments: 2, answered: 1 });
    }
  });

  it("Posts know made in Waggle from posted on the platform, and never show the other brand's", async () => {
    const posts = await loadPostMetrics(owner, brand.bloom.id, {
      from: new Date(now.getTime() - 7 * 86_400_000),
      to: new Date(now.getTime() + 86_400_000),
      platform: "all",
    });
    expect(posts.map((p) => p.caption).sort()).toEqual([
      "bloom made in Waggle",
      "bloom posted on Instagram",
    ]);
    expect(posts.find((p) => p.madeInWaggle)?.caption).toBe("bloom made in Waggle");

    // A post id from the other brand finds nothing, even though RLS would allow it.
    expect(await loadPostDetail(owner, brand.bloom.id, brand.harbour.post)).toBeNull();
    const own = await loadPostDetail(owner, brand.harbour.id, brand.harbour.post);
    expect(own?.caption).toBe("harbour made in Waggle");
    expect(await loadPostComments(owner, brand.harbour.id, own!)).toMatchObject({
      total: 2,
      byWaggle: 1,
      byYou: 0,
    });
  });

  it("Audience reads only the open brand's accounts", async () => {
    const accounts = await loadAccounts(owner, brand.harbour.id);
    expect(accounts.map((a) => a.id)).toEqual([brand.harbour.account]);
    const audience = await loadAudience(owner, brand.harbour.id, accounts);
    expect([...audience.audiences.keys()]).toEqual([brand.harbour.account]);
    expect(audience.followers?.accounts[0].points[0].followers).toBe(1111);
  });

  it("Waggle's work counts the open brand's messages and replies", async () => {
    const work = await loadWork(owner, brand.harbour.id, { period: 7, accountIds: null, now });
    expect(work.messagesIn).toBe(2);
    expect(work.byWaggle).toBe(1);
    expect(work.byYou).toBe(0);
    expect(work.firstReplyWaggle).toBe(6);
    const filtered = await loadWork(owner, brand.bloom.id, {
      period: 7,
      accountIds: [brand.bloom.account],
      now,
    });
    expect(filtered.messagesIn).toBe(2);
    // The other brand's account: nothing of bloom's matches.
    const other = await loadWork(owner, brand.bloom.id, {
      period: 7,
      accountIds: [brand.harbour.account],
      now,
    });
    expect(other.messagesIn).toBe(0);
  });

  it("a stranger reads nothing", async () => {
    expect(await latestSync(stranger, brand.harbour.id)).toBeNull();
    expect(
      await loadPostMetrics(stranger, brand.harbour.id, {
        from: new Date(0),
        to: new Date(now.getTime() + 86_400_000),
        platform: "all",
      }),
    ).toEqual([]);
    expect(await latestSync(owner, brand.harbour.id)).not.toBeNull();
  });
});
