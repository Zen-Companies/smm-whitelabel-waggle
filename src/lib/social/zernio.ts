import Zernio, { RateLimitError, ZernioApiError } from "@zernio/node";
import { z } from "zod";
import { bodyOf, variableCount } from "./whatsapp-templates";
import {
  toBestTimes,
  toDashboard,
  toDemographics,
  toFollowerSeries,
  toOnlineFollowers,
  toPostList,
  toTimeline,
} from "./analytics-map";
import {
  SocialProviderError,
  type TelegramConnectStatus,
  isVideoUrl,
  type WhatsAppTemplate,
  type AccountHealth,
  type AccountPicture,
  type CreatePostInput,
  type ProviderCommentReply,
  type ProviderMessage,
  type ProviderPostStatus,
  type PostValidation,
  type PostingQueue,
  type ChatFlow,
  type Sequence,
  type SequenceStep,
  type CommentAutomation,
  type WorkflowGraph,
  type CommentAutomationInput,
  type CommentAutomationLogEntry,
  type ProviderUsage,
  type SocialPlatform,
  type SocialProvider,
  type TargetExtras,
} from "./types";
import { connectBranding } from "./whitelabel";

// The SDK's 300 s default is the whole job route budget; inbox and profile calls are fast.
const DEFAULT_TIMEOUT_MS = 60_000;

const profileSchema = z.object({ profile: z.object({ _id: z.string().min(1) }) });
const profileConflictSchema = z.object({ existingProfileId: z.string().min(1) });
const connectSchema = z.object({ authUrl: z.url() });
const validationSchema = z.object({
  valid: z.boolean().optional(),
  errors: z
    .array(z.object({ platform: z.string().optional(), error: z.string().optional() }))
    .optional(),
  warnings: z
    .array(z.object({ platform: z.string().optional(), warning: z.string().optional() }))
    .optional(),
});
const creatorInfoSchema = z.object({
  privacyLevels: z.array(z.object({ value: z.string().optional() })).optional(),
});

