import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createPost } from "@/features/publishing/posts";
import {
  applyEditToRepeat,
  createRepeat,
  scheduleRepeats,
  stopRepeat,
} from "@/features/publishing/repeats";
import { MockSocialProvider } from "@/lib/social/mock";
import type { CreatePostInput } from "@/lib/social/types";
import { anonClient, serviceClient, uniqueEmail } from "./helpers";

// Posts Round 5: repeat posts. Waggle keeps one planned post per repeat and makes the next one
// (through createPost, the usual publish path) once that one has gone out; the same text and
// files each time; the end (after N times) and Stop repeating are honoured. Zernio is the
// in-process mock (rule 14).
class RecordingPosts extends MockSocialProvider {
  calls: CreatePostInput[] = [];
  override async createPost(input: CreatePostInput) {
    this.calls.push(input);
    return super.createPost(input);
  }
}

const db = serviceClient();
const WEEK = 7 * 86_400_000;
let social: RecordingPosts;
let tenantId: string;
let userId: string;
let accountId: string;
const deps = (now?: Date) => ({ db, social: () => social, ...(now ? { now: () => now } : {}) });

const repeatRow = async (id: string) =>
  (
    await db
      .from("post_repeats")
      .select(
        "made_count, last_post_id, last_slot, finished_at, stopped_at, last_error, next_try_at",
      )
      .eq("id", id)
      .single()
  ).data!;

async function firstPost(content: string, inMs = 3_600_000) {
  const result = await createPost(
    { db, social: () => social },
    {
      tenantId,
      userId,
      content,
      accountIds: [accountId],
      // On the minute, like the composer's picker.
      scheduledFor: new Date(Math.ceil((Date.now() + inMs) / 60_000) * 60_000),
      media: [
        { url: "https://cdn.example.com/special.jpg", type: "image", width: 1080, height: 1080 },
      ],
    },
  );
  if (!result.ok) throw new Error(`createPost failed: ${result.error}`);
  return result.postId;
}

const markGone = (postId: string) =>
  db.from("posts").update({ status: "published" }).eq("id", postId);

beforeAll(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = inject("supabaseUrl");
  process.env.SUPABASE_SERVICE_ROLE_KEY = inject("supabaseServiceKey");
  const { data } = await anonClient().auth.signUp({
    email: uniqueEmail(),
    password: "password123",
  });
  userId = data.user!.id;
  const { data: rows } = await db.rpc("create_owner_tenant", {
    p_user_id: userId,
    p_name: "Repeat Cafe",
  });
  tenantId = rows![0].tenant_id;
  const { data: account } = await db
    .from("social_accounts")
    .insert({
      tenant_id: tenantId,
      zernio_account_id: `acc_${randomUUID().slice(0, 8)}`,
      platform: "instagram",
      username: "repeatcafe",
    })
    .select("id")
    .single();
  accountId = account!.id;
});

afterAll(async () => {
  await db.from("tenants").delete().eq("id", tenantId);
  await db.auth.admin.deleteUser(userId);
});

