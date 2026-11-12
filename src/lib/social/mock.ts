import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  AccountHealth,
  AccountPicture,
  CreatePostInput,
  ProviderComment,
  ProviderCommentReply,
  ProviderMessage,
  ProviderReview,
  ProviderPostStatus,
  PostValidation,
  ProviderUsage,
  SocialPlatform,
  SocialProvider,
} from "./types";
import { platformLabel, platformOf } from "./platforms";
import { SocialProviderError } from "./types";
import {
  MOCK_BEST_TIMES,
  mockDashboard,
  mockDemographics,
  mockFollowerSeries,
  mockOnlineFollowers,
  mockPosts,
  mockTimeline,
} from "./mock-analytics";

// SOCIAL_PROVIDER_MODE=mock (CLAUDE.md rule 14): a stand-in for Zernio for tests and local smoke
// tests. Nothing leaves the process. Ids are derived from the input, so a retry with the same
// idempotency key gets the same id, like Zernio's replay.
const idFrom = (prefix: string, ...parts: string[]) =>
  `${prefix}_${createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 24)}`;

export interface MockSend {
  kind: "comment" | "dm" | "private_reply" | "review";
  accountId: string;
  targetId: string;
  idempotencyKey: string;
  providerId: string;
  /** Kept in memory for assertions only; never logged (rule 10). */
  message: string;
}

