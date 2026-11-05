import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  AccountHealth,
  CreatePostInput,
  ProviderComment,
  ProviderCommentReply,
  ProviderMessage,
  ProviderPostStatus,
  ProviderUsage,
  SocialPlatform,
  SocialProvider,
} from "./types";

// SOCIAL_PROVIDER_MODE=mock (CLAUDE.md rule 14): a stand-in for Zernio for tests and local smoke
// tests. Nothing leaves the process. Ids are derived from the input, so a retry with the same
// idempotency key gets the same id, like Zernio's replay.
const idFrom = (prefix: string, ...parts: string[]) =>
  `${prefix}_${createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 24)}`;

export interface MockSend {
  kind: "comment" | "dm";
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
