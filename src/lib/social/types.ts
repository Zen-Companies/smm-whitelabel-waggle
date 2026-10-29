export const SOCIAL_PLATFORMS = ["instagram", "facebook"] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export function isSocialPlatform(platform: string): platform is SocialPlatform {
  return (SOCIAL_PLATFORMS as readonly string[]).includes(platform);
}

export interface CreatePostInput {
  content: string;
  /** Public HTTPS URLs (Zernio media presign flow, T14). */
  mediaUrls?: string[];
  targets: { platform: SocialPlatform; accountId: string }[];
  /** null publishes now. */
  publishAt: Date | null;
  idempotencyKey: string;
}

export type ProviderPostStatus =
  | "draft"
  | "pending_approval"
  | "scheduled"
  | "publishing"
  | "published"
  | "partial"
  | "failed"
  | "cancelled";

export interface ProviderMessage {
  id: string;
  direction: "incoming" | "outgoing";
  text: string | null;
  createdAt: string;
}

export interface ProviderCommentReply {
  id: string;
  text: string | null;
  /** Written by the connected account (our own reply). */
  fromOwner: boolean;
  createdAt: string | null;
}

/** Per call: abort after the job's budget (docs/tdd.md §7.2). Defaults to the adapter timeout. */
export interface CallOptions {
  signal?: AbortSignal;
}

export interface AccountHealth {
  accountId: string;
  platform: string;
  username: string | null;
  status: "healthy" | "warning" | "error";
  needsReconnect: boolean;
  canPost: boolean;
  issues: string[];
}

// Zernio sits behind this interface (CLAUDE.md rule 1). Ids are Zernio ids.
export interface SocialProvider {
  /** A 409 for the same externalId returns the existing profile with `alreadyExisted: true`. */
  createProfile(input: {
    name: string;
    externalId: string;
    idempotencyKey?: string;
  }): Promise<{ profileId: string; alreadyExisted: boolean }>;
  getConnectUrl(input: {
    platform: SocialPlatform;
    profileId: string;
    redirectUrl: string;
  }): Promise<{ authUrl: string }>;
  createPost(
    input: CreatePostInput,
  ): Promise<{ providerPostId: string; status: ProviderPostStatus }>;
  /**
   * Uploads one image for a post: `POST /v1/media/presign` then a PUT of the bytes to the
   * returned `uploadUrl`. Returns the public URL to pass in `CreatePostInput.mediaUrls`.
   */
  uploadMedia(
    input: {
      filename: string;
      contentType: string;
      bytes: Uint8Array;
    } & CallOptions,
  ): Promise<{ publicUrl: string }>;
  /** Cancels a scheduled post (`DELETE /v1/posts/{postId}`). */
  deletePost(input: { postId: string } & CallOptions): Promise<void>;
  /** `postId` is the Zernio post id or the platform's post id. */
  replyToComment(
    input: {
      accountId: string;
      postId: string;
      commentId: string;
      message: string;
      idempotencyKey: string;
    } & CallOptions,
  ): Promise<{ providerReplyId: string }>;
  sendDm(
    input: {
      accountId: string;
      conversationId: string;
      message: string;
      idempotencyKey: string;
    } & CallOptions,
  ): Promise<{ providerMessageId: string }>;
  /** Newest first. Used to reconcile an ambiguous send before retrying (rule 7). */
  listConversationMessages(
    input: {
      conversationId: string;
      accountId: string;
      limit?: number;
    } & CallOptions,
  ): Promise<ProviderMessage[]>;
  /** Replies to one comment (Instagram/Facebook). Used to reconcile an ambiguous comment reply. */
  listCommentReplies(
    input: {
      accountId: string;
      postId: string;
      commentId: string;
      limit?: number;
    } & CallOptions,
  ): Promise<ProviderCommentReply[]>;
  getAccountsHealth(input: { profileId: string }): Promise<AccountHealth[]>;
  /** A cheap read (list one profile). Throws like any call; used to see whether a pause ended. */
  ping(): Promise<void>;
}

export class SocialProviderError extends Error {
  constructor(
    message: string,
    readonly details: {
      /** HTTP status; undefined for network errors and timeouts. */
      status?: number;
      code?: string;
      /**
       * The request may have taken effect (5xx, timeout, network error).
       * Reconcile before retrying a send.
       */
      ambiguous: boolean;
      retryAfterSeconds?: number;
    },
  ) {
    super(message);
    this.name = "SocialProviderError";
  }
}
