import type {
  BestTimeSlot,
  DashboardSummary,
  Demographics,
  FollowerSeries,
  OnlineFollowers,
  PostTimelinePoint,
  ProviderPostMetrics,
} from "./analytics-types";

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

/** A top-level comment on a post (inbox backfill, T16). Ids are the platform's, as in webhooks. */
export interface ProviderComment {
  id: string;
  text: string;
  authorName: string | null;
  fromOwner: boolean;
  createdAt: string | null;
}

/** A review (recommendation) on a connected Facebook Page (T42). Ids are Zernio's. */
export interface ProviderReview {
  id: string;
  reviewerName: string | null;
  /** Facebook: true = recommends, false = doesn't recommend, null = not given. */
  recommends: boolean | null;
  text: string;
  createdAt: string;
  hasReply: boolean;
  /** Link to the review on Facebook, when Zernio gives one. */
  reviewUrl: string | null;
}

/** Zernio's spend this billing cycle, split by profile (= tenant). T17. */
export interface ProviderUsage {
  periodStart: string | null;
  periodEnd: string | null;
  totalUsd: number;
  /** Credits, 10DLC, Verify: not tied to a profile. */
  unattributedUsd: number;
  byProfile: { profileId: string; totalUsd: number }[];
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
  /**
   * Hides a comment on its post (`POST /v1/inbox/comments/{postId}/{commentId}/hide`, T40): only
   * the commenter and the account see it. `unhideComment` is `DELETE` on the same path. A comment
   * that no longer exists answers 400 (code PLATFORM_API_ERROR).
   */
  hideComment(
    input: { accountId: string; postId: string; commentId: string } & CallOptions,
  ): Promise<void>;
  unhideComment(
    input: { accountId: string; postId: string; commentId: string } & CallOptions,
  ): Promise<void>;
  /**
   * Answers a comment in the commenter's DMs (`POST /v1/inbox/comments/{postId}/{commentId}/
   * private-reply`, T41). Meta allows one per comment, within 7 days; a second answers 400 with
   * `privateReplyConsumed`. No idempotency key: that single use is what stops a double send.
   */
  sendPrivateReply(
    input: {
      accountId: string;
      postId: string;
      commentId: string;
      message: string;
    } & CallOptions,
  ): Promise<{ providerMessageId: string }>;
  /**
   * A Page's reviews, newest first (`GET /v1/inbox/reviews?platform=facebook&accountId=…`, T42).
   * Facebook sends no review webhooks, so the job polls this. Zernio caches each listing ~60 s.
   */
  listReviews(
    input: { accountId: string; limit?: number } & CallOptions,
  ): Promise<ProviderReview[]>;
  // Analytics reads (T48). Called by the sync job only; pages read the stored copies.
  /** `GET /v1/analytics/dashboard` for one window, with the previous window to compare. */
  getAnalyticsDashboard(
    input: {
      profileId: string;
      fromDate: string;
      toDate: string;
      platform?: SocialPlatform;
    } & CallOptions,
  ): Promise<DashboardSummary>;
  /** `GET /v1/analytics`: posts published in the window with lifetime numbers, one page. */
  listPostAnalytics(
    input: { profileId: string; fromDate: string; toDate: string; page: number } & CallOptions,
  ): Promise<{ posts: ProviderPostMetrics[]; pages: number }>;
  /** `GET /v1/accounts/follower-stats`, daily (refreshed once a day upstream). */
  getFollowerStats(
    input: { profileId: string; fromDate: string; toDate: string } & CallOptions,
  ): Promise<FollowerSeries[]>;
  /** `GET /v1/analytics/best-time`: slots by average engagement, best first (UTC hours). */
  getBestTimeToPost(input: { profileId: string } & CallOptions): Promise<BestTimeSlot[]>;
  /** Instagram (age, gender, city, country) or Facebook (country, city) follower breakdown. */
  getDemographics(
    input: { accountId: string; platform: SocialPlatform } & CallOptions,
  ): Promise<Demographics | null>;
  /** Instagram followers online per hour, last 30 days. */
  getOnlineFollowers(input: { accountId: string } & CallOptions): Promise<OnlineFollowers | null>;
  /** `GET /v1/analytics/post-timeline`: a post's numbers day by day. */
  getPostTimeline(
    input: { postId: string; fromDate?: string; toDate?: string } & CallOptions,
  ): Promise<PostTimelinePoint[]>;
  /** Public reply under a review (`POST /v1/inbox/reviews/{reviewId}/reply`, Idempotency-Key). */
  replyToReview(
    input: {
      accountId: string;
      reviewId: string;
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
  /** Recent posts of an account that have comments (`GET /v1/inbox/comments`), newest first. */
  listCommentedPosts(
    input: {
      accountId: string;
      since: Date;
      limit?: number;
    } & CallOptions,
  ): Promise<{ postId: string }[]>;
  /** A post's top-level comments (`GET /v1/inbox/comments/{postId}`). */
  listPostComments(
    input: {
      accountId: string;
      postId: string;
      limit?: number;
    } & CallOptions,
  ): Promise<ProviderComment[]>;
  /** `GET /v1/usage?range=cycle&groupBy=profile`; null where usage isn't available (mock). */
  getUsageByProfile(input?: CallOptions): Promise<ProviderUsage | null>;
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
      /** Private reply (T41): this comment's one DM is spent, by this call or an earlier one. */
      privateReplyConsumed?: boolean;
    },
  ) {
    super(message);
    this.name = "SocialProviderError";
  }
}
