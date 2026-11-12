import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { POST } from "@/app/api/webhooks/zernio/route";
import { signZernioBody } from "@/features/inbox/signature";
import { settleMockPosts } from "@/features/publishing/mock-settle";
import { chooseBoardFor, listBoardsFor } from "@/features/publishing/pinterest";
import { createPost } from "@/features/publishing/posts";
import { publishPost, publishQueuedPosts } from "@/features/publishing/publish";
import { MockSocialProvider } from "@/lib/social/mock";
import {
  clearPlatformPause,
  getPlatformPause,
  recordPlatformPause,
} from "@/lib/social/platform-pause";
import { SocialProviderError, type CreatePostInput } from "@/lib/social/types";
import { anonClient, serviceClient, uniqueEmail } from "./helpers";

// docs/tasks.md T14: a post publishes now and on schedule, and its status shows correctly;
// pause and cancel handling. Zernio is the in-process mock with scripted failures (rule 14).
class ScriptedPosts extends MockSocialProvider {
  calls: CreatePostInput[] = [];
  failures: SocialProviderError[] = [];
  override async createPost(input: CreatePostInput) {
    this.calls.push(input);
    const failure = this.failures.shift();
    if (failure) throw failure;
    return super.createPost(input);
  }
}

const SECRET = "whsec_publishing_test";
const db = serviceClient();
let social: ScriptedPosts;
let tenantId: string;
let userId: string;
let profileId: string;
let accountId: string;
let zernioAccountId: string;
const deps = () => ({ db, social: () => social });

async function queuedPost(opts: { scheduledInMs?: number; targets?: string[] } = {}) {
  const { data, error } = await db
    .from("posts")
    .insert({
      tenant_id: tenantId,
      content: `Fresh croissants today! ${randomUUID().slice(0, 6)}`,
      media: [{ url: "https://cdn.example.com/croissant.jpg" }],
      target_account_ids: opts.targets ?? [accountId],
      scheduled_for:
        opts.scheduledInMs !== undefined
          ? new Date(Date.now() + opts.scheduledInMs).toISOString()
          : null,
      status: "queued",
    })
    .select("id, idempotency_key")
    .single();
  if (error) throw error;
  return data;
}

const postRow = async (id: string) =>
  (
    await db
      .from("posts")
      .select(
        "status, zernio_post_id, last_error, failure_reason, attempts, next_attempt_at, platform_results, published_at",
      )
      .eq("id", id)
      .single()
  ).data!;

function deliver(fixture: string, zernioPostId: string) {
  const raw = readFileSync(`tests/fixtures/zernio/${fixture}.json`, "utf8")
    .replaceAll("__TENANT_ID__", tenantId)
    .replaceAll("__PROFILE_ID__", profileId)
    .replaceAll("__ACCOUNT_ID__", zernioAccountId)
    .replaceAll("__POST_ID__", zernioPostId);
  const payload = JSON.parse(raw);
  payload.id = `${payload.id}_${randomUUID().slice(0, 8)}`;
  const body = JSON.stringify(payload);
  return POST(
    new Request("http://localhost/api/webhooks/zernio", {
      method: "POST",
      headers: { "X-Zernio-Signature": signZernioBody(body, SECRET) },
      body,
    }),
  );
}

beforeAll(async () => {
  process.env.ZERNIO_WEBHOOK_SECRET = SECRET;
  process.env.NEXT_PUBLIC_SUPABASE_URL = inject("supabaseUrl");
  process.env.SUPABASE_SERVICE_ROLE_KEY = inject("supabaseServiceKey");
  const { data } = await anonClient().auth.signUp({
    email: uniqueEmail(),
    password: "password123",
  });
  userId = data.user!.id;
  const { data: rows } = await db.rpc("create_owner_tenant", {
    p_user_id: userId,
    p_name: "Posting Cafe",
  });
  tenantId = rows![0].tenant_id;
  profileId = `prof_${randomUUID().slice(0, 8)}`;
  await db.from("tenants").update({ zernio_profile_id: profileId }).eq("id", tenantId);
  zernioAccountId = `acc_${randomUUID().slice(0, 8)}`;
  const { data: account } = await db
    .from("social_accounts")
    .insert({
      tenant_id: tenantId,
      zernio_account_id: zernioAccountId,
      platform: "instagram",
      username: "postingcafe",
    })
    .select("id")
    .single();
  accountId = account!.id;
});

afterAll(async () => {
  await clearPlatformPause(db);
  await db.from("tenants").delete().eq("id", tenantId);
  await db.auth.admin.deleteUser(userId);
});

