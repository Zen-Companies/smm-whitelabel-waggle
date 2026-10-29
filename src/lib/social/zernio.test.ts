import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SocialProviderError } from "./types";
import { createZernioProvider, type ZernioSocialProvider } from "./zernio";

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
