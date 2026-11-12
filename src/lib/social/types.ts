import type {
  BestTimeSlot,
  DashboardSummary,
  Demographics,
  FollowerSeries,
  OnlineFollowers,
  PostTimelinePoint,
  ProviderPostMetrics,
} from "./analytics-types";

import { isPlatformId, PLATFORM_IDS, type PlatformId } from "./platforms";

/** Every platform Zernio offers (src/lib/social/platforms.ts has what each one allows). */
export const SOCIAL_PLATFORMS = PLATFORM_IDS;
export type SocialPlatform = PlatformId;
export const isSocialPlatform = isPlatformId;

/** Zernio's dry run of a post (`POST /v1/tools/validate/post`): per-platform problems. */
export interface PostValidation {
  valid: boolean;
  errors: { platform: string; message: string }[];
  warnings: { platform: string; message: string }[];
}

export interface CreatePostInput {
  content: string;
  /** Public HTTPS URLs (Zernio media presign flow, T14). */
  mediaUrls?: string[];
  targets: { platform: SocialPlatform; accountId: string }[];
  /** null publishes now. */
  publishAt: Date | null;
  idempotencyKey: string;
  /**
   * TikTok: the owner ticked "I've checked this post and agree to publish it" (TikTok requires it
   * on every post). Without it a TikTok target is refused.
   */
  tiktokConsent?: boolean;
  /** YouTube's video title (100 max); without it Zernio uses the caption's first line. */
  youtubeTitle?: string;
  /** Pinterest's board (T64); without it Zernio pins to the account's first board. */
  pinterestBoardId?: string;
}

/** A video (or other file) is a video when its URL ends like one; Zernio reads the same. */
export const isVideoUrl = (url: string): boolean =>
  /\.(mp4|mov|webm|m4v|mpeg|avi)(\?|$)/i.test(url);

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
  /** Google: 1–5 stars; null elsewhere. */
  rating?: number | null;
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

/** A connected account's picture on its platform (T57). The link may expire: copy it. */
export interface AccountPicture {
  accountId: string;
  pictureUrl: string | null;
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

export type TelegramConnectStatus =
  | { status: "pending" }
  | { status: "expired" }
  | { status: "connected"; accountId: string | null; username: string | null };

import type { WhatsAppTemplate } from "./whatsapp-templates";

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
  /**
   * Bluesky (T60): connects with the handle and an app password typed in Waggle
   * (`POST /v1/connect/bluesky/credentials`; state `{userId}-{profileId}`, userId is
   * `currentUserId` from `GET /v1/users`). Returns the account when Zernio includes it in the
   * response; account.connected follows by webhook either way. The password is never stored.
   */
  connectBluesky(
    input: { profileId: string; identifier: string; appPassword: string } & CallOptions,
  ): Promise<{ account: { accountId: string; username: string | null } | null }>;
  /**
   * Telegram (T60): an access code for Zernio's bot (`GET /v1/connect/telegram`), valid 15
   * minutes. The owner makes the bot an admin of their channel or group and sends it the code.
   */
  startTelegramConnect(
    input: { profileId: string } & CallOptions,
  ): Promise<{ code: string; expiresAt: string; botUsername: string }>;
  /** Whether the code has been sent yet (`PATCH /v1/connect/telegram?code=`). */
  checkTelegramConnect(input: { code: string } & CallOptions): Promise<TelegramConnectStatus>;
  createPost(
    input: CreatePostInput,
  ): Promise<{ providerPostId: string; status: ProviderPostStatus }>;
  /**
   * Checks a post against each platform's real rules without publishing
   * (`POST /v1/tools/validate/post`, same body as createPost). The composer's last check.
   */
  validatePost(
    input: Omit<CreatePostInput, "publishAt" | "idempotencyKey"> & CallOptions,
  ): Promise<PostValidation>;
  /**
   * Uploads one image for a post: `POST /v1/media/presign` then a PUT of the bytes to the
   * returned `uploadUrl`. Returns the public URL to pass in `CreatePostInput.mediaUrls`.
   */
  /**
   * A presigned upload for the browser to PUT a file to (videos: too big for our server). The
   * storage allows any origin (checked 12 Nov 2026). `uploadUrl` lasts 1 hour; the file at
   * `publicUrl` 7 days until a post uses it.
   */
  presignMedia(
    input: { filename: string; contentType: string; size: number } & CallOptions,
  ): Promise<{ uploadUrl: string; publicUrl: string }>;
  /** A Pinterest account's boards (`GET /v1/accounts/{accountId}/pinterest-boards`, T64). */
  listPinterestBoards(
    input: { accountId: string } & CallOptions,
  ): Promise<{ id: string; name: string }[]>;
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
   * An account's reviews, newest first (`GET /v1/inbox/reviews?platform=…&accountId=…`).
   * Facebook (T42) sends no review webhooks, so the job polls this; Google (T61) uses it to check
   * an uncertain reply. `platform` defaults to facebook. Zernio caches each listing ~60 s.
   */
  listReviews(
    input: { accountId: string; platform?: string; limit?: number } & CallOptions,
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
  /**
   * `template` (WhatsApp, T67): send an approved template instead of free text, the only kind
   * WhatsApp allows 24 hours after the customer's last message. `message` is then the rendered
   * text, for our records only.
   */
  sendDm(
    input: {
      accountId: string;
      conversationId: string;
      message: string;
      idempotencyKey: string;
      template?: { name: string; language: string; params: string[] };
    } & CallOptions,
  ): Promise<{ providerMessageId: string }>;
  /** A WhatsApp account's templates, read live from Meta (`GET /v1/whatsapp/templates`). */
  listWhatsAppTemplates(input: { accountId: string } & CallOptions): Promise<WhatsAppTemplate[]>;
  /** A new template, sent to Meta for review (`POST /v1/whatsapp/templates`). */
  createWhatsAppTemplate(
    input: {
      accountId: string;
      name: string;
      category: "UTILITY" | "MARKETING";
      language: string;
      body: string;
      /** One example per {{n}}, for Meta's reviewers. */
      examples: string[];
    } & CallOptions,
  ): Promise<{ id: string; status: string }>;
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
  /**
   * T57: each connected account's profile picture (`GET /v1/accounts?profileId=`,
   * `SocialAccount.profilePicture`, null when the platform gives none).
   */
  listAccountPictures(input: { profileId: string }): Promise<AccountPicture[]>;
  /**
   * Offboarding (T21): removes an account from Zernio (`DELETE /v1/accounts/{accountId}`; a
   * 1-hour grace period keeps it restorable on Zernio's side). An account already gone (404)
   * counts as done.
   */
  disconnectAccount(input: { accountId: string } & CallOptions): Promise<void>;
  /**
   * Offboarding (T21): deletes the brand's profile (`DELETE /v1/profiles/{profileId}`). Zernio
   * refuses (400) while any account is still connected to it. Already gone (404) is done.
   */
  deleteProfile(input: { profileId: string } & CallOptions): Promise<void>;
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
export type { WhatsAppTemplate } from "./whatsapp-templates";
