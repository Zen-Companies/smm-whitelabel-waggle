import Zernio, { RateLimitError, ZernioApiError } from "@zernio/node";
import { z } from "zod";
import {
  SocialProviderError,
  type AccountHealth,
  type CreatePostInput,
  type ProviderCommentReply,
  type ProviderMessage,
  type ProviderPostStatus,
  type SocialProvider,
} from "./types";

// The SDK's 300 s default is the whole job route budget; inbox and profile calls are fast.
const DEFAULT_TIMEOUT_MS = 60_000;

const profileSchema = z.object({ profile: z.object({ _id: z.string().min(1) }) });
const profileConflictSchema = z.object({ existingProfileId: z.string().min(1) });
const connectSchema = z.object({ authUrl: z.url() });
const postSchema = z.object({
  post: z.object({
    _id: z.string().min(1),
    status: z.enum([
      "draft",
      "pending_approval",
      "scheduled",
      "publishing",
      "published",
      "partial",
      "failed",
      "cancelled",
    ]),
  }),
});
const presignSchema = z.object({ uploadUrl: z.url(), publicUrl: z.url() });
const replySchema = z.object({ data: z.object({ commentId: z.string().min(1) }) });
const dmSchema = z.object({ data: z.object({ messageId: z.string().min(1) }) });
const messagesSchema = z.object({
  messages: z.array(
    z.object({
      id: z.string().min(1),
      direction: z.enum(["incoming", "outgoing"]),
      message: z.string().nullish(),
      createdAt: z.string(),
    }),
  ),
});
const commentRepliesSchema = z.object({
  comments: z
    .array(
      z.object({
        id: z.string().min(1),
        message: z.string().nullish(),
        createdTime: z.string().nullish(),
        from: z.object({ isOwner: z.boolean().optional() }).nullish(),
      }),
    )
    .optional(),
});
const commentedPostsSchema = z.object({
  data: z
    .array(z.object({ id: z.string().min(1), commentCount: z.number().optional() }))
    .optional(),
});
const postCommentsSchema = z.object({
  comments: z
    .array(
      z.object({
        id: z.string().min(1),
        message: z.string().nullish(),
        createdTime: z.string().nullish(),
        from: z
          .object({
            name: z.string().nullish(),
            username: z.string().nullish(),
            isOwner: z.boolean().optional(),
          })
          .nullish(),
      }),
    )
    .optional(),
});
const healthSchema = z.object({
  accounts: z.array(
    z.object({
      accountId: z.string().min(1),
      platform: z.string(),
      username: z.string().nullish(),
      status: z.enum(["healthy", "warning", "error"]),
      needsReconnect: z.boolean().optional(),
      canPost: z.boolean().optional(),
      issues: z.array(z.string()).optional(),
    }),
  ),
});

function parse<T>(schema: z.ZodType<T>, data: unknown, operation: string): T {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new SocialProviderError(`Zernio ${operation}: unexpected response shape`, {
      ambiguous: false,
    });
  }
  return parsed.data;
}

/**
 * Seconds to wait from a `Retry-After` header: delta-seconds or an HTTP date (RFC 9110).
 * Zernio's multi-tenant guide says to honour it on 429; the SDK only surfaces
 * X-RateLimit-Reset, so the adapter reads the raw response itself (T20).
 */
export function parseRetryAfter(
  value: string | null | undefined,
  now = Date.now(),
): number | undefined {
  const v = value?.trim();
  if (!v) return undefined;
  if (/^\d+$/.test(v)) return Number(v);
  const at = Date.parse(v);
  return Number.isNaN(at) ? undefined : Math.max(0, Math.ceil((at - now) / 1000));
}

/** Zernio team paused for billing: every call returns 402 PAYMENT_REQUIRED (T19). */
export function isPlatformPaused(error: unknown): boolean {
  return (
    error instanceof SocialProviderError &&
    error.details.status === 402 &&
    (error.details.code === undefined || error.details.code === "PAYMENT_REQUIRED")
  );
}

function toSocialError(error: unknown, operation: string, headers?: Headers): SocialProviderError {
  if (error instanceof SocialProviderError) return error;
  if (error instanceof ZernioApiError) {
    return new SocialProviderError(`Zernio ${operation} failed (${error.statusCode})`, {
      status: error.statusCode,
      code: error.code,
      ambiguous: error.statusCode >= 500,
      // Retry-After first (429, and 409 while the same idempotency key is in flight), then
      // the SDK's X-RateLimit-Reset.
      retryAfterSeconds:
        parseRetryAfter(headers?.get("Retry-After")) ??
        (error instanceof RateLimitError ? error.getSecondsUntilReset() : undefined),
    });
  }
  // Timeouts (TimeoutError) and network failures: the request may have been delivered.
  const name = error instanceof Error ? error.name : "unknown";
  return new SocialProviderError(`Zernio ${operation} failed (${name})`, { ambiguous: true });
}