describe("publishing (T14)", () => {
  it("publish now: handed to Zernio with the tenant's account, the image and the post's key", async () => {
    social = new ScriptedPosts();
    const post = await queuedPost();

    expect(await publishPost(deps(), post.id)).toEqual({
      outcome: "submitted",
      status: "publishing",
    });

    expect(social.calls).toEqual([
      expect.objectContaining({
        targets: [{ platform: "instagram", accountId: zernioAccountId }],
        mediaUrls: ["https://cdn.example.com/croissant.jpg"],
        publishAt: null,
        idempotencyKey: post.idempotency_key,
      }),
    ]);
    expect(await postRow(post.id)).toMatchObject({ status: "publishing", attempts: 0 });
    // Already handed over: a second call does nothing.
    expect(await publishPost(deps(), post.id)).toEqual({ outcome: "skipped" });
    expect(social.calls).toHaveLength(1);
  });

  it("scheduled: Zernio gets the time; the post.published webhook settles status, link and time", async () => {
    social = new ScriptedPosts();
    const post = await queuedPost({ scheduledInMs: 3_600_000 });

    await publishPost(deps(), post.id);
    expect(social.calls[0].publishAt?.getTime()).toBeGreaterThan(Date.now());
    const { zernio_post_id, status } = await postRow(post.id);
    expect(status).toBe("scheduled");

    const res = await deliver("post-published", zernio_post_id!);
    expect(await res.json()).toEqual({ outcome: "processed", detail: "published" });
    expect(await postRow(post.id)).toMatchObject({
      status: "published",
      published_at: "2026-10-28T07:00:04+00:00",
      platform_results: [
        {
          platform: "instagram",
          status: "published",
          url: "https://www.instagram.com/p/DEMO01/",
          error: null,
        },
      ],
    });
  });

  it("a post that fails while Zernio is paused is marked for rescheduling", async () => {
    social = new ScriptedPosts();
    const post = await queuedPost({ scheduledInMs: 3_600_000 });
    await publishPost(deps(), post.id);
    const { zernio_post_id } = await postRow(post.id);
    await recordPlatformPause(db);
    try {
      await deliver("post-failed", zernio_post_id!);
    } finally {
      await clearPlatformPause(db);
    }
    expect(await postRow(post.id)).toMatchObject({
      status: "failed",
      failure_reason: "zernio_paused",
      last_error: "instagram: Media could not be processed",
    });
  });

  it("a plain post.failed keeps the error and no pause reason; post.cancelled is account_removed", async () => {
    social = new ScriptedPosts();
    const failed = await queuedPost({ scheduledInMs: 3_600_000 });
    const cancelled = await queuedPost({ scheduledInMs: 7_200_000 });
    await publishPost(deps(), failed.id);
    await publishPost(deps(), cancelled.id);

    await deliver("post-failed", (await postRow(failed.id)).zernio_post_id!);
    await deliver("post-cancelled", (await postRow(cancelled.id)).zernio_post_id!);

    expect(await postRow(failed.id)).toMatchObject({ status: "failed", failure_reason: null });
    expect(await postRow(cancelled.id)).toMatchObject({
      status: "cancelled",
      failure_reason: "account_removed",
    });
  });

  it("402: Zernio paused. The post waits queued, the pause is recorded, nothing fails", async () => {
    social = new ScriptedPosts();
    social.failures.push(
      new SocialProviderError("Zernio createPost failed (402)", {
        status: 402,
        code: "PAYMENT_REQUIRED",
        ambiguous: false,
      }),
    );
    const post = await queuedPost();
    try {
      expect(await publishPost(deps(), post.id)).toEqual({
        outcome: "retry_later",
        reason: "zernio_paused",
      });
      expect(await getPlatformPause(db)).not.toBeNull();
      const row = await postRow(post.id);
      expect(row).toMatchObject({ status: "queued", attempts: 0 });
      expect(new Date(row.next_attempt_at!).getTime()).toBeGreaterThan(Date.now() + 200_000);
      // While paused, Zernio isn't called at all.
      await db.from("posts").update({ next_attempt_at: null }).eq("id", post.id);
      await publishQueuedPosts(deps(), { tenantId });
      expect(social.calls).toHaveLength(1);
    } finally {
      await clearPlatformPause(db);
    }
    // After the pause: it goes out.
    await db.from("posts").update({ next_attempt_at: null }).eq("id", post.id);
    expect(await publishQueuedPosts(deps(), { tenantId })).toMatchObject({ submitted: 1 });
  });

  it("429 waits for Retry-After without counting an attempt", async () => {
    social = new ScriptedPosts();
    social.failures.push(
      new SocialProviderError("Zernio createPost failed (429)", {
        status: 429,
        ambiguous: false,
        retryAfterSeconds: 90,
      }),
    );
    const post = await queuedPost();
    const before = Date.now();
    await publishPost(deps(), post.id);
    const row = await postRow(post.id);
    expect(row).toMatchObject({ status: "queued", attempts: 0 });
    const wait = new Date(row.next_attempt_at!).getTime() - before;
    expect(wait).toBeGreaterThan(80_000);
    expect(wait).toBeLessThan(100_000);
  });

  it("duplicate content (409) fails with a plain-words reason; 3 unclear errors fail too", async () => {
    social = new ScriptedPosts();
    social.failures.push(
      new SocialProviderError("Zernio createPost failed (409)", {
        status: 409,
        code: "duplicate_content",
        ambiguous: false,
      }),
    );
    const dup = await queuedPost();
    expect(await publishPost(deps(), dup.id)).toMatchObject({ outcome: "failed" });
    expect((await postRow(dup.id)).last_error).toContain("same text to this account");

    const flaky = await queuedPost();
    for (let i = 0; i < 3; i++) {
      social.failures.push(
        new SocialProviderError("Zernio createPost failed (502)", { status: 502, ambiguous: true }),
      );
      await db.from("posts").update({ next_attempt_at: null }).eq("id", flaky.id);
      await publishPost(deps(), flaky.id);
    }
    const row = await postRow(flaky.id);
    expect(row.status).toBe("failed");
    // Every attempt used the same key, so a delivered one would have been replayed.
    expect(new Set(social.calls.slice(-3).map((c) => c.idempotencyKey)).size).toBe(1);
  });

  it("a disconnected target account fails the post with a fix", async () => {
    social = new ScriptedPosts();
    const { data: other } = await db
      .from("social_accounts")
      .insert({
        tenant_id: tenantId,
        zernio_account_id: `acc_${randomUUID().slice(0, 8)}`,
        platform: "facebook",
        username: "postingcafe.fb",
        status: "disconnected",
      })
      .select("id")
      .single();
    const post = await queuedPost({ targets: [accountId, other!.id] });
    expect(await publishPost(deps(), post.id)).toMatchObject({ outcome: "failed" });
    expect((await postRow(post.id)).last_error).toContain(
      "Facebook @postingcafe.fb is disconnected",
    );
    expect(social.calls).toEqual([]);
  });

  it("platform rules: a text-only post to Instagram is refused before anything is saved", async () => {
    const before = social.posts.size;
    const r = await createPost(deps(), {
      tenantId,
      userId: randomUUID(),
      content: "No photo this time",
      accountIds: [accountId],
      scheduledFor: null,
    });
    expect(r).toEqual({
      ok: false,
      error: "not_accepted",
      problems: [{ platform: "instagram", message: "Instagram needs a photo or video." }],
    });
    expect(social.posts.size).toBe(before);
  });

  it("a video post to YouTube keeps its title for publishing, now or later (T63)", async () => {
    const { data: yt } = await db
      .from("social_accounts")
      .insert({
        tenant_id: tenantId,
        zernio_account_id: `acc_yt_${randomUUID().slice(0, 8)}`,
        platform: "youtube",
        username: "postingcafe.yt",
      })
      .select("id")
      .single();
    const video = "https://media.zernio.com/temp/1_video.mp4";
    const r = await createPost(deps(), {
      tenantId,
      userId: randomUUID(),
      content: "Ube cheesecake is back. Only 20 slices a day",
      accountIds: [yt!.id],
      scheduledFor: new Date(Date.now() + 60 * 60 * 1000),
      media: [{ url: video, seconds: 80 }],
      youtubeTitle: "Ube cheesecake is back",
    });
    expect(r).toMatchObject({ ok: true, outcome: "scheduled" });
    const { data: row } = await db
      .from("posts")
      .select("media, platform_options")
      .eq("id", (r as { postId: string }).postId)
      .single();
    expect(row).toEqual({
      media: [{ url: video, seconds: 80 }],
      platform_options: { youtube: { title: "Ube cheesecake is back" } },
    });
    expect(social.calls.at(-1)).toMatchObject({
      mediaUrls: [video],
      youtubeTitle: "Ube cheesecake is back",
    });
  });

  it("a video too long for Bluesky is refused before anything is saved (T63)", async () => {
    const { data: bs } = await db
      .from("social_accounts")
      .insert({
        tenant_id: tenantId,
        zernio_account_id: `acc_bs_${randomUUID().slice(0, 8)}`,
        platform: "bluesky",
        username: "postingcafe.bsky.social",
      })
      .select("id")
      .single();
    const r = await createPost(deps(), {
      tenantId,
      userId: randomUUID(),
      content: "Behind the counter",
      accountIds: [bs!.id],
      scheduledFor: null,
      media: [{ url: "https://media.zernio.com/temp/2_video.mp4", seconds: 80 }],
    });
    expect(r).toEqual({
      ok: false,
      error: "not_accepted",
      problems: [
        {
          platform: "bluesky",
          message: "Bluesky takes videos up to 60 seconds; this one is 1:20.",
        },
      ],
    });
  });

  it("Pinterest: the chosen board is remembered and every pin goes there (T64)", async () => {
    const { data: pin } = await db
      .from("social_accounts")
      .insert({
        tenant_id: tenantId,
        zernio_account_id: `acc_pin_${randomUUID().slice(0, 8)}`,
        platform: "pinterest",
        username: "postingcafe",
      })
      .select("id")
      .single();
    const listed = await listBoardsFor({ db, social }, { tenantId, accountId: pin!.id });
    expect(listed?.current).toBeNull();
    const cakes = listed!.boards.find((b) => b.name === "Cakes and pastries")!;

    // Someone else's board id is refused.
    await expect(
      chooseBoardFor({ db, social }, { tenantId, actor: userId, accountId: pin!.id, boardId: "x" }),
    ).resolves.toEqual({ ok: false, error: "not_found" });
    await expect(
      chooseBoardFor(
        { db, social },
        { tenantId, actor: userId, accountId: pin!.id, boardId: cakes.id },
      ),
    ).resolves.toEqual({ ok: true, board: cakes });

    const r = await createPost(deps(), {
      tenantId,
      userId,
      content: "Fresh ube cake",
      accountIds: [pin!.id],
      scheduledFor: new Date(Date.now() + 60 * 60 * 1000),
      media: [{ url: "https://media.zernio.com/temp/1_photo.jpg" }],
    });
    expect(r).toMatchObject({ ok: true });
    const { data: row } = await db
      .from("posts")
      .select("platform_options")
      .eq("id", (r as { postId: string }).postId)
      .single();
    expect(row?.platform_options).toEqual({ pinterest: { boardId: cakes.id } });
    expect(social.calls.at(-1)?.pinterestBoardId).toBe(cakes.id);
  });

  it("Pinterest boards: only for the brand's own Pinterest account (T64)", async () => {
    await expect(
      listBoardsFor({ db, social }, { tenantId, accountId: accountId }),
    ).resolves.toBeNull();
    await expect(
      listBoardsFor({ db, social }, { tenantId: randomUUID(), accountId: accountId }),
    ).resolves.toBeNull();
  });

  it("Zernio's check refuses what our rules let through, with its own reason", async () => {
    const original = social.validatePost.bind(social);
    social.validatePost = async () => ({
      valid: false,
      errors: [{ platform: "instagram", message: "Aspect ratio not supported." }],
      warnings: [],
    });
    try {
      const r = await createPost(deps(), {
        tenantId,
        userId: randomUUID(),
        content: "With a photo",
        accountIds: [accountId],
        scheduledFor: null,
        media: [{ url: "https://example.com/a.jpg" }],
      });
      expect(r).toMatchObject({ ok: false, error: "not_accepted" });
    } finally {
      social.validatePost = original;
    }
  });

  it("another tenant's account can't be a target (DB trigger)", async () => {
    const { data: foreign } = await db
      .from("social_accounts")
      .select("id")
      .neq("tenant_id", tenantId)
      .limit(1)
      .maybeSingle();
    if (!foreign) return;
    const { error } = await db.from("posts").insert({
      tenant_id: tenantId,
      content: "x",
      target_account_ids: [foreign.id],
      status: "queued",
    });
    expect(error).not.toBeNull();
  });

  it("mock mode: due mock posts settle as published (no webhooks locally)", async () => {
    social = new ScriptedPosts();
    const post = await queuedPost();
    await publishPost(deps(), post.id);
    await settleMockPosts(db);
    expect(await postRow(post.id)).toMatchObject({
      status: "published",
      platform_results: [{ platform: "instagram", status: "published" }],
    });
  });
});