describe("repeat posts (Posts Round 5)", () => {
  it("makes the next post a week later once the last one went out, then finishes after N", async () => {
    social = new RecordingPosts();
    const first = await firstPost("Weekend special: cinnamon rolls");
    const repeatId = await createRepeat(db, {
      tenantId,
      userId,
      postId: first,
      choice: { every: "week", ends: "after", count: 3 },
      timeZone: "America/New_York",
    });
    expect(repeatId).toBeTruthy();
    const firstRow = (
      await db.from("posts").select("repeat_id, scheduled_for").eq("id", first).single()
    ).data!;
    expect(firstRow.repeat_id).toBe(repeatId);

    // The first one is still planned: nothing new.
    expect(await scheduleRepeats(deps(), { tenantId })).toEqual({
      made: 0,
      finished: 0,
      failed: 0,
    });

    // It went out: the next one, same text and photo, a week later, through Zernio.
    await markGone(first);
    social.calls = [];
    expect(await scheduleRepeats(deps(), { tenantId })).toMatchObject({ made: 1 });
    const second = await repeatRow(repeatId!);
    expect(second.made_count).toBe(2);
    const { data: made } = await db
      .from("posts")
      .select("id, content, media, scheduled_for, repeat_id, status")
      .eq("id", second.last_post_id!)
      .single();
    expect(made).toMatchObject({
      content: "Weekend special: cinnamon rolls",
      repeat_id: repeatId,
      status: "scheduled",
    });
    expect((made!.media as { url: string }[])[0].url).toBe("https://cdn.example.com/special.jpg");
    expect(
      new Date(made!.scheduled_for!).getTime() - new Date(firstRow.scheduled_for!).getTime(),
    ).toBe(WEEK);
    expect(social.calls).toHaveLength(1);
    expect(social.calls[0].publishAt?.toISOString()).toBe(
      new Date(made!.scheduled_for!).toISOString(),
    );

    // Third and last.
    await markGone(made!.id);
    expect(await scheduleRepeats(deps(), { tenantId })).toMatchObject({ made: 1 });
    const third = await repeatRow(repeatId!);
    expect(third.made_count).toBe(3);

    // After 3 times in all, it's finished; no fourth post.
    await markGone(third.last_post_id!);
    expect(await scheduleRepeats(deps(), { tenantId })).toMatchObject({ made: 0, finished: 1 });
    expect((await repeatRow(repeatId!)).finished_at).not.toBeNull();
    const { count } = await db
      .from("posts")
      .select("id", { count: "exact", head: true })
      .eq("repeat_id", repeatId!);
    expect(count).toBe(3);
    const { data: audit } = await db
      .from("audit_log")
      .select("action")
      .eq("tenant_id", tenantId)
      .in("action", ["post_repeat_created", "post_repeat_finished"]);
    expect(audit!.map((a) => a.action).sort()).toEqual([
      "post_repeat_created",
      "post_repeat_finished",
    ]);
  });

  it("skips times missed while it waited, never posting late", async () => {
    social = new RecordingPosts();
    const first = await firstPost("Daily soup");
    const repeatId = await createRepeat(db, {
      tenantId,
      userId,
      postId: first,
      choice: { every: "day", ends: "never" },
      timeZone: "UTC",
    });
    await markGone(first);
    // Three days later: the next one is tomorrow's, not the missed ones.
    const later = new Date(Date.now() + 3 * 86_400_000 + 2 * 3_600_000);
    expect(await scheduleRepeats(deps(later), { tenantId })).toMatchObject({ made: 1 });
    const row = await repeatRow(repeatId!);
    expect(new Date(row.last_slot).getTime()).toBeGreaterThan(later.getTime());
    expect(new Date(row.last_slot).getTime() - later.getTime()).toBeLessThanOrEqual(86_400_000);
    await stopRepeat(db, { tenantId, userId, repeatId: repeatId! });
  });

  it("Stop repeating: the planned post stays, no more after it", async () => {
    social = new RecordingPosts();
    const first = await firstPost("Taco Tuesday");
    const repeatId = await createRepeat(db, {
      tenantId,
      userId,
      postId: first,
      choice: { every: "week", ends: "never" },
      timeZone: "UTC",
    });
    expect(await stopRepeat(db, { tenantId, userId, repeatId: repeatId! })).toEqual({ ok: true });
    expect(await stopRepeat(db, { tenantId, userId, repeatId: repeatId! })).toEqual({
      ok: false,
      error: "not_found",
    });
    await markGone(first);
    expect(await scheduleRepeats(deps(), { tenantId })).toMatchObject({ made: 0 });
    expect((await db.from("posts").select("status").eq("id", first).single()).data!.status).toBe(
      "published",
    );
  });

  it("This and the ones after: the next posts take the edited text and time", async () => {
    social = new RecordingPosts();
    const first = await firstPost("Old text");
    const repeatId = await createRepeat(db, {
      tenantId,
      userId,
      postId: first,
      choice: { every: "week", ends: "never" },
      timeZone: "UTC",
    });
    const moved = new Date(Math.ceil((Date.now() + 2 * 3_600_000) / 60_000) * 60_000);
    await db
      .from("posts")
      .update({ content: "New text", scheduled_for: moved.toISOString() })
      .eq("id", first);
    expect(await applyEditToRepeat(db, { tenantId, userId, postId: first })).toBe(true);
    await markGone(first);
    expect(await scheduleRepeats(deps(), { tenantId })).toMatchObject({ made: 1 });
    const row = await repeatRow(repeatId!);
    const { data: next } = await db
      .from("posts")
      .select("content, scheduled_for")
      .eq("id", row.last_post_id!)
      .single();
    expect(next!.content).toBe("New text");
    expect(new Date(next!.scheduled_for!).getTime() - moved.getTime()).toBe(WEEK);
    await stopRepeat(db, { tenantId, userId, repeatId: repeatId! });
  });

  it("waits an hour when an account stopped connecting, saying why", async () => {
    social = new RecordingPosts();
    const first = await firstPost("Happy hour");
    const repeatId = await createRepeat(db, {
      tenantId,
      userId,
      postId: first,
      choice: { every: "week", ends: "never" },
      timeZone: "UTC",
    });
    await markGone(first);
    await db.from("social_accounts").update({ status: "disconnected" }).eq("id", accountId);
    try {
      expect(await scheduleRepeats(deps(), { tenantId })).toMatchObject({ made: 0, failed: 1 });
      const row = await repeatRow(repeatId!);
      expect(row.last_error).toBe("account_disconnected");
      expect(new Date(row.next_try_at!).getTime()).toBeGreaterThan(Date.now() + 50 * 60_000);
      // Not tried again before then.
      expect(await scheduleRepeats(deps(), { tenantId })).toMatchObject({ made: 0, failed: 0 });
    } finally {
      await db.from("social_accounts").update({ status: "active" }).eq("id", accountId);
      await stopRepeat(db, { tenantId, userId, repeatId: repeatId! });
    }
  });
});