/** Keeps the last response's headers for the error mapping (the SDK drops Retry-After). */
function headerCapture() {
  const captured: { headers?: Headers } = {};
  const fetchWithHeaders: typeof fetch = async (input, init) => {
    const response = await globalThis.fetch(input, init);
    captured.headers = response.headers;
    return response;
  };
  return { captured, fetchWithHeaders };
}

/** The SDK's request options don't declare `fetch`, but its client honours a per-call one. */
type WithFetch = <O extends object>(options: O) => O;

async function call<T>(operation: string, run: (withFetch: WithFetch) => Promise<T>): Promise<T> {
  const { captured, fetchWithHeaders } = headerCapture();
  const withFetch: WithFetch = (options) =>
    ({ ...options, fetch: fetchWithHeaders }) as typeof options;
  try {
    return await run(withFetch);
  } catch (error) {
    throw toSocialError(error, operation, captured.headers);
  }
}

export class ZernioSocialProvider implements SocialProvider {
  constructor(private readonly zernio: Zernio) {}

  async createProfile(input: { name: string; externalId: string; idempotencyKey?: string }) {
    const { captured, fetchWithHeaders } = headerCapture();
    try {
      const { data } = await this.zernio.profiles.createProfile({
        body: { name: input.name, externalId: input.externalId },
        headers: input.idempotencyKey ? { "Idempotency-Key": input.idempotencyKey } : undefined,
        ...({ fetch: fetchWithHeaders } as object),
      });
      const { profile } = parse(profileSchema, data, "createProfile");
      return { profileId: profile._id, alreadyExisted: false };
    } catch (error) {
      // Only an externalId conflict is ours; a name conflict is another tenant's profile.
      if (
        error instanceof ZernioApiError &&
        error.statusCode === 409 &&
        error.code === "profile_external_id_conflict"
      ) {
        const { existingProfileId } = parse(profileConflictSchema, error.details, "createProfile");
        return { profileId: existingProfileId, alreadyExisted: true };
      }
      throw toSocialError(error, "createProfile", captured.headers);
    }
  }

  async getConnectUrl(input: {
    platform: "instagram" | "facebook";
    profileId: string;
    redirectUrl: string;
  }) {
    return call("getConnectUrl", async (withFetch) => {
      const { data } = await this.zernio.connect.getConnectUrl(
        withFetch({
          path: { platform: input.platform },
          query: { profileId: input.profileId, redirect_url: input.redirectUrl },
        }),
      );
      return { authUrl: parse(connectSchema, data, "getConnectUrl").authUrl };
    });
  }

  async createPost(
    input: CreatePostInput,
  ): Promise<{ providerPostId: string; status: ProviderPostStatus }> {
    return call("createPost", async (withFetch) => {
      const { data } = await this.zernio.posts.createPost(
        withFetch({
          body: {
            content: input.content,
            mediaItems: input.mediaUrls?.map((url) => ({ url })),
            platforms: input.targets.map((t) => ({ platform: t.platform, accountId: t.accountId })),
            ...(input.publishAt
              ? { scheduledFor: input.publishAt.toISOString() }
              : { publishNow: true }),
          },
          headers: { "Idempotency-Key": input.idempotencyKey },
        }),
      );
      const { post } = parse(postSchema, data, "createPost");
      return { providerPostId: post._id, status: post.status };
    });
  }