/** TikTok's public level when the account offers it (Business-app accounts post videos public only). */
export function pickTikTokPrivacy(levels: (string | undefined)[]): string | null {
  const values = levels.filter((v): v is string => !!v);
  return values.find((v) => v === "PUBLIC_TO_EVERYONE") ?? values[0] ?? null;
}
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
    scheduledFor: z.string().nullish().catch(null),
  }),
});
const queueSlotSchema = z.object({ dayOfWeek: z.number().int().min(0).max(6), time: z.string() });
const queueSchema = z.object({
  exists: z.boolean().optional(),
  schedule: z
    .object({
      timezone: z.string().optional(),
      slots: z.array(queueSlotSchema.nullable().catch(null)).optional(),
    })
    .nullish(),
  nextSlots: z.array(z.string()).optional(),
});
const gbpPerformanceSchema = z.object({
  metrics: z
    .record(z.string(), z.object({ total: z.number().optional() }).nullable().catch(null))
    .optional(),
});
const sequencesSchema = z.object({
  sequences: z
    .array(
      z
        .object({
          id: z.string().min(1),
          name: z.string().catch(""),
          platform: z.string().catch(""),
          status: z.enum(["draft", "active", "paused"]).catch("draft"),
          accountId: z.string().catch(""),
          stepsCount: z.number().optional(),
          messagePreview: z.string().optional(),
          totalEnrolled: z.number().optional(),
          totalCompleted: z.number().optional(),
          totalExited: z.number().optional(),
        })
        .nullable()
        .catch(null),
    )
    .catch([]),
});
const workflowsSchema = z.object({
  workflows: z
    .array(
      z
        .object({
          id: z.string().min(1),
          name: z.string().catch(""),
          description: z.string().catch(""),
          platform: z.string().catch(""),
          status: z.enum(["draft", "active", "paused"]).catch("draft"),
          totalStarted: z.number().optional(),
          totalCompleted: z.number().optional(),
        })
        .nullable()
        .catch(null),
    )
    .catch([]),
});
const commentAutomationSchema = z.object({
  id: z.string().min(1),
  name: z.string().catch(""),
  platform: z.string().catch(""),
  accountId: z.string().catch(""),
  keywords: z.array(z.string()).catch([]),
  matchMode: z.enum(["exact", "contains", "word"]).catch("contains"),
  dmMessage: z.string().nullish().catch(null),
  buttons: z
    .array(z.object({ type: z.string(), title: z.string(), url: z.string().optional() }))
    .nullish()
    .catch(null),
  commentReply: z.string().nullish().catch(null),
  repeatPolicy: z.object({ mode: z.string() }).nullish().catch(null),
  postTitle: z.string().nullish().catch(null),
  isActive: z.boolean().catch(false),
  stats: z
    .object({
      triggered: z.number().optional(),
      dmsSent: z.number().optional(),
      dmsFailed: z.number().optional(),
      linkClicks: z.number().optional(),
    })
    .nullish()
    .catch(null),
});
const commentAutomationsSchema = z.object({
  automations: z.array(commentAutomationSchema.nullable().catch(null)).catch([]),
});
const commentAutomationLogsSchema = z.object({
  logs: z
    .array(
      z
        .object({
          id: z.string().catch(""),
          commenterName: z.string().nullish(),
          commenterUsername: z.string().nullish(),
          status: z.enum(["pending", "sent", "failed", "skipped", "gated"]).catch("pending"),
          createdAt: z.string().nullish(),
        })
        .nullable()
        .catch(null),
    )
    .catch([]),
  misses: z.object({ total: z.number().optional() }).nullish().catch(null),
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
const usageSlice = z.object({ totalUsd: z.number().optional() });
const usageSchema = z.object({
  period: z.object({ start: z.string().optional(), end: z.string().optional() }).optional(),
  totals: z.object({ total: z.number().optional() }).optional(),
  attribution: z
    .object({
      groups: z.array(usageSlice.extend({ key: z.string() })).optional(),
      unattributed: usageSlice.optional(),
      totals: usageSlice.optional(),
    })
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

const accountPicturesSchema = z.object({
  accounts: z.array(
    z.object({
      _id: z.string().min(1),
      profilePicture: z.string().url().nullish(),
    }),
  ),
});

const privateReplySchema = z.object({ messageId: z.string().min(1) });
const reviewsSchema = z.object({
  data: z.array(
    z.object({
      id: z.string().min(1),
      reviewer: z.object({ name: z.string().nullish() }).nullish(),
      recommendationType: z.string().nullish(),
      rating: z.number().int().min(1).max(5).nullish().catch(null),
      text: z.string().nullish(),
      created: z.string(),
      hasReply: z.boolean().optional(),
      reviewUrl: z.string().nullish(),
    }),
  ),
});
const reviewReplySchema = z.object({ reply: z.object({ id: z.string().min(1) }) });

const usersSchema = z.object({ currentUserId: z.string().min(1) });
// The SDK types the account as SocialAccount (`_id`); the docs for other credential connects
// name it `accountId`. Accept either; without one, account.connected brings it by webhook.
const credentialsConnectSchema = z.object({
  account: z
    .object({
      _id: z.string().min(1).optional(),
      accountId: z.string().min(1).optional(),
      username: z.string().nullish(),
    })
    .nullish(),
});

const telegramCodeSchema = z.object({
  code: z.string().min(1),
  expiresAt: z.string().min(1),
  botUsername: z.string().min(1).catch("LateScheduleBot"),
});
const telegramStatusSchema = z.object({
  status: z.enum(["pending", "connected", "expired"]),
  chatTitle: z.string().nullish(),
  account: z
    .object({ _id: z.string().min(1).optional(), username: z.string().nullish() })
    .nullish(),
});

const pinterestBoardsSchema = z.object({
  boards: z.array(z.object({ id: z.string().optional(), name: z.string().nullish() })).nullish(),
});

const waTemplatesSchema = z.object({
  templates: z
    .array(
      z.object({
        id: z.string().optional(),
        name: z.string().optional(),
        status: z.string().optional(),
        category: z.string().optional(),
        language: z.string().optional(),
        components: z.array(z.unknown()).optional(),
      }),
    )
    .nullish(),
});
const waCreatedSchema = z.object({
  template: z.object({ id: z.string().min(1), status: z.string().optional() }),
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
      ...(error.details?.privateReplyConsumed === true ? { privateReplyConsumed: true } : {}),
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

/** A delete that finds nothing (404) already has the outcome it wanted. */
async function ignoreGone(run: Promise<void>): Promise<void> {
  try {
    await run;
  } catch (error) {
    if (error instanceof SocialProviderError && error.details.status === 404) return;
    throw error;
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

  async getConnectUrl(input: { platform: SocialPlatform; profileId: string; redirectUrl: string }) {
    return call("getConnectUrl", async (withFetch) => {
      const { data } = await this.zernio.connect.getConnectUrl(
        withFetch({
          path: { platform: input.platform },
          query: {
            profileId: input.profileId,
            redirect_url: input.redirectUrl,
            ...connectBranding(process.env.APP_URL ?? ""),
          },
        }),
      );
      return { authUrl: parse(connectSchema, data, "getConnectUrl").authUrl };
    });
  }

  /** Zernio's own user id for the credentials connect state; it never changes, so it's kept. */
  private currentUserId: string | null = null;

  async connectBluesky(input: {
    profileId: string;
    identifier: string;
    appPassword: string;
    signal?: AbortSignal;
  }) {
    if (!this.currentUserId) {
      this.currentUserId = await call("listUsers", async (withFetch) => {
        const { data } = await this.zernio.users.listUsers(withFetch({ signal: input.signal }));
        return parse(usersSchema, data, "listUsers").currentUserId;
      });
    }
    const userId = this.currentUserId;
    return call("connectBluesky", async (withFetch) => {
      const { data } = await this.zernio.connect.bluesky.connectBlueskyCredentials(
        withFetch({
          signal: input.signal,
          body: {
            identifier: input.identifier,
            appPassword: input.appPassword,
            state: `${userId}-${input.profileId}`,
          },
        }),
      );
      const { account } = parse(credentialsConnectSchema, data, "connectBluesky");
      const accountId = account?._id ?? account?.accountId;
      return {
        account: accountId ? { accountId, username: account?.username ?? null } : null,
      };
    });
  }

  async startTelegramConnect(input: { profileId: string; signal?: AbortSignal }) {
    return call("startTelegramConnect", async (withFetch) => {
      const { data } = await this.zernio.connect.telegram.getTelegramConnectStatus(
        withFetch({ signal: input.signal, query: { profileId: input.profileId } }),
      );
      return parse(telegramCodeSchema, data, "startTelegramConnect");
    });
  }

  async checkTelegramConnect(input: {
    code: string;
    signal?: AbortSignal;
  }): Promise<TelegramConnectStatus> {
    return call("checkTelegramConnect", async (withFetch) => {
      const { data } = await this.zernio.connect.telegram.completeTelegramConnect(
        withFetch({ signal: input.signal, query: { code: input.code } }),
      );
      const parsed = parse(telegramStatusSchema, data, "checkTelegramConnect");
      if (parsed.status !== "connected") return { status: parsed.status };
      return {
        status: "connected",
        accountId: parsed.account?._id ?? null,
        username: parsed.account?.username ?? parsed.chatTitle ?? null,
      };
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
            platforms: await this.postTargets(input),
            // The queue picks (and holds) the time itself; never pass its next slot as a time.
            ...(input.queueProfileId
              ? { queuedFromProfile: input.queueProfileId }
              : input.publishAt
                ? { scheduledFor: input.publishAt.toISOString() }
                : { publishNow: true }),
          },
          headers: { "Idempotency-Key": input.idempotencyKey },
        }),
      );
      const { post } = parse(postSchema, data, "createPost");
      return {
        providerPostId: post._id,
        status: post.status,
        scheduledFor: post.scheduledFor ?? null,
      };
    });
  }

  /**
   * Targets for createPost. TikTok needs the owner's consent and a privacy level from the
   * account's creator info on every post; without consent the TikTok target is refused here.
   */
  private async postTargets(input: CreatePostInput) {
    return Promise.all(
      input.targets.map(async (t) => {
        const extra = input.extras?.[t.platform] ?? legacyExtras(t.platform, input);
        if (t.platform !== "tiktok") return { platform: t.platform, accountId: t.accountId, ...extra };
        if (!input.tiktokConsent) {
          throw new SocialProviderError("TikTok needs the owner's consent for this post", {
            code: "TIKTOK_CONSENT_REQUIRED",
            ambiguous: false,
          });
        }
        const { data } = await this.zernio.accounts.getTikTokCreatorInfo({
          path: { accountId: t.accountId },
          // A video post has its own privacy options on TikTok.
          query: { mediaType: (input.mediaUrls ?? []).some(isVideoUrl) ? "video" : "photo" },
        });
        const privacyLevel = pickTikTokPrivacy(
          (parse(creatorInfoSchema, data, "getTikTokCreatorInfo").privacyLevels ?? []).map(
            (l) => l.value,
          ),
        );
        return {
          platform: t.platform,
          accountId: t.accountId,
          ...(extra.customContent ? { customContent: extra.customContent } : {}),
          platformSpecificData: {
            ...extra.platformSpecificData,
            ...(privacyLevel ? { privacyLevel } : {}),
            contentPreviewConfirmed: true,
            expressConsentGiven: true,
          },
        };
      }),
    );
  }

  async validatePost(
    input: Omit<CreatePostInput, "publishAt" | "idempotencyKey"> & { signal?: AbortSignal },
  ): Promise<PostValidation> {
    return call("validatePost", async (withFetch) => {
      const { data } = await this.zernio.validate.validatePost(
        withFetch({
          signal: input.signal,
          body: {
            content: input.content,
            mediaItems: input.mediaUrls?.map((url) => ({ url })),
            platforms: input.targets.map((t) => ({
              platform: t.platform as "instagram",
              accountId: t.accountId,
            })),
          },
        }),
      );
      const v = parse(validationSchema, data, "validatePost");
      const errors = (v.errors ?? []).map((e) => ({
        platform: e.platform ?? "",
        message: e.error ?? "Not accepted.",
      }));
      return {
        valid: v.valid ?? errors.length === 0,
        errors,
        warnings: (v.warnings ?? []).map((w) => ({
          platform: w.platform ?? "",
          message: w.warning ?? "",
        })),
      };
    });
  }

  async listSequences(input: { profileId: string; signal?: AbortSignal }): Promise<Sequence[]> {
    return call("listSequences", async (withFetch) => {
      const { data } = await this.zernio.sequences.listSequences(
        withFetch({ signal: input.signal, query: { profileId: input.profileId, limit: 100 } }),
      );
      return parse(sequencesSchema, data, "listSequences").sequences.flatMap((s): Sequence[] =>
        s
          ? [
              {
                id: s.id,
                name: s.name,
                platform: s.platform,
                accountId: s.accountId,
                status: s.status,
                steps: s.stepsCount ?? 0,
                preview: s.messagePreview ?? "",
                enrolled: s.totalEnrolled ?? 0,
                completed: s.totalCompleted ?? 0,
                exited: s.totalExited ?? 0,
              },
            ]
          : [],
      );
    });
  }

  async createSequence(input: {
    profileId: string;
    accountId: string;
    platform: string;
    name: string;
    steps: SequenceStep[];
    exitOnReply: boolean;
    exitOnUnsubscribe: boolean;
    signal?: AbortSignal;
  }): Promise<{ id: string }> {
    return call("createSequence", async (withFetch) => {
      const { data } = await this.zernio.sequences.createSequence(
        withFetch({
          signal: input.signal,
          body: {
            profileId: input.profileId,
            accountId: input.accountId,
            platform: input.platform as "whatsapp",
            name: input.name,
            steps: input.steps,
            exitOnReply: input.exitOnReply,
            exitOnUnsubscribe: input.exitOnUnsubscribe,
          },
        }),
      );
      const parsed = parse(
        z.object({ sequence: z.object({ id: z.string().min(1) }) }),
        data,
        "createSequence",
      );
      return { id: parsed.sequence.id };
    });
  }

  async setSequenceActive(input: { id: string; active: boolean; signal?: AbortSignal }) {
    await call(input.active ? "activateSequence" : "pauseSequence", async (withFetch) => {
      const opts = withFetch({ signal: input.signal, path: { sequenceId: input.id } });
      if (input.active) await this.zernio.sequences.activateSequence(opts);
      else await this.zernio.sequences.pauseSequence(opts);
    });
  }

  async deleteSequence(input: { id: string; signal?: AbortSignal }) {
    await call("deleteSequence", async (withFetch) => {
      await this.zernio.sequences.deleteSequence(
        withFetch({ signal: input.signal, path: { sequenceId: input.id } }),
      );
    });
  }

  async enrollInSequence(input: { id: string; contactIds: string[]; signal?: AbortSignal }) {
    return call("enrollContacts", async (withFetch) => {
      const { data } = await this.zernio.sequences.enrollContacts(
        withFetch({
          signal: input.signal,
          path: { sequenceId: input.id },
          body: { contactIds: input.contactIds },
        }),
      );
      const parsed = parse(
        z.object({ enrolled: z.number().catch(0), failed: z.number().catch(0) }),
        data,
        "enrollContacts",
      );
      return { enrolled: parsed.enrolled, failed: parsed.failed };
    });
  }

  async listContactIdsByTag(input: {
    profileId: string;
    accountId: string;
    tag: string;
    signal?: AbortSignal;
  }): Promise<string[]> {
    return call("listContacts", async (withFetch) => {
      const { data } = await this.zernio.contacts.listContacts(
        withFetch({
          signal: input.signal,
          query: {
            profileId: input.profileId,
            accountId: input.accountId,
            tag: input.tag,
            isSubscribed: "true",
            limit: 1000,
          },
        }),
      );
      return parse(
        z.object({ contacts: z.array(z.object({ id: z.string().optional() }).catch({})).catch([]) }),
        data,
        "listContacts",
      ).contacts.flatMap((c) => (c.id ? [c.id] : []));
    });
  }

  async listWorkflows(input: { profileId: string; signal?: AbortSignal }): Promise<ChatFlow[]> {
    return call("listWorkflows", async (withFetch) => {
      const { data } = await this.zernio.workflows.listWorkflows(
        withFetch({ signal: input.signal, query: { profileId: input.profileId, limit: 100 } }),
      );
      return parse(workflowsSchema, data, "listWorkflows").workflows.flatMap((w): ChatFlow[] =>
        w
          ? [
              {
                id: w.id,
                name: w.name,
                description: w.description,
                platform: w.platform,
                status: w.status,
                started: w.totalStarted ?? 0,
                completed: w.totalCompleted ?? 0,
              },
            ]
          : [],
      );
    });
  }

  async createWorkflow(input: {
    profileId: string;
    accountId: string;
    platform: string;
    name: string;
    description?: string;
    graph: WorkflowGraph;
    signal?: AbortSignal;
  }): Promise<{ id: string }> {
    return call("createWorkflow", async (withFetch) => {
      const { data } = await this.zernio.workflows.createWorkflow(
        withFetch({
          signal: input.signal,
          body: {
            profileId: input.profileId,
            accountId: input.accountId,
            platform: input.platform as "whatsapp",
            name: input.name,
            ...(input.description ? { description: input.description } : {}),
            nodes: input.graph.nodes as never,
            edges: input.graph.edges,
            entryNodeId: input.graph.entryNodeId,
          },
        }),
      );
      const parsed = parse(
        z.object({ workflow: z.object({ id: z.string().min(1) }) }),
        data,
        "createWorkflow",
      );
      return { id: parsed.workflow.id };
    });
  }

  async setWorkflowActive(input: { id: string; active: boolean; signal?: AbortSignal }) {
    await call(input.active ? "activateWorkflow" : "pauseWorkflow", async (withFetch) => {
      const opts = withFetch({ signal: input.signal, path: { workflowId: input.id } });
      if (input.active) await this.zernio.workflows.activateWorkflow(opts);
      else await this.zernio.workflows.pauseWorkflow(opts);
    });
  }

  async deleteWorkflow(input: { id: string; signal?: AbortSignal }) {
    await call("deleteWorkflow", async (withFetch) => {
      await this.zernio.workflows.deleteWorkflow(
        withFetch({ signal: input.signal, path: { workflowId: input.id } }),
      );
    });
  }

  async listCommentAutomations(input: { profileId: string; signal?: AbortSignal }) {
    return call("listCommentAutomations", async (withFetch) => {
      const { data } = await this.zernio.commentautomations.listCommentAutomations(
        withFetch({ signal: input.signal, query: { profileId: input.profileId } }),
      );
      return parse(commentAutomationsSchema, data, "listCommentAutomations").automations.flatMap(
        (a): CommentAutomation[] =>
          a
            ? [
                {
                  id: a.id,
                  name: a.name,
                  platform: a.platform,
                  accountId: a.accountId,
                  keywords: a.keywords,
                  matchMode: a.matchMode,
                  dmMessage: a.dmMessage ?? null,
                  button: (() => {
                    const b = a.buttons?.find((x) => x.type === "url" && x.url);
                    return b?.url ? { title: b.title, url: b.url } : null;
                  })(),
                  commentReply: a.commentReply ?? null,
                  once: a.repeatPolicy?.mode !== "every_comment",
                  postTitle: a.postTitle ?? null,
                  isActive: a.isActive,
                  stats: {
                    triggered: a.stats?.triggered ?? 0,
                    dmsSent: a.stats?.dmsSent ?? 0,
                    dmsFailed: a.stats?.dmsFailed ?? 0,
                    linkClicks: a.stats?.linkClicks ?? 0,
                  },
                },
              ]
            : [],
      );
    });
  }

  async createCommentAutomation(input: {
    profileId: string;
    automation: CommentAutomationInput;
    isActive: boolean;
    signal?: AbortSignal;
  }): Promise<{ id: string }> {
    return call("createCommentAutomation", async (withFetch) => {
      const { data } = await this.zernio.commentautomations.createCommentAutomation(
        withFetch({
          signal: input.signal,
          body: {
            profileId: input.profileId,
            accountId: input.automation.accountId,
            trigger: "comment",
            isActive: input.isActive,
            ...automationBody(input.automation),
          },
        }),
      );
      const parsed = parse(
        z.object({ automation: z.object({ id: z.string().min(1) }) }),
        data,
        "createCommentAutomation",
      );
      return { id: parsed.automation.id };
    });
  }

  async updateCommentAutomation(input: {
    id: string;
    automation?: CommentAutomationInput;
    isActive?: boolean;
    signal?: AbortSignal;
  }): Promise<void> {
    await call("updateCommentAutomation", async (withFetch) => {
      await this.zernio.commentautomations.updateCommentAutomation(
        withFetch({
          signal: input.signal,
          path: { automationId: input.id },
          body: {
            ...(input.automation ? automationBody(input.automation) : {}),
            ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
          },
        }),
      );
    });
  }

  async deleteCommentAutomation(input: { id: string; signal?: AbortSignal }): Promise<void> {
    await call("deleteCommentAutomation", async (withFetch) => {
      await this.zernio.commentautomations.deleteCommentAutomation(
        withFetch({ signal: input.signal, path: { automationId: input.id } }),
      );
    });
  }

  async listCommentAutomationLogs(input: { id: string; limit?: number; signal?: AbortSignal }) {
    return call("listCommentAutomationLogs", async (withFetch) => {
      const { data } = await this.zernio.commentautomations.listCommentAutomationLogs(
        withFetch({
          signal: input.signal,
          path: { automationId: input.id },
          query: { limit: input.limit ?? 10 },
        }),
      );
      const parsed = parse(commentAutomationLogsSchema, data, "listCommentAutomationLogs");
      return {
        entries: parsed.logs.flatMap((l): CommentAutomationLogEntry[] =>
          l
            ? [
                {
                  id: l.id,
                  who: l.commenterUsername ? `@${l.commenterUsername}` : (l.commenterName ?? "Someone"),
                  status: l.status,
                  at: l.createdAt ?? null,
                },
              ]
            : [],
        ),
        misses: parsed.misses?.total ?? 0,
      };
    });
  }

  async getQueue(input: { profileId: string; signal?: AbortSignal }): Promise<PostingQueue | null> {
    return call("getQueue", async (withFetch) => {
      const { data } = await this.zernio.queue.listQueueSlots(
        withFetch({ signal: input.signal, query: { profileId: input.profileId } }),
      );
      const q = parse(queueSchema, data, "getQueue");
      if (q.exists === false || !q.schedule) return null;
      return toQueue(q);
    });
  }

  async saveQueue(input: {
    profileId: string;
    timezone: string;
    slots: { dayOfWeek: number; time: string }[];
    signal?: AbortSignal;
  }): Promise<PostingQueue> {
    const existing = await this.getQueue({ profileId: input.profileId, signal: input.signal });
    return call("saveQueue", async (withFetch) => {
      const body = { profileId: input.profileId, timezone: input.timezone, slots: input.slots };
      const { data } = existing
        ? await this.zernio.queue.updateQueueSlot(withFetch({ signal: input.signal, body }))
        : await this.zernio.queue.createQueueSlot(
            withFetch({ signal: input.signal, body: { ...body, name: "Posting times" } }),
          );
      return toQueue(parse(queueSchema, data, "saveQueue"));
    });
  }

  async listPinterestBoards(input: { accountId: string; signal?: AbortSignal }) {
    return call("listPinterestBoards", async (withFetch) => {
      const { data } = await this.zernio.connect.getPinterestBoards(
        withFetch({ signal: input.signal, path: { accountId: input.accountId } }),
      );
      return (parse(pinterestBoardsSchema, data, "listPinterestBoards").boards ?? []).flatMap(
        (b) => (b.id ? [{ id: b.id, name: b.name?.trim() || "Untitled board" }] : []),
      );
    });
  }

  async presignMedia(input: {
    filename: string;
    contentType: string;
    size: number;
    signal?: AbortSignal;
  }): Promise<{ uploadUrl: string; publicUrl: string }> {
    return call("presignMedia", async (withFetch) => {
      const { data } = await this.zernio.media.getMediaPresignedUrl(
        withFetch({
          signal: input.signal,
          body: {
            filename: input.filename,
            contentType: input.contentType as never,
            size: input.size,
          },
        }),
      );
      const { uploadUrl, publicUrl } = parse(presignSchema, data, "presignMedia");
      return { uploadUrl, publicUrl };
    });
  }

  async uploadMedia(input: {
    filename: string;
    contentType: string;
    bytes: Uint8Array;
    signal?: AbortSignal;
  }): Promise<{ publicUrl: string }> {
    const { uploadUrl, publicUrl } = await this.presignMedia({
      filename: input.filename,
      contentType: input.contentType,
      size: input.bytes.byteLength,
      signal: input.signal,
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

  async unpublishPost(input: {
    postId: string;
    platform: string;
    accountId?: string;
    signal?: AbortSignal;
  }): Promise<void> {
    await call("unpublishPost", async (withFetch) => {
      await this.zernio.posts.unpublishPost(
        withFetch({
          signal: input.signal,
          path: { postId: input.postId },
          body: {
            platform: input.platform as "facebook",
            ...(input.accountId ? { accountId: input.accountId } : {}),
          },
        }),
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

  async hideComment(input: {
    accountId: string;
    postId: string;
    commentId: string;
    signal?: AbortSignal;
  }): Promise<void> {
    await call("hideComment", async (withFetch) => {
      await this.zernio.comments.hideInboxComment(
        withFetch({
          signal: input.signal,
          path: { postId: input.postId, commentId: input.commentId },
          body: { accountId: input.accountId },
        }),
      );
    });
  }

  async unhideComment(input: {
    accountId: string;
    postId: string;
    commentId: string;
    signal?: AbortSignal;
  }): Promise<void> {
    await call("unhideComment", async (withFetch) => {
      await this.zernio.comments.unhideInboxComment(
        withFetch({
          signal: input.signal,
          path: { postId: input.postId, commentId: input.commentId },
          query: { accountId: input.accountId },
        }),
      );
    });
  }

  async sendPrivateReply(input: {
    accountId: string;
    postId: string;
    commentId: string;
    message: string;
    signal?: AbortSignal;
  }) {
    return call("sendPrivateReply", async (withFetch) => {
      const { data } = await this.zernio.comments.sendPrivateReplyToComment(
        withFetch({
          signal: input.signal,
          path: { postId: input.postId, commentId: input.commentId },
          body: { accountId: input.accountId, message: input.message },
        }),
      );
      return {
        providerMessageId: parse(privateReplySchema, data, "sendPrivateReply").messageId,
      };
    });
  }

  async listReviews(input: {
    accountId: string;
    platform?: string;
    limit?: number;
    signal?: AbortSignal;
  }) {
    return call("listReviews", async (withFetch) => {
      const { data } = await this.zernio.reviews.listInboxReviews(
        withFetch({
          signal: input.signal,
          query: {
            platform: input.platform === "googlebusiness" ? "googlebusiness" : "facebook",
            accountId: input.accountId,
            sortBy: "date",
            sortOrder: "desc",
            limit: input.limit ?? 25,
          },
        }),
      );
      return parse(reviewsSchema, data, "listReviews").data.map((r) => ({
        id: r.id,
        reviewerName: r.reviewer?.name ?? null,
        recommends:
          r.recommendationType === "positive"
            ? true
            : r.recommendationType === "negative"
              ? false
              : null,
        rating: r.rating ?? null,
        text: r.text ?? "",
        createdAt: r.created,
        hasReply: r.hasReply ?? false,
        reviewUrl: r.reviewUrl?.startsWith("https://") ? r.reviewUrl : null,
      }));
    });
  }

  async getAnalyticsDashboard(input: {
    profileId: string;
    fromDate: string;
    toDate: string;
    platform?: "instagram" | "facebook";
    signal?: AbortSignal;
  }) {
    return call("getAnalyticsDashboard", async (withFetch) => {
      const { data } = await this.zernio.analytics.getAnalyticsDashboard(
        withFetch({
          signal: input.signal,
          query: {
            profileId: input.profileId,
            fromDate: input.fromDate,
            toDate: input.toDate,
            compare: "previous_period" as const,
            topPosts: 5,
            recentPosts: 0,
            ...(input.platform ? { platform: input.platform } : {}),
          },
        }),
      );
      return toDashboard(data, input);
    });
  }

  async listPostAnalytics(input: {
    profileId: string;
    fromDate: string;
    toDate: string;
    page: number;
    signal?: AbortSignal;
  }) {
    return call("listPostAnalytics", async (withFetch) => {
      const { data } = await this.zernio.analytics.getAnalytics(
        withFetch({
          signal: input.signal,
          query: {
            profileId: input.profileId,
            fromDate: input.fromDate,
            toDate: input.toDate,
            page: input.page,
            limit: 50,
            source: "all" as const,
          },
        }),
      );
      return toPostList(data);
    });
  }

  async getFollowerStats(input: {
    profileId: string;
    fromDate: string;
    toDate: string;
    signal?: AbortSignal;
  }) {
    return call("getFollowerStats", async (withFetch) => {
      const { data } = await this.zernio.accounts.getFollowerStats(
        withFetch({
          signal: input.signal,
          query: {
            profileId: input.profileId,
            fromDate: input.fromDate,
            toDate: input.toDate,
            granularity: "daily" as const,
          },
        }),
      );
      return toFollowerSeries(data);
    });
  }

  async getBestTimeToPost(input: { profileId: string; signal?: AbortSignal }) {
    return call("getBestTimeToPost", async (withFetch) => {
      const { data } = await this.zernio.analytics.getBestTimeToPost(
        withFetch({ signal: input.signal, query: { profileId: input.profileId } }),
      );
      return toBestTimes(data);
    });
  }

  async getDemographics(input: {
    accountId: string;
    platform: "instagram" | "facebook";
    signal?: AbortSignal;
  }) {
    return call("getDemographics", async (withFetch) => {
      const { data } =
        input.platform === "instagram"
          ? await this.zernio.analytics.getInstagramDemographics(
              withFetch({
                signal: input.signal,
                query: { accountId: input.accountId, breakdown: "age,gender,city,country" },
              }),
            )
          : await this.zernio.analytics.getFacebookDemographics(
              withFetch({
                signal: input.signal,
                query: { accountId: input.accountId, breakdown: "country,city" },
              }),
            );
      return toDemographics(data);
    });
  }

  async getGoogleBusinessPerformance(input: {
    accountId: string;
    fromDate: string;
    toDate: string;
    signal?: AbortSignal;
  }): Promise<Record<string, number>> {
    return call("getGoogleBusinessPerformance", async (withFetch) => {
      const { data } = await this.zernio.analytics.getGoogleBusinessPerformance(
        withFetch({
          signal: input.signal,
          query: { accountId: input.accountId, fromDate: input.fromDate, toDate: input.toDate },
        }),
      );
      const parsed = parse(gbpPerformanceSchema, data, "getGoogleBusinessPerformance");
      return Object.fromEntries(
        Object.entries(parsed.metrics ?? {}).map(([k, v]) => [k, v?.total ?? 0]),
      );
    });
  }

  async getOnlineFollowers(input: { accountId: string; signal?: AbortSignal }) {
    return call("getOnlineFollowers", async (withFetch) => {
      const { data } = await this.zernio.analytics.getInstagramOnlineFollowers(
        withFetch({ signal: input.signal, query: { accountId: input.accountId } }),
      );
      return toOnlineFollowers(data);
    });
  }

  async getPostTimeline(input: {
    postId: string;
    fromDate?: string;
    toDate?: string;
    signal?: AbortSignal;
  }) {
    return call("getPostTimeline", async (withFetch) => {
      const { data } = await this.zernio.analytics.getPostTimeline(
        withFetch({
          signal: input.signal,
          query: { postId: input.postId, fromDate: input.fromDate, toDate: input.toDate },
        }),
      );
      return toTimeline(data);
    });
  }

  async replyToReview(input: {
    accountId: string;
    reviewId: string;
    message: string;
    idempotencyKey: string;
    signal?: AbortSignal;
  }) {
    return call("replyToReview", async (withFetch) => {
      const { data } = await this.zernio.reviews.replyToInboxReview(
        withFetch({
          signal: input.signal,
          path: { reviewId: input.reviewId },
          body: { accountId: input.accountId, message: input.message },
          headers: { "Idempotency-Key": input.idempotencyKey },
        }),
      );
      return { providerReplyId: parse(reviewReplySchema, data, "replyToReview").reply.id };
    });
  }

  async listWhatsAppTemplates(input: { accountId: string; signal?: AbortSignal }) {
    return call("listWhatsAppTemplates", async (withFetch) => {
      const { data } = await this.zernio.whatsapp.getWhatsAppTemplates(
        withFetch({ signal: input.signal, query: { accountId: input.accountId } }),
      );
      return (parse(waTemplatesSchema, data, "listWhatsAppTemplates").templates ?? []).flatMap(
        (t): WhatsAppTemplate[] => {
          if (!t.id || !t.name) return [];
          const body = bodyOf(t.components);
          return [
            {
              id: t.id,
              name: t.name,
              language: t.language ?? "en",
              status: t.status ?? "PENDING",
              category: t.category ?? "UTILITY",
              body,
              variables: variableCount(body),
            },
          ];
        },
      );
    });
  }

  async createWhatsAppTemplate(input: {
    accountId: string;
    name: string;
    category: "UTILITY" | "MARKETING";
    language: string;
    body: string;
    examples: string[];
    signal?: AbortSignal;
  }) {
    return call("createWhatsAppTemplate", async (withFetch) => {
      const { data } = await this.zernio.whatsapp.createWhatsAppTemplate(
        withFetch({
          signal: input.signal,
          body: {
            accountId: input.accountId,
            name: input.name,
            category: input.category,
            language: input.language,
            components: [
              {
                type: "body",
                text: input.body,
                ...(input.examples.length ? { example: { body_text: [input.examples] } } : {}),
              } as never,
            ],
          },
        }),
      );
      const { template } = parse(waCreatedSchema, data, "createWhatsAppTemplate");
      return { id: template.id, status: template.status ?? "PENDING" };
    });
  }

  async sendDm(input: {
    accountId: string;
    conversationId: string;
    message: string;
    idempotencyKey: string;
    template?: { name: string; language: string; params: string[] };
    signal?: AbortSignal;
  }) {
    return call("sendDm", async (withFetch) => {
      const { data } = await this.zernio.messages.sendInboxMessage(
        withFetch({
          signal: input.signal,
          path: { conversationId: input.conversationId },
          body: input.template
            ? {
                accountId: input.accountId,
                template: {
                  elements: [
                    {
                      name: input.template.name,
                      language: input.template.language,
                      components: input.template.params.length
                        ? [
                            {
                              type: "body",
                              parameters: input.template.params.map((text) => ({
                                type: "text",
                                text,
                              })),
                            },
                          ]
                        : [],
                    },
                  ],
                },
              }
            : { accountId: input.accountId, message: input.message },
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

  async getUsageByProfile(input: { signal?: AbortSignal } = {}): Promise<ProviderUsage> {
    return call("getUsageByProfile", async (withFetch) => {
      const { data } = await this.zernio.usage.getUsage(
        withFetch({ signal: input.signal, query: { range: "cycle", groupBy: "profile" } }),
      );
      const u = parse(usageSchema, data, "getUsageByProfile");
      return {
        periodStart: u.period?.start ?? null,
        periodEnd: u.period?.end ?? null,
        totalUsd: u.attribution?.totals?.totalUsd ?? u.totals?.total ?? 0,
        unattributedUsd: u.attribution?.unattributed?.totalUsd ?? 0,
        byProfile: (u.attribution?.groups ?? []).map((g) => ({
          profileId: g.key,
          totalUsd: g.totalUsd ?? 0,
        })),
      };
    });
  }

  async disconnectAccount(input: { accountId: string; signal?: AbortSignal }): Promise<void> {
    await ignoreGone(
      call("disconnectAccount", async (withFetch) => {
        await this.zernio.accounts.deleteAccount(
          withFetch({ signal: input.signal, path: { accountId: input.accountId } }),
        );
      }),
    );
  }

  async deleteProfile(input: { profileId: string; signal?: AbortSignal }): Promise<void> {
    await ignoreGone(
      call("deleteProfile", async (withFetch) => {
        await this.zernio.profiles.deleteProfile(
          withFetch({ signal: input.signal, path: { profileId: input.profileId } }),
        );
      }),
    );
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

  async listAccountPictures(input: { profileId: string }): Promise<AccountPicture[]> {
    return call("listAccountPictures", async (withFetch) => {
      const { data } = await this.zernio.accounts.listAccounts(
        withFetch({ query: { profileId: input.profileId } }),
      );
      return parse(accountPicturesSchema, data, "listAccountPictures").accounts.map((a) => ({
        accountId: a._id,
        pictureUrl: a.profilePicture ?? null,
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

/** The YouTube title and Pinterest board passed the T63/T64 way (no `extras` for the platform). */
function legacyExtras(platform: string, input: CreatePostInput): TargetExtras {
  if (platform === "pinterest" && input.pinterestBoardId) {
    return { platformSpecificData: { boardId: input.pinterestBoardId } };
  }
  if (platform === "youtube" && input.youtubeTitle) {
    return { platformSpecificData: { title: input.youtubeTitle } };
  }
  return {};
}

function toQueue(q: z.infer<typeof queueSchema>): PostingQueue {
  return {
    timezone: q.schedule?.timezone ?? "UTC",
    slots: (q.schedule?.slots ?? []).flatMap((s) => (s ? [s] : [])),
    nextSlots: q.nextSlots ?? [],
  };
}

/** The create/update body of a comment automation (T77a). */
function automationBody(a: CommentAutomationInput) {
  return {
    name: a.name,
    keywords: a.keywords,
    matchMode: a.matchMode,
    ...(a.dmMessage ? { dmMessage: a.dmMessage } : {}),
    buttons: a.button ? [{ type: "url" as const, title: a.button.title, url: a.button.url }] : [],
    ...(a.commentReply ? { commentReply: a.commentReply } : {}),
    repeatPolicy: { mode: a.once ? ("once" as const) : ("every_comment" as const) },
  };
}