/** Where mock-mode post images live; served by /api/mock-media/[name] (mock mode only). */
export const MOCK_MEDIA_DIR = join(tmpdir(), "ai-receptionist-mock-media");
const MEDIA_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export class MockSocialProvider implements SocialProvider {
  readonly sends: MockSend[] = [];
  readonly posts = new Map<string, CreatePostInput & { status: ProviderPostStatus | "deleted" }>();

  constructor(private readonly appUrl = process.env.APP_URL ?? "http://localhost:3000") {}

  async createProfile(input: { name: string; externalId: string }) {
    return { profileId: idFrom("mock_profile", input.externalId), alreadyExisted: false };
  }

  /** Sends the browser straight back to the app; no account is connected. */
  /** Zernio's dry run, from the registry's rules (the real one checks more). */
  async validatePost(
    input: Omit<CreatePostInput, "publishAt" | "idempotencyKey">,
  ): Promise<PostValidation> {
    const media = input.mediaUrls?.length ?? 0;
    const errors: PostValidation["errors"] = [];
    for (const t of input.targets) {
      const rules = platformOf(t.platform)?.post;
      const name = platformLabel(t.platform);
      if (!rules) errors.push({ platform: t.platform, message: `${name} does not support posts.` });
      else if (rules.mediaRequired && media === 0)
        errors.push({ platform: t.platform, message: `${name} requires media.` });
      else if (input.content.length > rules.textMax)
        errors.push({ platform: t.platform, message: `${name} text is too long.` });
    }
    return { valid: errors.length === 0, errors, warnings: [] };
  }

  async getConnectUrl(input: { platform: SocialPlatform; profileId: string; redirectUrl: string }) {
    const url = new URL(input.redirectUrl);
    url.searchParams.set("mock_connect", "1");
    return { authUrl: url.toString() };
  }

  async createPost(
    input: CreatePostInput,
  ): Promise<{ providerPostId: string; status: ProviderPostStatus }> {
    const providerPostId = idFrom("mock_post", input.idempotencyKey);
    const status: ProviderPostStatus = input.publishAt ? "scheduled" : "publishing";
    if (!this.posts.has(providerPostId)) this.posts.set(providerPostId, { ...input, status });
    return { providerPostId, status };
  }

  async uploadMedia(input: { filename: string; contentType: string; bytes: Uint8Array }) {
    const ext = MEDIA_EXT[input.contentType] ?? "bin";
    const name = `${createHash("sha256").update(input.bytes).digest("hex").slice(0, 24)}.${ext}`;
    await mkdir(MOCK_MEDIA_DIR, { recursive: true });
    await writeFile(join(MOCK_MEDIA_DIR, name), input.bytes);
    return { publicUrl: `${this.appUrl}/api/mock-media/${name}` };
  }

  async deletePost(input: { postId: string }) {
    const post = this.posts.get(input.postId);
    if (post) post.status = "deleted";
  }

  async replyToComment(input: {
    accountId: string;
    postId: string;
    commentId: string;
    message: string;
    idempotencyKey: string;
  }) {
    const providerReplyId = this.record("comment", input.accountId, input.commentId, input);
    return { providerReplyId };
  }

  /** Comment ids currently hidden (T40), keyed `accountId|commentId`. */
  readonly hidden = new Set<string>();

  async hideComment(input: { accountId: string; postId: string; commentId: string }) {
    this.hidden.add(`${input.accountId}|${input.commentId}`);
  }

  async unhideComment(input: { accountId: string; postId: string; commentId: string }) {
    this.hidden.delete(`${input.accountId}|${input.commentId}`);
  }

  /** Like Meta: one private reply per comment; a second is refused as consumed. */
  async sendPrivateReply(input: {
    accountId: string;
    postId: string;
    commentId: string;
    message: string;
  }) {
    const done = this.sends.find(
      (x) =>
        x.kind === "private_reply" &&
        x.accountId === input.accountId &&
        x.targetId === input.commentId,
    );
    if (done) {
      throw new SocialProviderError("Zernio sendPrivateReply failed (400)", {
        status: 400,
        code: "PRIVATE_REPLY_CONSUMED",
        ambiguous: false,
        privateReplyConsumed: true,
      });
    }
    const providerMessageId = this.record("private_reply", input.accountId, input.commentId, {
      ...input,
      idempotencyKey: `private:${input.commentId}`,
    });
    return { providerMessageId };
  }

  /** Reviews a test put on a Page (keyed by Zernio account id), newest first. */
  // Analytics (T48): steady sample numbers; `analyticsCalls` lets tests count the reads.
  analyticsCalls = 0;
  async getAnalyticsDashboard(input: {
    profileId: string;
    fromDate: string;
    toDate: string;
    platform?: SocialPlatform;
  }) {
    this.analyticsCalls++;
    return mockDashboard(input);
  }
  async listPostAnalytics(input: {
    profileId: string;
    fromDate: string;
    toDate: string;
    page: number;
  }) {
    this.analyticsCalls++;
    const all = mockPosts(input.profileId, input.fromDate, input.toDate);
    const pages = Math.max(1, Math.ceil(all.length / 50));
    return { posts: all.slice((input.page - 1) * 50, input.page * 50), pages };
  }
  async getFollowerStats(input: { profileId: string; fromDate: string; toDate: string }) {
    this.analyticsCalls++;
    return mockFollowerSeries(input.fromDate, input.toDate);
  }
  async getBestTimeToPost() {
    this.analyticsCalls++;
    return MOCK_BEST_TIMES;
  }
  async getDemographics(input: { accountId: string; platform: SocialPlatform }) {
    this.analyticsCalls++;
    return mockDemographics(input.platform);
  }
  async getOnlineFollowers() {
    this.analyticsCalls++;
    return mockOnlineFollowers();
  }
  async getPostTimeline(input: { postId: string }) {
    this.analyticsCalls++;
    return mockTimeline(input.postId);
  }

  readonly reviews = new Map<string, ProviderReview[]>();

  async listReviews(input: { accountId: string }): Promise<ProviderReview[]> {
    const replied = new Set(this.sends.filter((x) => x.kind === "review").map((x) => x.targetId));
    return (this.reviews.get(input.accountId) ?? []).map((r) => ({
      ...r,
      hasReply: r.hasReply || replied.has(r.id),
    }));
  }

  async replyToReview(input: {
    accountId: string;
    reviewId: string;
    message: string;
    idempotencyKey: string;
  }) {
    const providerReplyId = this.record("review", input.accountId, input.reviewId, input);
    return { providerReplyId };
  }

  async sendDm(input: {
    accountId: string;
    conversationId: string;
    message: string;
    idempotencyKey: string;
  }) {
    const providerMessageId = this.record("dm", input.accountId, input.conversationId, input);
    return { providerMessageId };
  }

  async listConversationMessages(input: {
    conversationId: string;
    accountId: string;
  }): Promise<ProviderMessage[]> {
    return this.sends
      .filter((s) => s.kind === "dm" && s.targetId === input.conversationId)
      .reverse()
      .map((s) => ({
        id: s.providerId,
        direction: "outgoing",
        text: s.message,
        createdAt: new Date().toISOString(),
      }));
  }

  async listCommentReplies(input: {
    accountId: string;
    postId: string;
    commentId: string;
  }): Promise<ProviderCommentReply[]> {
    return this.sends
      .filter((s) => s.kind === "comment" && s.targetId === input.commentId)
      .map((s) => ({ id: s.providerId, text: s.message, fromOwner: true, createdAt: null }));
  }

  /** Offboarding (T21): what was removed, and ids whose removal should fail once (tests). */
  readonly disconnectedAccounts: string[] = [];
  readonly deletedProfiles: string[] = [];
  readonly failRemoval = new Set<string>();

  async disconnectAccount(input: { accountId: string }): Promise<void> {
    this.failIfAsked(input.accountId, "disconnectAccount");
    this.disconnectedAccounts.push(input.accountId);
  }

  async deleteProfile(input: { profileId: string }): Promise<void> {
    this.failIfAsked(input.profileId, "deleteProfile");
    this.deletedProfiles.push(input.profileId);
  }

  private failIfAsked(id: string, operation: string): void {
    if (!this.failRemoval.delete(id)) return;
    throw new SocialProviderError(`${operation}: mock failure`, { status: 503, ambiguous: true });
  }

  async ping(): Promise<void> {}

  /** No Zernio account behind the mock: usage isn't available. */
  async getUsageByProfile(): Promise<ProviderUsage | null> {
    return null;
  }

  async listCommentedPosts(): Promise<{ postId: string }[]> {
    return [];
  }

  async listPostComments(): Promise<ProviderComment[]> {
    return [];
  }

  async getAccountsHealth(): Promise<AccountHealth[]> {
    return [];
  }

  /** No pictures in mock mode: brands show initials. */
  async listAccountPictures(): Promise<AccountPicture[]> {
    return [];
  }

  private record(
    kind: MockSend["kind"],
    accountId: string,
    targetId: string,
    input: { message: string; idempotencyKey: string },
  ): string {
    const existing = this.sends.find((s) => s.idempotencyKey === input.idempotencyKey);
    if (existing) return existing.providerId;
    const providerId = idFrom(`mock_${kind}`, input.idempotencyKey);
    this.sends.push({ kind, accountId, targetId, providerId, ...input });
    console.info(`[mock social] ${kind} send ${providerId} (key ${input.idempotencyKey})`);
    return providerId;
  }
}

export type SocialProviderMode = "zernio" | "mock";

/**
 * `SOCIAL_PROVIDER_MODE` wins; otherwise mock under Vitest, Zernio everywhere else. Mock is
 * refused on a Vercel production deployment, where it would silently drop replies.
 */
export function resolveSocialProviderMode(
  env: Record<string, string | undefined>,
): SocialProviderMode {
  const raw = env.SOCIAL_PROVIDER_MODE?.trim().toLowerCase();
  if (raw && raw !== "mock" && raw !== "zernio") {
    throw new Error(`SOCIAL_PROVIDER_MODE must be "mock" or "zernio", got "${raw}"`);
  }
  const mode: SocialProviderMode = (raw as SocialProviderMode) || (env.VITEST ? "mock" : "zernio");
  if (mode === "mock" && env.VERCEL_ENV === "production") {
    throw new Error("SOCIAL_PROVIDER_MODE=mock is not allowed in production");
  }
  return mode;
}
