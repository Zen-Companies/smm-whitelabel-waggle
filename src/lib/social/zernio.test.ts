import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SocialProviderError } from "./types";
import {
  createZernioProvider,
  isPlatformPaused,
  parseRetryAfter,
  pickTikTokPrivacy,
  type ZernioSocialProvider,
} from "./zernio";

// The real @zernio/node SDK runs; only fetch is replaced, so no call reaches Zernio.
interface Captured {
  method: string;
  url: URL;
  headers: Headers;
  body: unknown;
}

let captured: Captured[];
let respond: (req: Captured) => Response;
let provider: ZernioSocialProvider;

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });

beforeEach(() => {
  captured = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      // Like real fetch: an aborted signal rejects before anything is sent.
      if (request.signal.aborted) throw request.signal.reason;
      const text = await request.text();
      const req: Captured = {
        method: request.method,
        url: new URL(request.url),
        headers: request.headers,
        body: text ? JSON.parse(text) : undefined,
      };
      captured.push(req);
      return respond(req);
    }),
  );
  provider = createZernioProvider({ apiKey: "sk_test_zernio" });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ZernioSocialProvider", () => {
  it("createProfile sends name + externalId with an idempotency key", async () => {
    respond = () => json({ message: "ok", profile: { _id: "prof_1", name: "Demo" } }, 201);

    await expect(
      provider.createProfile({ name: "Demo", externalId: "tenant-1", idempotencyKey: "key-1" }),
    ).resolves.toEqual({ profileId: "prof_1", alreadyExisted: false });

    const [req] = captured;
    expect(req.method).toBe("POST");
    expect(req.url.href).toBe("https://zernio.com/api/v1/profiles");
    expect(req.headers.get("Authorization")).toBe("Bearer sk_test_zernio");
    expect(req.headers.get("Idempotency-Key")).toBe("key-1");
    expect(req.body).toEqual({ name: "Demo", externalId: "tenant-1" });
  });

  it("createProfile returns the existing profile on an externalId conflict", async () => {
    respond = () =>
      json(
        {
          error: "Profile with this externalId already exists",
          code: "profile_external_id_conflict",
          details: { existingProfileId: "prof_existing" },
        },
        409,
      );
    await expect(provider.createProfile({ name: "Demo", externalId: "tenant-1" })).resolves.toEqual(
      {
        profileId: "prof_existing",
        alreadyExisted: true,
      },
    );
  });

  it("createProfile does not adopt a profile that only shares the name", async () => {
    respond = () =>
      json({ error: "name taken", details: { existingProfileId: "prof_other" } }, 409);
    await expect(
      provider.createProfile({ name: "Demo", externalId: "tenant-1" }),
    ).rejects.toMatchObject({
      details: { status: 409, ambiguous: false },
    });
  });

  it("getConnectUrl passes profileId and redirect_url", async () => {
    respond = () => json({ authUrl: "https://www.instagram.com/oauth/authorize?x=1", state: "s" });

    await expect(
      provider.getConnectUrl({
        platform: "instagram",
        profileId: "prof_1",
        redirectUrl: "https://app.test/settings",
      }),
    ).resolves.toEqual({ authUrl: "https://www.instagram.com/oauth/authorize?x=1" });

    const [req] = captured;
    expect(req.method).toBe("GET");
    expect(req.url.pathname).toBe("/api/v1/connect/instagram");
    expect(req.url.searchParams.get("profileId")).toBe("prof_1");
    expect(req.url.searchParams.get("redirect_url")).toBe("https://app.test/settings");
  });

  it("connectBluesky sends the app password with state {userId}-{profileId}", async () => {
    respond = (req) =>
      req.url.pathname === "/api/v1/users"
        ? json({ currentUserId: "user_9", users: [] })
        : json({ message: "ok", account: { _id: "acc_bs", username: "cafe.bsky.social" } });

    await expect(
      provider.connectBluesky({
        profileId: "prof_1",
        identifier: "cafe.bsky.social",
        appPassword: "abcd-efgh-ijkl-mnop",
      }),
    ).resolves.toEqual({ account: { accountId: "acc_bs", username: "cafe.bsky.social" } });

    const [users, connect] = captured;
    expect(users.url.pathname).toBe("/api/v1/users");
    expect(connect.method).toBe("POST");
    expect(connect.url.pathname).toBe("/api/v1/connect/bluesky/credentials");
    expect(connect.body).toEqual({
      identifier: "cafe.bsky.social",
      appPassword: "abcd-efgh-ijkl-mnop",
      state: "user_9-prof_1",
    });

    // The user id is looked up once.
    await provider.connectBluesky({ profileId: "prof_2", identifier: "x", appPassword: "y" });
    expect(captured.filter((r) => r.url.pathname === "/api/v1/users")).toHaveLength(1);
  });

  it("listReviews asks for Google reviews and keeps their stars (T61)", async () => {
    respond = () =>
      json({
        data: [
          {
            id: "accounts/1/locations/2/reviews/3",
            rating: 2,
            text: "Slow",
            created: "2026-11-12T01:00:00Z",
          },
        ],
      });
    const [review] = await provider.listReviews({ accountId: "acc_g", platform: "googlebusiness" });
    expect(captured[0].url.searchParams.get("platform")).toBe("googlebusiness");
    expect(review).toMatchObject({ id: "accounts/1/locations/2/reviews/3", rating: 2 });
  });

  it("Telegram: a code for the bot, then its status", async () => {
    respond = (req) =>
      req.method === "GET"
        ? json({
            code: "ZRN-ABC123",
            expiresAt: "2026-11-12T10:15:00Z",
            expiresIn: 900,
            botUsername: "LateScheduleBot",
          })
        : json({
            status: "connected",
            chatTitle: "Harbour Bean",
            account: { _id: "acc_tg", platform: "telegram", username: "harbourbean" },
          });
    await expect(provider.startTelegramConnect({ profileId: "prof_1" })).resolves.toEqual({
      code: "ZRN-ABC123",
      expiresAt: "2026-11-12T10:15:00Z",
      botUsername: "LateScheduleBot",
    });
    expect(captured[0].url.pathname).toBe("/api/v1/connect/telegram");
    expect(captured[0].url.searchParams.get("profileId")).toBe("prof_1");

    await expect(provider.checkTelegramConnect({ code: "ZRN-ABC123" })).resolves.toEqual({
      status: "connected",
      accountId: "acc_tg",
      username: "harbourbean",
    });
    expect(captured[1].method).toBe("PATCH");
    expect(captured[1].url.searchParams.get("code")).toBe("ZRN-ABC123");
  });

  it("connectBluesky reports a refused app password as a 401", async () => {
    respond = (req) =>
      req.url.pathname === "/api/v1/users"
        ? json({ currentUserId: "user_9" })
        : json({ error: "Invalid identifier or password" }, 401);
    await expect(
      provider.connectBluesky({ profileId: "prof_1", identifier: "a", appPassword: "b" }),
    ).rejects.toMatchObject({ details: { status: 401, ambiguous: false } });
  });

  it("createPost schedules with scheduledFor, mediaItems and Idempotency-Key", async () => {
    respond = () => json({ post: { _id: "post_1", status: "scheduled" } }, 201);

    await expect(
      provider.createPost({
        content: "Fresh pastries today",
        mediaUrls: ["https://media.test/a.jpg"],
        targets: [{ platform: "instagram", accountId: "acc_1" }],
        publishAt: new Date("2026-11-01T09:00:00Z"),
        idempotencyKey: "post-key",
      }),
    ).resolves.toEqual({ providerPostId: "post_1", status: "scheduled" });

    const [req] = captured;
    expect(req.url.pathname).toBe("/api/v1/posts");
    expect(req.headers.get("Idempotency-Key")).toBe("post-key");
    expect(req.body).toEqual({
      content: "Fresh pastries today",
      mediaItems: [{ url: "https://media.test/a.jpg" }],
      platforms: [{ platform: "instagram", accountId: "acc_1" }],
      scheduledFor: "2026-11-01T09:00:00.000Z",
    });
  });

  it("createPost with publishAt null publishes now", async () => {
    respond = () => json({ post: { _id: "post_2", status: "published" } }, 201);
    await provider.createPost({
      content: "Now",
      targets: [{ platform: "facebook", accountId: "acc_2" }],
      publishAt: null,
      idempotencyKey: "k",
    });
    expect(captured[0].body).toMatchObject({ publishNow: true });
    expect(captured[0].body).not.toHaveProperty("scheduledFor");
  });

  it("replyToComment posts to the post's comments with commentId and Idempotency-Key", async () => {
    respond = () => json({ success: true, data: { commentId: "reply_1", isReply: true } });

    await expect(
      provider.replyToComment({
        accountId: "acc_1",
        postId: "17890000000000000",
        commentId: "c_1",
        message: "Thanks! We open at 8.",
        idempotencyKey: "draft-key",
      }),
    ).resolves.toEqual({ providerReplyId: "reply_1" });

    const [req] = captured;
    expect(req.method).toBe("POST");
    expect(req.url.pathname).toBe("/api/v1/inbox/comments/17890000000000000");
    expect(req.headers.get("Idempotency-Key")).toBe("draft-key");
    expect(req.body).toEqual({
      accountId: "acc_1",
      commentId: "c_1",
      message: "Thanks! We open at 8.",
    });
  });

  it("hideComment posts to the comment's hide path with accountId (T40)", async () => {
    respond = () => json({ status: "ok", commentId: "c_1", hidden: true, platform: "instagram" });

    await provider.hideComment({ accountId: "acc_1", postId: "p_1", commentId: "c_1" });

    const [req] = captured;
    expect(req.method).toBe("POST");
    expect(req.url.pathname).toBe("/api/v1/inbox/comments/p_1/c_1/hide");
    expect(req.body).toEqual({ accountId: "acc_1" });
  });

  it("unhideComment deletes the hide with accountId in the query (T40)", async () => {
    respond = () => json({ status: "ok", commentId: "c_1", hidden: false, platform: "instagram" });

    await provider.unhideComment({ accountId: "acc_1", postId: "p_1", commentId: "c_1" });

    const [req] = captured;
    expect(req.method).toBe("DELETE");
    expect(req.url.pathname).toBe("/api/v1/inbox/comments/p_1/c_1/hide");
    expect(req.url.searchParams.get("accountId")).toBe("acc_1");
  });

  it("hideComment on a comment that's gone is a 400 with the platform code, not ambiguous", async () => {
    respond = () =>
      json({ error: "Comment not found", type: "platform_error", code: "PLATFORM_API_ERROR" }, 400);

    const error = await provider
      .hideComment({ accountId: "acc_1", postId: "p_1", commentId: "c_1" })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SocialProviderError);
    expect((error as SocialProviderError).details).toMatchObject({
      status: 400,
      code: "PLATFORM_API_ERROR",
      ambiguous: false,
    });
  });

  it("sendPrivateReply posts the message to the comment's private-reply path (T41)", async () => {
    respond = () =>
      json({ status: "sent", messageId: "m_9", commentId: "c_1", platform: "instagram" });

    await expect(
      provider.sendPrivateReply({
        accountId: "acc_1",
        postId: "p_1",
        commentId: "c_1",
        message: "Hi Maria! 3 dozen is ₱540.",
      }),
    ).resolves.toEqual({ providerMessageId: "m_9" });

    const [req] = captured;
    expect(req.method).toBe("POST");
    expect(req.url.pathname).toBe("/api/v1/inbox/comments/p_1/c_1/private-reply");
    expect(req.body).toEqual({ accountId: "acc_1", message: "Hi Maria! 3 dozen is ₱540." });
  });

  it("a spent private reply is a 400 flagged privateReplyConsumed (never retried)", async () => {
    respond = () =>
      json(
        {
          error: "This comment already received a private reply",
          code: "PLATFORM_API_ERROR",
          details: { privateReplyConsumed: true },
        },
        400,
      );

    const error = await provider
      .sendPrivateReply({ accountId: "acc_1", postId: "p_1", commentId: "c_1", message: "Hi" })
      .catch((e: unknown) => e);
    expect((error as SocialProviderError).details).toMatchObject({
      status: 400,
      ambiguous: false,
      privateReplyConsumed: true,
    });
  });

  it("a 502 with an unknown private reply outcome is ambiguous: reconcile before anything else", async () => {
    respond = () => json({ error: "Meta error", details: { privateReplyOutcome: "unknown" } }, 502);

    const error = await provider
      .sendPrivateReply({ accountId: "acc_1", postId: "p_1", commentId: "c_1", message: "Hi" })
      .catch((e: unknown) => e);
    expect((error as SocialProviderError).details).toMatchObject({ status: 502, ambiguous: true });
    expect((error as SocialProviderError).details.privateReplyConsumed).toBeUndefined();
  });

  it("listReviews reads the Page's Facebook reviews and maps recommendations (T42)", async () => {
    respond = () =>
      json({
        status: "ok",
        data: [
          {
            id: "rev_1",
            platform: "facebook",
            reviewer: { id: null, name: "Lara V" },
            rating: 0,
            recommendationType: "negative",
            text: "Waited 40 minutes.",
            created: "2026-11-05T10:12:00Z",
            hasReply: false,
            reviewUrl: "https://www.facebook.com/r/1",
          },
          {
            id: "rev_2",
            reviewer: { name: "Ben" },
            recommendationType: "positive",
            text: "Great!",
            created: "2026-11-05T09:40:00Z",
            hasReply: true,
            reviewUrl: null,
          },
        ],
        pagination: { hasMore: false, nextCursor: null },
      });

    await expect(provider.listReviews({ accountId: "acc_1" })).resolves.toEqual([
      {
        id: "rev_1",
        reviewerName: "Lara V",
        recommends: false,
        text: "Waited 40 minutes.",
        rating: null,
        createdAt: "2026-11-05T10:12:00Z",
        hasReply: false,
        reviewUrl: "https://www.facebook.com/r/1",
      },
      {
        id: "rev_2",
        reviewerName: "Ben",
        recommends: true,
        text: "Great!",
        rating: null,
        createdAt: "2026-11-05T09:40:00Z",
        hasReply: true,
        reviewUrl: null,
      },
    ]);
    const [req] = captured;
    expect(req.url.pathname).toBe("/api/v1/inbox/reviews");
    expect(req.url.searchParams.get("platform")).toBe("facebook");
    expect(req.url.searchParams.get("accountId")).toBe("acc_1");
  });

  it("replyToReview posts the reply with accountId and Idempotency-Key (T42)", async () => {
    respond = () =>
      json({
        status: "ok",
        reply: { id: "reply_9", text: "Sorry", created: "2026-11-05T10:20:00Z" },
        platform: "facebook",
      });

    await expect(
      provider.replyToReview({
        accountId: "acc_1",
        reviewId: "rev_1",
        message: "Sorry, Lara.",
        idempotencyKey: "draft-key",
      }),
    ).resolves.toEqual({ providerReplyId: "reply_9" });
    const [req] = captured;
    expect(req.method).toBe("POST");
    expect(req.url.pathname).toBe("/api/v1/inbox/reviews/rev_1/reply");
    expect(req.headers.get("Idempotency-Key")).toBe("draft-key");
    expect(req.body).toEqual({ accountId: "acc_1", message: "Sorry, Lara." });
  });

  it("sendDm posts to the conversation with Idempotency-Key", async () => {
    respond = () => json({ success: true, data: { messageId: "m_1", conversationId: "conv_1" } });

    await expect(
      provider.sendDm({
        accountId: "acc_1",
        conversationId: "conv_1",
        message: "Hi!",
        idempotencyKey: "dm-key",
      }),
    ).resolves.toEqual({ providerMessageId: "m_1" });

    const [req] = captured;
    expect(req.url.pathname).toBe("/api/v1/inbox/conversations/conv_1/messages");
    expect(req.headers.get("Idempotency-Key")).toBe("dm-key");
    expect(req.body).toEqual({ accountId: "acc_1", message: "Hi!" });
  });

  it("listConversationMessages reads newest first", async () => {
    respond = () =>
      json({
        messages: [
          { id: "m_2", direction: "outgoing", message: "Hi!", createdAt: "2026-10-28T10:01:00Z" },
          { id: "m_1", direction: "incoming", message: null, createdAt: "2026-10-28T10:00:00Z" },
        ],
      });

    await expect(
      provider.listConversationMessages({ conversationId: "conv_1", accountId: "acc_1" }),
    ).resolves.toEqual([
      { id: "m_2", direction: "outgoing", text: "Hi!", createdAt: "2026-10-28T10:01:00Z" },
      { id: "m_1", direction: "incoming", text: null, createdAt: "2026-10-28T10:00:00Z" },
    ]);
    const [req] = captured;
    expect(req.url.pathname).toBe("/api/v1/inbox/conversations/conv_1/messages");
    expect(Object.fromEntries(req.url.searchParams)).toEqual({
      accountId: "acc_1",
      limit: "20",
      sortOrder: "desc",
    });
  });

  it("listCommentReplies reads one comment's replies and marks our own", async () => {
    respond = () =>
      json({
        status: "success",
        comment: { id: "c_1", message: "Open Sunday?" },
        comments: [
          {
            id: "r_1",
            message: "Yes, 8am to 10pm.",
            createdTime: "2026-10-28T10:01:00Z",
            from: { id: "me", isOwner: true },
          },
          { id: "r_2", message: "same q", from: { id: "x", isOwner: false } },
        ],
      });

    await expect(
      provider.listCommentReplies({ accountId: "acc_1", postId: "1789", commentId: "c_1" }),
    ).resolves.toEqual([
      { id: "r_1", text: "Yes, 8am to 10pm.", fromOwner: true, createdAt: "2026-10-28T10:01:00Z" },
      { id: "r_2", text: "same q", fromOwner: false, createdAt: null },
    ]);
    const [req] = captured;
    expect(req.method).toBe("GET");
    expect(req.url.pathname).toBe("/api/v1/inbox/comments/1789");
    expect(Object.fromEntries(req.url.searchParams)).toEqual({
      accountId: "acc_1",
      commentId: "c_1",
      limit: "50",
    });
  });

  it("a send aborts when the caller's signal fires (ambiguous)", async () => {
    respond = () => json({ success: true, data: { messageId: "m_1" } });
    const controller = new AbortController();
    controller.abort();
    const error = (await provider
      .sendDm({
        accountId: "acc_1",
        conversationId: "conv_1",
        message: "Hi!",
        idempotencyKey: "dm-key",
        signal: controller.signal,
      })
      .catch((e: unknown) => e)) as SocialProviderError;
    expect(error).toBeInstanceOf(SocialProviderError);
    expect(error.details.ambiguous).toBe(true);
    expect(captured).toHaveLength(0);
  });

  it("listCommentedPosts asks for posts with comments since a time (T16)", async () => {
    respond = () =>
      json({ data: [{ id: "1789", commentCount: 3 }], pagination: { hasMore: false } });
    await expect(
      provider.listCommentedPosts({ accountId: "acc_1", since: new Date("2026-10-28T10:00:00Z") }),
    ).resolves.toEqual([{ postId: "1789" }]);
    const [req] = captured;
    expect(req.url.pathname).toBe("/api/v1/inbox/comments");
    expect(Object.fromEntries(req.url.searchParams)).toEqual({
      accountId: "acc_1",
      since: "2026-10-28T10:00:00.000Z",
      limit: "20",
      minComments: "1",
      sortBy: "date",
      sortOrder: "desc",
    });
  });

  it("listPostComments maps a post's comments (T16)", async () => {
    respond = () =>
      json({
        comments: [
          {
            id: "c_1",
            message: "Open Sunday?",
            createdTime: "2026-10-28T10:01:00Z",
            from: { username: "mika.r", isOwner: false },
          },
          { id: "c_2", message: "Yes!", from: { name: "Cafe", isOwner: true } },
        ],
      });
    await expect(
      provider.listPostComments({ accountId: "acc_1", postId: "1789" }),
    ).resolves.toEqual([
      {
        id: "c_1",
        text: "Open Sunday?",
        authorName: "mika.r",
        fromOwner: false,
        createdAt: "2026-10-28T10:01:00Z",
      },
      { id: "c_2", text: "Yes!", authorName: "Cafe", fromOwner: true, createdAt: null },
    ]);
    expect(captured[0].url.pathname).toBe("/api/v1/inbox/comments/1789");
  });

  it("getUsageByProfile reads the cycle's spend per profile (T17)", async () => {
    respond = () =>
      json({
        supported: true,
        period: { start: "2026-10-01", end: "2026-10-31", source: "cycle" },
        totals: { total: 42.5 },
        attribution: {
          groupBy: "profile",
          groups: [
            { key: "prof_a", totalUsd: 30, byProduct: { accounts: 30 } },
            { key: "prof_b", totalUsd: 10.5 },
          ],
          unattributed: { totalUsd: 2 },
          totals: { totalUsd: 42.5 },
        },
      });
    await expect(provider.getUsageByProfile()).resolves.toEqual({
      periodStart: "2026-10-01",
      periodEnd: "2026-10-31",
      totalUsd: 42.5,
      unattributedUsd: 2,
      byProfile: [
        { profileId: "prof_a", totalUsd: 30 },
        { profileId: "prof_b", totalUsd: 10.5 },
      ],
    });
    expect(captured[0].url.pathname).toBe("/api/v1/usage");
    expect(Object.fromEntries(captured[0].url.searchParams)).toEqual({
      range: "cycle",
      groupBy: "profile",
    });
  });

  it("getAccountsHealth filters by profile and maps accounts", async () => {
    respond = () =>
      json({
        summary: { total: 1 },
        accounts: [
          {
            accountId: "acc_1",
            platform: "instagram",
            username: "democafe",
            status: "error",
            needsReconnect: true,
            canPost: false,
            issues: ["token_expired"],
          },
        ],
      });

    await expect(provider.getAccountsHealth({ profileId: "prof_1" })).resolves.toEqual([
      {
        accountId: "acc_1",
        platform: "instagram",
        username: "democafe",
        status: "error",
        needsReconnect: true,
        canPost: false,
        issues: ["token_expired"],
      },
    ]);
    expect(captured[0].url.pathname).toBe("/api/v1/accounts/health");
    expect(captured[0].url.searchParams.get("profileId")).toBe("prof_1");
  });

  it("listAccountPictures reads profilePicture per account (null when missing)", async () => {
    respond = () =>
      json({
        hasAnalyticsAccess: false,
        accounts: [
          { _id: "acc_1", platform: "instagram", profilePicture: "https://cdn.example.com/p.jpg" },
          { _id: "acc_2", platform: "facebook", profilePicture: null },
          { _id: "acc_3", platform: "facebook" },
        ],
      });
    await expect(provider.listAccountPictures({ profileId: "prof_1" })).resolves.toEqual([
      { accountId: "acc_1", pictureUrl: "https://cdn.example.com/p.jpg" },
      { accountId: "acc_2", pictureUrl: null },
      { accountId: "acc_3", pictureUrl: null },
    ]);
    expect(captured[0].url.pathname).toBe("/api/v1/accounts");
    expect(captured[0].url.searchParams.get("profileId")).toBe("prof_1");
  });

  describe("errors", () => {
    const send = () =>
      provider.sendDm({
        accountId: "acc_1",
        conversationId: "conv_1",
        message: "Hi",
        idempotencyKey: "k",
      });

    it("marks a 500 as ambiguous (reconcile before retrying)", async () => {
      respond = () => json({ error: "Internal error" }, 500);
      const error = await send().catch((e: unknown) => e);
      expect(error).toBeInstanceOf(SocialProviderError);
      expect((error as SocialProviderError).details).toMatchObject({
        status: 500,
        ambiguous: true,
      });
    });

    it("marks a 400 as not ambiguous and keeps the code", async () => {
      respond = () => json({ error: "Outside window", code: "platform_api_error" }, 400);
      await expect(send()).rejects.toMatchObject({
        details: { status: 400, code: "platform_api_error", ambiguous: false },
      });
    });

    it("reads the rate-limit reset on 429", async () => {
      const reset = Math.floor(Date.now() / 1000) + 30;
      respond = () =>
        json({ error: "Too many requests" }, 429, { "X-RateLimit-Reset": String(reset) });
      const error = (await send().catch((e: unknown) => e)) as SocialProviderError;
      expect(error.details.status).toBe(429);
      expect(error.details.ambiguous).toBe(false);
      expect(error.details.retryAfterSeconds).toBeGreaterThan(25);
      expect(error.details.retryAfterSeconds).toBeLessThanOrEqual(30);
    });

    it("429 prefers Retry-After (seconds) over X-RateLimit-Reset (T20)", async () => {
      const reset = Math.floor(Date.now() / 1000) + 300;
      respond = () =>
        json({ error: "Too many requests" }, 429, {
          "Retry-After": "12",
          "X-RateLimit-Reset": String(reset),
        });
      const error = (await send().catch((e: unknown) => e)) as SocialProviderError;
      expect(error.details).toMatchObject({ status: 429, retryAfterSeconds: 12, ambiguous: false });
    });

    it("429 reads Retry-After as an HTTP date", async () => {
      const at = new Date(Date.now() + 45_000).toUTCString();
      respond = () => json({ error: "Too many requests" }, 429, { "Retry-After": at });
      const error = (await send().catch((e: unknown) => e)) as SocialProviderError;
      expect(error.details.retryAfterSeconds).toBeGreaterThan(40);
      expect(error.details.retryAfterSeconds).toBeLessThanOrEqual(45);
    });

    it("429 with neither header leaves the wait to the caller's fallback", async () => {
      respond = () => json({ error: "Too many requests" }, 429);
      const error = (await send().catch((e: unknown) => e)) as SocialProviderError;
      expect(error.details).toMatchObject({ status: 429 });
      expect(error.details.retryAfterSeconds).toBeUndefined();
    });

    it("409 with the key still in flight carries Retry-After", async () => {
      respond = () =>
        json({ error: "in flight", code: "idempotency_conflict" }, 409, { "Retry-After": "3" });
      const error = (await send().catch((e: unknown) => e)) as SocialProviderError;
      expect(error.details).toMatchObject({ status: 409, retryAfterSeconds: 3 });
    });

    it("402 PAYMENT_REQUIRED is recognised as a platform pause (T19)", async () => {
      respond = () =>
        json(
          {
            error: "Payment required",
            code: "PAYMENT_REQUIRED",
            billingUrl: "https://zernio.com/billing",
          },
          402,
        );
      const error = await send().catch((e: unknown) => e);
      expect(isPlatformPaused(error)).toBe(true);
      expect(
        isPlatformPaused(new SocialProviderError("x", { status: 400, ambiguous: false })),
      ).toBe(false);
    });

    it("marks a network failure as ambiguous", async () => {
      respond = () => {
        throw new TypeError("fetch failed");
      };
      const error = (await send().catch((e: unknown) => e)) as SocialProviderError;
      expect(error.details).toEqual({ ambiguous: true });
    });

    it("rejects a 2xx response without the expected id", async () => {
      respond = () => json({ success: true, data: {} });
      await expect(send()).rejects.toMatchObject({
        message: expect.stringMatching(/unexpected response shape/),
      });
    });

    it("never puts the message text in the error", async () => {
      respond = () => json({ error: "boom" }, 500);
      const error = (await provider
        .sendDm({
          accountId: "a",
          conversationId: "c",
          message: "secret customer text",
          idempotencyKey: "k",
        })
        .catch((e: unknown) => e)) as Error;
      expect(error.message).not.toContain("secret customer text");
    });
  });
});

describe("parseRetryAfter", () => {
  const now = Date.parse("2026-10-29T12:00:00Z");
  it("reads seconds and HTTP dates, ignores junk", () => {
    expect(parseRetryAfter("30", now)).toBe(30);
    expect(parseRetryAfter("Thu, 29 Oct 2026 12:01:00 GMT", now)).toBe(60);
    expect(parseRetryAfter("Thu, 29 Oct 2026 11:00:00 GMT", now)).toBe(0);
    expect(parseRetryAfter("soon", now)).toBeUndefined();
    expect(parseRetryAfter(null, now)).toBeUndefined();
  });
});

describe("pickTikTokPrivacy", () => {
  it("prefers public, else the first level TikTok offers", () => {
    expect(pickTikTokPrivacy(["SELF_ONLY", "PUBLIC_TO_EVERYONE"])).toBe("PUBLIC_TO_EVERYONE");
    expect(pickTikTokPrivacy([undefined, "FOLLOWER_OF_CREATOR"])).toBe("FOLLOWER_OF_CREATOR");
    expect(pickTikTokPrivacy([])).toBeNull();
  });
});