  async uploadMedia(input: {
    filename: string;
    contentType: string;
    bytes: Uint8Array;
    signal?: AbortSignal;
  }): Promise<{ publicUrl: string }> {
    const { uploadUrl, publicUrl } = await call("uploadMedia", async (withFetch) => {
      const { data } = await this.zernio.media.getMediaPresignedUrl(
        withFetch({
          signal: input.signal,
          body: {
            filename: input.filename,
            contentType: input.contentType as never,
            size: input.bytes.byteLength,
          },
        }),
      );
      return parse(presignSchema, data, "uploadMedia");
    });
    // The upload URL is pre-signed storage, not the Zernio API: a plain PUT.
    const res = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": input.contentType },
      body: input.bytes as BodyInit,
      signal: input.signal,
    }).catch(() => null);
    if (!res?.ok) {
      throw new SocialProviderError(`Zernio media upload failed (${res?.status ?? "network"})`, {
        status: res?.status,
        ambiguous: false,
      });
    }
    return { publicUrl };
  }

  async deletePost(input: { postId: string; signal?: AbortSignal }): Promise<void> {
    await call("deletePost", async (withFetch) => {
      await this.zernio.posts.deletePost(
        withFetch({ signal: input.signal, path: { postId: input.postId } }),
      );
    });
  }

  async replyToComment(input: {
    accountId: string;
    postId: string;
    commentId: string;
    message: string;
    idempotencyKey: string;
    signal?: AbortSignal;
  }) {
    return call("replyToComment", async (withFetch) => {
      const { data } = await this.zernio.comments.replyToInboxPost(
        withFetch({
          signal: input.signal,
          path: { postId: input.postId },
          body: { accountId: input.accountId, commentId: input.commentId, message: input.message },
          headers: { "Idempotency-Key": input.idempotencyKey },
        }),
      );
      return { providerReplyId: parse(replySchema, data, "replyToComment").data.commentId };
    });
  }

  async sendDm(input: {
    accountId: string;
    conversationId: string;
    message: string;
    idempotencyKey: string;
    signal?: AbortSignal;
  }) {
    return call("sendDm", async (withFetch) => {
      const { data } = await this.zernio.messages.sendInboxMessage(
        withFetch({
          signal: input.signal,
          path: { conversationId: input.conversationId },
          body: { accountId: input.accountId, message: input.message },
          headers: { "Idempotency-Key": input.idempotencyKey },
        }),
      );
      return { providerMessageId: parse(dmSchema, data, "sendDm").data.messageId };
    });
  }

  async listConversationMessages(input: {
    conversationId: string;
    accountId: string;
    limit?: number;
    signal?: AbortSignal;
  }): Promise<ProviderMessage[]> {
    return call("listConversationMessages", async (withFetch) => {
      const { data } = await this.zernio.messages.getInboxConversationMessages(
        withFetch({
          signal: input.signal,
          path: { conversationId: input.conversationId },
          query: { accountId: input.accountId, limit: input.limit ?? 20, sortOrder: "desc" },
        }),
      );
      return parse(messagesSchema, data, "listConversationMessages").messages.map((m) => ({
        id: m.id,
        direction: m.direction,
        text: m.message ?? null,
        createdAt: m.createdAt,
      }));
    });
  }

  /** `GET /v1/inbox/comments/{postId}?commentId=…`: on Instagram/Facebook, that comment's replies. */
  async listCommentReplies(input: {
    accountId: string;
    postId: string;
    commentId: string;
    limit?: number;
    signal?: AbortSignal;
  }): Promise<ProviderCommentReply[]> {
    return call("listCommentReplies", async (withFetch) => {
      const { data } = await this.zernio.comments.getInboxPostComments(
        withFetch({
          signal: input.signal,
          path: { postId: input.postId },
          query: {
            accountId: input.accountId,
            commentId: input.commentId,
            limit: input.limit ?? 50,
          },
        }),
      );
      return (parse(commentRepliesSchema, data, "listCommentReplies").comments ?? []).map((c) => ({
        id: c.id,
        text: c.message ?? null,
        fromOwner: c.from?.isOwner ?? false,
        createdAt: c.createdTime ?? null,
      }));
    });
  }

  async listCommentedPosts(input: {
    accountId: string;
    since: Date;
    limit?: number;
    signal?: AbortSignal;
  }): Promise<{ postId: string }[]> {
    return call("listCommentedPosts", async (withFetch) => {
      const { data } = await this.zernio.comments.listInboxComments(
        withFetch({
          signal: input.signal,
          query: {
            accountId: input.accountId,
            since: input.since.toISOString(),
            limit: input.limit ?? 20,
            minComments: 1,
            sortBy: "date",
            sortOrder: "desc",
          },
        }),
      );
      return (parse(commentedPostsSchema, data, "listCommentedPosts").data ?? []).map((p) => ({
        postId: p.id,
      }));
    });
  }

  async listPostComments(input: {
    accountId: string;
    postId: string;
    limit?: number;
    signal?: AbortSignal;
  }) {
    return call("listPostComments", async (withFetch) => {
      const { data } = await this.zernio.comments.getInboxPostComments(
        withFetch({
          signal: input.signal,
          path: { postId: input.postId },
          query: { accountId: input.accountId, limit: input.limit ?? 50 },
        }),
      );
      return (parse(postCommentsSchema, data, "listPostComments").comments ?? []).map((c) => ({
        id: c.id,
        text: c.message ?? "",
        authorName: c.from?.username ?? c.from?.name ?? null,
        fromOwner: c.from?.isOwner ?? false,
        createdAt: c.createdTime ?? null,
      }));
    });
  }

  async ping(): Promise<void> {
    await call("ping", async (withFetch) => {
      await this.zernio.profiles.listProfiles(withFetch({ query: { limit: 1 } }));
    });
  }

  async getAccountsHealth(input: { profileId: string }): Promise<AccountHealth[]> {
    return call("getAccountsHealth", async (withFetch) => {
      const { data } = await this.zernio.accounts.getAllAccountsHealth(
        withFetch({
          query: { profileId: input.profileId },
        }),
      );
      return parse(healthSchema, data, "getAccountsHealth").accounts.map((a) => ({
        accountId: a.accountId,
        platform: a.platform,
        username: a.username ?? null,
        status: a.status,
        needsReconnect: a.needsReconnect ?? false,
        canPost: a.canPost ?? false,
        issues: a.issues ?? [],
      }));
    });
  }
}

export function createZernioProvider(options: {
  apiKey: string;
  baseURL?: string;
  timeoutMs?: number;
}): ZernioSocialProvider {
  return new ZernioSocialProvider(
    new Zernio({
      apiKey: options.apiKey,
      baseURL: options.baseURL,
      timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    }),
  );
}
