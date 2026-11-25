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
  DM_ACCESS_MISSING,
  SocialProviderError,
  EMPTY_ACCOUNT_CATEGORY,
  type AccountCategory,
  type TelegramConnectStatus,
  mediaKindOf,
  postMediaOf,
  toMediaItems,
  type PostPlatformResult,
  type WhatsAppTemplate,
  type AccountsHealthReport,
  type BusinessProfile,
  type AccountPicture,
  type CreatePostInput,
  type UpdatePostInput,
  type ProviderCommentReply,
  type ProviderComment,
  type ProviderConversation,
  type ProviderMessage,
  type ProviderPostStatus,
  type MediaCheck,
  type PostValidation,
  type PostingQueue,
  type AdAccount,
  type SmsOnNumber,
  type SmsRegistration,
  RCS_AGENT_STATUSES,
  type BlogArticleView,
  type DriveItem,
  type OrderView,
  type ProductView,
  IMESSAGE_SENDER_STATUSES,
  type ImessageSenderView,
  type ImessageOrderResult,
  type RcsAgentView,
  type VoiceSettings,
  type OwnedNumber,
  type PhoneCountry,
  type PhoneNumberType,
  type PurchaseResult,
  type CalendarEventSummary,
  type EmailDiscovery,
  type ProviderErrorInfo,
  type Integration,
  type SiteKeys,
  type AdCampaignSummary,
  type AdConnection,
  type AdLead,
  type AdRuleSummary,
  type AdLeadStatus,
  type Broadcast,
  type LeadForm,
  type ChatFlow,
  type Contact,
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
  type IntegrationKind,
} from "./types";
import { conversationsAccessIssue, conversationsMetaSchema } from "./dm-access";
import { connectBranding } from "./whitelabel";

const blogArticleSchema = z.object({
  id: z.string().min(1),
  title: z.string().catch(""),
  url: z.string().nullish(),
  isPublished: z.boolean().catch(false),
  status: z.string().nullish(),
  publishedAt: z.string().nullish(),
  publishDate: z.string().nullish(),
});

function blogArticleView(a: z.infer<typeof blogArticleSchema>): BlogArticleView {
  return {
    id: a.id,
    title: a.title,
    url: a.url?.startsWith("https://") || a.url?.startsWith("http://") ? a.url : null,
    isPublished: a.isPublished,
    status: a.status ?? null,
    date: a.publishDate ?? a.publishedAt ?? null,
  };
}

const moneySchema = z.object({ amount: z.string(), currency: z.string() }).nullish().catch(null);

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
const mediaCheckSchema = z.object({
  valid: z.boolean().optional(),
  code: z.string().optional(),
  error: z.string().optional(),
  type: z.string().optional(),
  format: z.string().optional(),
  size: z.number().nullable().optional(),
  platformLimits: z
    .record(
      z.string(),
      z.object({ withinLimit: z.boolean().optional(), limitFormatted: z.string().optional() }),
    )
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
/** `POST /v1/posts/{postId}/edit`: the edited post's link, when Zernio gives one. */
const editSchema = z.object({ url: z.string().nullish() });
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
const leadStatusSchema = z
  .enum(["new", "contacted", "unreachable", "qualified", "converted", "disqualified"])
  .catch("new");
const adLeadsSchema = z.object({
  leads: z
    .array(
      z
        .object({
          id: z.string().min(1),
          formName: z.string().nullish().catch(null),
          createdTime: z.string().nullish().catch(null),
          fields: z.record(z.string(), z.string()).catch({}),
          consents: z
            .array(z.object({ checkboxKey: z.string(), isChecked: z.boolean() }))
            .nullish()
            .catch(null),
          status: leadStatusSchema,
          contactId: z.string().nullish().catch(null),
        })
        .nullable()
        .catch(null),
    )
    .catch([]),
});
const adCampaignStatusSchema = z
  .enum(["active", "paused", "pending_review", "rejected", "completed", "cancelled", "error"])
  .catch("error");
const num = z.number().nullish().catch(null);
const adCampaignsSchema = z.object({
  campaigns: z
    .array(
      z
        .object({
          platformCampaignId: z.string().min(1),
          platform: z.string().catch("facebook"),
          campaignName: z.string().nullish().catch(null),
          status: adCampaignStatusSchema,
          budget: z
            .object({ amount: z.number(), type: z.enum(["daily", "lifetime"]) })
            .nullish()
            .catch(null),
          currency: z.string().nullish().catch(null),
          metrics: z.object({ spend: num, reach: num, clicks: num }).nullish().catch(null),
        })
        .nullable()
        .catch(null),
    )
    .catch([]),
});
const broadcastsSchema = z.object({
  broadcasts: z
    .array(
      z
        .object({
          id: z.string().min(1),
          name: z.string().catch(""),
          platform: z.string().catch(""),
          status: z
            .enum(["draft", "scheduled", "sending", "completed", "failed", "cancelled"])
            .catch("draft"),
          messagePreview: z.string().catch(""),
          scheduledAt: z.string().nullish().catch(null),
          completedAt: z.string().nullish().catch(null),
          recipientCount: z.number().catch(0),
          sentCount: z.number().catch(0),
          deliveredCount: z.number().catch(0),
          readCount: z.number().catch(0),
          failedCount: z.number().catch(0),
        })
        .nullable()
        .catch(null),
    )
    .catch([]),
});
const contactSchema = z.object({
  id: z.string().min(1),
  name: z.string().catch(""),
  email: z.string().nullish().catch(null),
  tags: z.array(z.string()).catch([]),
  isSubscribed: z.boolean().catch(false),
  platform: z.string().nullish().catch(null),
  displayIdentifier: z.string().nullish().catch(null),
  platformIdentifier: z.string().nullish().catch(null),
  lastMessageReceivedAt: z.string().nullish().catch(null),
  lastMessageSentAt: z.string().nullish().catch(null),
});
const contactsSchema = z.object({
  contacts: z.array(contactSchema.nullable().catch(null)).catch([]),
  pagination: z.object({ total: z.number().optional() }).nullish().catch(null),
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
      senderName: z.string().nullish(),
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
// First-connect catch-up (docs.zernio.com/comments/list-inbox-comments,
// /comments/get-inbox-post-comments, /messages/list-inbox-conversations).
const commentedPostsPageSchema = z.object({
  data: z
    .array(
      z.object({
        id: z.string().min(1),
        commentCount: z.number().optional(),
        // The post's caption (first-connect reveal labels and top questions).
        content: z.string().nullish(),
      }),
    )
    .optional(),
  pagination: z.object({ nextCursor: z.string().nullish() }).nullish(),
});
/** The earliest of the account's own inline replies (response score, 20 Nov); null if unknown. */
function firstOwnerReplyAt(
  replies: { from?: { isOwner?: boolean } | null; createdTime?: string | null }[],
): string | null {
  const times = replies
    .filter((r) => r.from?.isOwner === true && r.createdTime)
    .map((r) => r.createdTime as string)
    .filter((t) => Number.isFinite(Date.parse(t)))
    .sort((a, b) => Date.parse(a) - Date.parse(b));
  return times[0] ?? null;
}
const postCommentsPageSchema = z.object({
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
        // Up to a few inline replies; the docs give them the comment's shape.
        replies: z
          .array(
            z.object({
              from: z.object({ isOwner: z.boolean().optional() }).nullish(),
              createdTime: z.string().nullish(),
            }),
          )
          .nullish(),
      }),
    )
    .optional(),
  // `cursor` is only present while hasMore is true.
  pagination: z.object({ hasMore: z.boolean().optional(), cursor: z.string().nullish() }).nullish(),
});
const conversationsSchema = z.object({
  meta: conversationsMetaSchema,
  data: z
    .array(
      z.object({
        id: z.string().min(1),
        participantId: z.string().nullish(),
        participantName: z.string().nullish(),
        updatedTime: z.string().nullish(),
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
  summary: z.object({ total: z.number().int().nonnegative().optional() }).nullish(),
  accounts: z.array(
    z.object({
      accountId: z.string().min(1),
      profileId: z.string().nullish(),
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

/** The provider's fix from a Zernio error body (`details.title/body/guidance`), when present. */
function errorInfo(body: unknown): ProviderErrorInfo | undefined {
  const d = z
    .object({
      details: z
        .object({
          title: z.string().nullish(),
          body: z.string().nullish(),
          helpUrl: z.string().nullish(),
          guidance: z
            .object({ helpUrl: z.string().nullish(), steps: z.array(z.string()).nullish() })
            .nullish()
            .catch(null),
        })
        .nullish()
        .catch(null),
    })
    .safeParse(body);
  const det = d.success ? d.data.details : null;
  if (!det) return undefined;
  return {
    title: det.title ?? null,
    body: det.body ?? null,
    helpUrl: det.guidance?.helpUrl ?? det.helpUrl ?? null,
    steps: det.guidance?.steps ?? [],
  };
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

  async getUsageCost(input: { profileId: string; from: string; to: string; signal?: AbortSignal }) {
    return call("getUsageCost", async (withFetch) => {
      const { data } = await this.zernio.usage.getUsage(
        withFetch({
          signal: input.signal,
          query: {
            range: "custom",
            from: input.from,
            to: input.to,
            granularity: "total",
            profileId: input.profileId,
          },
        }),
      );
      const r = parse(
        z.object({
          supported: z.boolean().nullish(),
          totals: z.record(z.string(), z.number()).nullish(),
        }),
        data,
        "getUsageCost",
      );
      return r.totals ?? {};
    });
  }

  /** See SocialProvider.getIntegrationConnectUrl. */
  async getIntegrationConnectUrl(input: {
    kind: IntegrationKind;
    profileId: string;
    redirectUrl: string;
    postingAccountId?: string;
    signal?: AbortSignal;
  }) {
    const schema = z.object({
      authUrl: z.string().nullish(),
      alreadyConnected: z.boolean().nullish(),
    });
    // docs.zernio.com/connect/connect-ads: Google, Reddit and Microsoft Ads are standalone (the
    // ads name in the path); TikTok and X Ads go by the posting platform, X with its account.
    const adsPath: Partial<Record<IntegrationKind, string>> = {
      googleads: "googleads",
      redditads: "redditads",
      microsoftads: "microsoftads",
      tiktokads: "tiktok",
      xads: "twitter",
    };
    const path = adsPath[input.kind];
    if (path) {
      return call("getIntegrationConnectUrl", async (withFetch) => {
        const { data } = await this.zernio.connect.connectAds(
          withFetch({
            signal: input.signal,
            path: { platform: path as never },
            query: {
              profileId: input.profileId,
              redirect_url: input.redirectUrl,
              ...(input.postingAccountId ? { accountId: input.postingAccountId } : {}),
            },
          }),
        );
        const r = parse(schema, data, "getIntegrationConnectUrl");
        return r.authUrl ? { authUrl: r.authUrl } : { alreadyConnected: true as const };
      });
    }
    return call("getIntegrationConnectUrl", async (withFetch) => {
      const { data } = await this.zernio.connect.getConnectUrl(
        withFetch({
          signal: input.signal,
          path: { platform: input.kind as never },
          query: {
            profileId: input.profileId,
            redirect_url: input.redirectUrl,
            ...connectBranding(process.env.APP_URL ?? ""),
          },
        }),
      );
      const r = parse(schema, data, "getIntegrationConnectUrl");
      return r.authUrl ? { authUrl: r.authUrl } : { alreadyConnected: true as const };
    });
  }

  async getWechatIpWhitelist(input: { signal?: AbortSignal } = {}) {
    const r = await this.raw(
      "getWechatIpWhitelist",
      "/v1/connect/wechat/ip-whitelist",
      z.object({ ips: z.array(z.string()) }),
      { method: "GET", signal: input.signal },
    );
    return r.ips;
  }

  async connectWechat(input: {
    profileId: string;
    appId: string;
    appSecret: string;
    signal?: AbortSignal;
  }) {
    const userId = await this.userId(input.signal);
    const r = await this.raw(
      "connectWechat",
      "/v1/connect/wechat/credentials",
      z.object({
        account: z.object({
          accountId: z.string().min(1),
          username: z.string().nullish(),
          displayName: z.string().nullish(),
        }),
        server: z.object({
          url: z.string().min(1),
          token: z.string().min(1),
          encodingAESKey: z.string().min(1),
        }),
      }),
      {
        method: "POST",
        body: {
          appId: input.appId,
          appSecret: input.appSecret,
          state: `${userId}-${input.profileId}`,
        },
        signal: input.signal,
      },
    );
    return {
      accountId: r.account.accountId,
      name: r.account.displayName ?? r.account.username ?? "WeChat",
      server: r.server,
    };
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
            mediaItems: mediaItemsFor(input),
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
        if (t.platform !== "tiktok")
          return { platform: t.platform, accountId: t.accountId, ...extra };
        if (!input.tiktokConsent) {
          throw new SocialProviderError("TikTok needs the owner's consent for this post", {
            code: "TIKTOK_CONSENT_REQUIRED",
            ambiguous: false,
          });
        }
        const { data } = await this.zernio.accounts.getTikTokCreatorInfo({
          path: { accountId: t.accountId },
          // A video post has its own privacy options on TikTok.
          query: {
            mediaType: postMediaOf(input).some((m) => mediaKindOf(m) === "video")
              ? "video"
              : "photo",
          },
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
          ...(extra.customMedia?.length ? { customMedia: extra.customMedia } : {}),
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
            mediaItems: mediaItemsFor(input),
            // Each target's own text and choices (Story, Reel, title, board), as createPost sends
            // them, so the check sees the post that will really go out.
            platforms: input.targets.map((t) => ({
              platform: t.platform as "instagram",
              accountId: t.accountId,
              ...(input.extras?.[t.platform] ?? legacyExtras(t.platform, input)),
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

  async validateMedia(input: { url: string; signal?: AbortSignal }): Promise<MediaCheck> {
    return call("validateMedia", async (withFetch) => {
      const { data } = await this.zernio.validate.validateMedia(
        withFetch({ signal: input.signal, body: { url: input.url } }),
      );
      const m = parse(mediaCheckSchema, data, "validateMedia");
      const type =
        m.type === "image" || m.type === "video" || m.type === "document" ? m.type : null;
      return {
        valid: m.valid === true,
        code: m.code ?? null,
        error: m.error ?? null,
        type,
        format: m.format ?? null,
        size: m.size ?? null,
        platformLimits: Object.fromEntries(
          Object.entries(m.platformLimits ?? {}).map(([k, v]) => [
            k,
            { withinLimit: v.withinLimit !== false, limitFormatted: v.limitFormatted ?? "" },
          ]),
        ),
      };
    });
  }

  /**
   * A JSON call for routes the installed SDK doesn't have yet (T80b: email, LINE). Same auth,
   * base URL and error mapping as the SDK calls.
   */
  private async raw<T>(
    operation: string,
    path: string,
    schema: z.ZodType<T>,
    init: { method: "GET" | "POST"; body?: unknown; signal?: AbortSignal },
  ): Promise<T> {
    let res: Response;
    try {
      res = await globalThis.fetch(`${this.zernio.baseURL}${path}`, {
        method: init.method,
        headers: {
          Authorization: `Bearer ${this.zernio.apiKey}`,
          "Content-Type": "application/json",
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: init.signal,
      });
    } catch (error) {
      throw toSocialError(error, operation);
    }
    const body: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const code = z.object({ code: z.string() }).safeParse(body);
      const info = errorInfo(body);
      throw new SocialProviderError(`Zernio ${operation} failed (${res.status})`, {
        status: res.status,
        ...(code.success ? { code: code.data.code } : {}),
        ambiguous: res.status >= 500,
        retryAfterSeconds: parseRetryAfter(res.headers.get("Retry-After")),
        ...(info ? { info } : {}),
      });
    }
    return parse(schema, body, operation);
  }

  private async userId(signal?: AbortSignal): Promise<string> {
    if (!this.currentUserId) {
      this.currentUserId = await call("listUsers", async (withFetch) => {
        const { data } = await this.zernio.users.listUsers(withFetch({ signal }));
        return parse(usersSchema, data, "listUsers").currentUserId;
      });
    }
    return this.currentUserId;
  }

  async discoverEmail(input: { email: string; signal?: AbortSignal }): Promise<EmailDiscovery> {
    const { data } = await this.raw(
      "discoverEmail",
      "/v1/email/imap/discover",
      z.object({
        data: z.object({
          route: z.enum(["imap", "google_oauth", "microsoft_oauth", "unsupported"]),
          provider: z.object({ name: z.string().nullish() }).nullish().catch(null),
          auth: z
            .object({
              label: z.string().nullish(),
              helpUrl: z.string().nullish(),
              steps: z.array(z.string()).nullish(),
            })
            .nullish()
            .catch(null),
          preflight: z
            .array(z.object({ text: z.string(), url: z.string().nullish() }))
            .nullish()
            .catch(null),
        }),
      }),
      { method: "POST", body: { email: input.email }, signal: input.signal },
    );
    return {
      route: data.route,
      providerName: data.provider?.name ?? null,
      passwordLabel: data.auth?.label ?? null,
      helpUrl: data.auth?.helpUrl ?? null,
      steps: data.auth?.steps ?? [],
      preflight: (data.preflight ?? []).map((p) => ({ text: p.text, url: p.url ?? null })),
    };
  }

  async connectEmail(input: {
    profileId: string;
    email: string;
    password: string;
    name?: string;
    signal?: AbortSignal;
  }) {
    // Success body isn't documented; the caller reads the new mailbox from the profile's accounts.
    await this.raw("connectEmail", "/v1/email/imap/accounts", z.unknown(), {
      method: "POST",
      body: {
        profileId: input.profileId,
        email: input.email,
        password: input.password,
        ...(input.name ? { name: input.name } : {}),
      },
      signal: input.signal,
    });
  }

  async connectLine(input: {
    profileId: string;
    channelId: string;
    channelSecret: string;
    signal?: AbortSignal;
  }) {
    const userId = await this.userId(input.signal);
    const r = await this.raw(
      "connectLine",
      "/v1/connect/line/credentials",
      z.object({
        account: z.object({
          accountId: z.string().min(1),
          username: z.string().nullish(),
          displayName: z.string().nullish(),
        }),
        webhook: z.object({ configured: z.boolean() }).nullish().catch(null),
      }),
      {
        method: "POST",
        body: {
          channelId: input.channelId,
          channelSecret: input.channelSecret,
          state: `${userId}-${input.profileId}`,
        },
        signal: input.signal,
      },
    );
    return {
      accountId: r.account.accountId,
      name: r.account.displayName ?? r.account.username ?? "LINE",
      webhookReady: r.webhook?.configured === true,
    };
  }

  async getMailConnectUrl(input: {
    platform: "google" | "microsoft";
    profileId: string;
    redirectUrl: string;
    scopes: readonly ("email" | "calendar" | "files")[];
    signal?: AbortSignal;
  }) {
    return call("getConnectUrl", async (withFetch) => {
      const { data } = await this.zernio.connect.getConnectUrl(
        withFetch({
          signal: input.signal,
          path: { platform: input.platform },
          query: {
            profileId: input.profileId,
            redirect_url: input.redirectUrl,
            scopes: input.scopes.join(","),
          },
        }),
      );
      return { authUrl: parse(connectSchema, data, "getConnectUrl").authUrl };
    });
  }

  async enableSms(input: { numberId: string; signal?: AbortSignal }): Promise<SmsOnNumber> {
    return call("enableSmsOnNumber", async (withFetch) => {
      const { data } = await this.zernio.sms.enableSmsOnNumber(
        withFetch({ signal: input.signal, path: { id: input.numberId } }),
      );
      const r = parse(
        z.object({
          enabled: z.boolean().catch(false),
          id: z.string().nullish(),
          smsCapable: z.boolean().nullish(),
          notReady: z.boolean().nullish(),
          needsRegistration: z.boolean().nullish(),
        }),
        data,
        "enableSmsOnNumber",
      );
      return {
        enabled: r.enabled,
        accountId: r.enabled ? (r.id ?? null) : null,
        notCapable: r.smsCapable === false,
        notReady: r.notReady === true,
        needsRegistration: r.needsRegistration === true,
      };
    });
  }

  async listSmsRegistrations(input: { phoneNumber: string; signal?: AbortSignal }) {
    return call("listSmsRegistrations", async (withFetch) => {
      const { data } = await this.zernio.sms.listSmsRegistrations(
        withFetch({ signal: input.signal }),
      );
      const rows = parse(
        z.object({
          registrations: z
            .array(
              z
                .object({
                  id: z.string().min(1),
                  registrationType: z.enum(["standard_10dlc", "sole_prop_10dlc", "toll_free"]),
                  status: z.enum([
                    "requested",
                    "changes_requested",
                    "pending",
                    "approved",
                    "rejected",
                    "deactivated",
                  ]),
                  declineReason: z.string().nullish(),
                  awaitingOtp: z.boolean().catch(false),
                  phoneNumbers: z.array(z.string()).catch([]),
                })
                .nullable()
                .catch(null),
            )
            .catch([]),
        }),
        data,
        "listSmsRegistrations",
      ).registrations;
      return rows.flatMap((r): SmsRegistration[] =>
        r && r.phoneNumbers.includes(input.phoneNumber)
          ? [
              {
                id: r.id,
                type: r.registrationType,
                status: r.status,
                declineReason: r.declineReason ?? null,
                awaitingOtp: r.awaitingOtp,
                phoneNumbers: [input.phoneNumber],
              },
            ]
          : [],
      );
    });
  }

  async startSmsRegistration(input: { body: Record<string, unknown>; signal?: AbortSignal }) {
    return call("startSmsRegistration", async (withFetch) => {
      const { data } = await this.zernio.sms.startSmsRegistration(
        withFetch({ signal: input.signal, body: input.body as never }),
      );
      const r = parse(
        z.object({
          registrationId: z.string().min(1),
          status: z
            .enum([
              "requested",
              "changes_requested",
              "pending",
              "approved",
              "rejected",
              "deactivated",
            ])
            .catch("pending"),
          awaitingOtp: z.boolean().catch(false),
        }),
        data,
        "startSmsRegistration",
      );
      return { id: r.registrationId, status: r.status, awaitingOtp: r.awaitingOtp };
    });
  }

  async verifySmsRegistrationCode(input: { id: string; code: string; signal?: AbortSignal }) {
    await call("verifySmsRegistrationOtp", async (withFetch) => {
      await this.zernio.sms.verifySmsRegistrationOtp(
        withFetch({ signal: input.signal, path: { id: input.id }, body: { otpPin: input.code } }),
      );
    });
  }

  async resendSmsRegistrationCode(input: { id: string; signal?: AbortSignal }) {
    await call("resendSmsRegistrationOtp", async (withFetch) => {
      await this.zernio.sms.resendSmsRegistrationOtp(
        withFetch({ signal: input.signal, path: { id: input.id } }),
      );
    });
  }

  async listFiles(input: {
    accountId: string;
    folderId?: string;
    q?: string;
    signal?: AbortSignal;
  }) {
    return call("listFiles", async (withFetch) => {
      const { data } = await this.zernio.files.listFiles(
        withFetch({
          signal: input.signal,
          query: {
            accountId: input.accountId,
            limit: 100,
            ...(input.folderId ? { folderId: input.folderId } : {}),
            ...(input.q ? { q: input.q } : {}),
          },
        }),
      );
      return parse(
        z.object({
          data: z
            .array(
              z
                .object({
                  id: z.string().min(1),
                  name: z.string().catch(""),
                  kind: z.enum(["file", "folder"]),
                  mimeType: z.string().nullish(),
                  size: z.number().nullish(),
                })
                .nullable()
                .catch(null),
            )
            .catch([]),
        }),
        data,
        "listFiles",
      ).data.flatMap((f): DriveItem[] =>
        f
          ? [
              {
                id: f.id,
                name: f.name,
                kind: f.kind,
                mimeType: f.mimeType ?? null,
                size: f.size ?? null,
              },
            ]
          : [],
      );
    });
  }

  async copyFileToMedia(input: {
    accountId: string;
    fileId: string;
    maxBytes: number;
    signal?: AbortSignal;
  }) {
    const operation = "downloadFile";
    let res: Response;
    try {
      res = await globalThis.fetch(
        `${this.zernio.baseURL}/v1/files/${encodeURIComponent(input.fileId)}/download?accountId=${encodeURIComponent(input.accountId)}`,
        { headers: { Authorization: `Bearer ${this.zernio.apiKey}` }, signal: input.signal },
      );
    } catch (error) {
      throw toSocialError(error, operation);
    }
    if (!res.ok) {
      const body: unknown = await res.json().catch(() => null);
      const code = z.object({ code: z.string() }).safeParse(body);
      throw new SocialProviderError(`Zernio ${operation} failed (${res.status})`, {
        status: res.status,
        ...(code.success ? { code: code.data.code } : {}),
        ambiguous: false,
      });
    }
    const declared = Number(res.headers.get("Content-Length") ?? "0");
    if (declared > input.maxBytes) {
      await res.body?.cancel().catch(() => undefined);
      throw new SocialProviderError(`Zernio ${operation} failed (413)`, {
        status: 413,
        ambiguous: false,
      });
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength > input.maxBytes) {
      throw new SocialProviderError(`Zernio ${operation} failed (413)`, {
        status: 413,
        ambiguous: false,
      });
    }
    const contentType = (res.headers.get("Content-Type") ?? "application/octet-stream")
      .split(";")[0]
      .trim();
    const disposition = res.headers.get("Content-Disposition") ?? "";
    const name =
      /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1] ??
      /filename="?([^";]+)"?/i.exec(disposition)?.[1] ??
      "file";
    const { publicUrl } = await this.uploadMedia({
      filename: decodeURIComponent(name),
      contentType,
      bytes,
      signal: input.signal,
    });
    return { publicUrl, contentType, name: decodeURIComponent(name), size: bytes.byteLength };
  }

  async getStore(input: { accountId: string; signal?: AbortSignal }) {
    try {
      return await call("getCommerceStore", async (withFetch) => {
        const { data } = await this.zernio.commerce.getCommerceStore(
          withFetch({ signal: input.signal, query: { accountId: input.accountId } }),
        );
        const s = parse(
          z.object({
            store: z.object({
              accountId: z.string().min(1),
              platform: z.enum(["shopify", "woocommerce"]),
              name: z.string().catch(""),
              domain: z.string().catch(""),
              url: z.string().nullish(),
              currency: z.string().catch(""),
              capabilities: z.array(z.string()).catch([]),
            }),
          }),
          data,
          "getCommerceStore",
        ).store;
        return { ...s, url: s.url ?? null };
      });
    } catch (error) {
      if (error instanceof SocialProviderError && error.details.status === 400) return null;
      throw error;
    }
  }

  async listProducts(input: { accountId: string; cursor?: string; signal?: AbortSignal }) {
    return call("listCommerceProducts", async (withFetch) => {
      const { data } = await this.zernio.commerce.listCommerceProducts(
        withFetch({
          signal: input.signal,
          query: {
            accountId: input.accountId,
            limit: 50,
            ...(input.cursor ? { cursor: input.cursor } : {}),
          },
        }),
      );
      const r = parse(
        z.object({
          products: z
            .array(
              z
                .object({
                  id: z.string().min(1),
                  title: z.string().catch(""),
                  status: z.string().catch("active"),
                  url: z.string().nullish(),
                  featuredImage: z.object({ url: z.string().nullish() }).nullish().catch(null),
                  variants: z
                    .array(
                      z
                        .object({
                          id: z.string().min(1),
                          title: z.string().catch(""),
                          price: moneySchema,
                          inventoryQuantity: z.number().nullish(),
                        })
                        .nullable()
                        .catch(null),
                    )
                    .catch([]),
                })
                .nullable()
                .catch(null),
            )
            .catch([]),
          nextCursor: z.string().nullish(),
        }),
        data,
        "listCommerceProducts",
      );
      return {
        products: r.products.flatMap((p): ProductView[] =>
          p
            ? [
                {
                  id: p.id,
                  title: p.title,
                  status: p.status,
                  imageUrl: p.featuredImage?.url ?? null,
                  url: p.url ?? null,
                  variants: p.variants.flatMap((v) =>
                    v
                      ? [
                          {
                            id: v.id,
                            title: v.title,
                            price: v.price ?? null,
                            stock: v.inventoryQuantity ?? null,
                          },
                        ]
                      : [],
                  ),
                },
              ]
            : [],
        ),
        nextCursor: r.nextCursor ?? null,
      };
    });
  }

  async listStockLocations(input: { accountId: string; signal?: AbortSignal }) {
    return call("listCommerceLocations", async (withFetch) => {
      const { data } = await this.zernio.commerce.listCommerceLocations(
        withFetch({ signal: input.signal, query: { accountId: input.accountId } }),
      );
      return parse(
        z.object({
          locations: z
            .array(
              z
                .object({
                  id: z.string().min(1),
                  name: z.string().catch(""),
                  isActive: z.boolean().catch(true),
                })
                .nullable()
                .catch(null),
            )
            .catch([]),
        }),
        data,
        "listCommerceLocations",
      ).locations.flatMap((l) => (l && l.isActive ? [{ id: l.id, name: l.name }] : []));
    });
  }

  async setStock(input: {
    accountId: string;
    productId: string;
    variantId: string;
    locationId: string;
    quantity: number;
    signal?: AbortSignal;
  }) {
    await call("changeCommerceInventory", async (withFetch) => {
      await this.zernio.commerce.changeCommerceInventory(
        withFetch({
          signal: input.signal,
          path: { productId: input.productId },
          body: {
            accountId: input.accountId,
            mode: "set",
            changes: [
              {
                variantId: input.variantId,
                locationId: input.locationId,
                quantity: input.quantity,
              },
            ],
          },
        }),
      );
    });
  }

  async listOrders(input: { accountId: string; cursor?: string; signal?: AbortSignal }) {
    return call("listCommerceOrders", async (withFetch) => {
      const { data } = await this.zernio.commerce.listCommerceOrders(
        withFetch({
          signal: input.signal,
          query: {
            accountId: input.accountId,
            limit: 25,
            ...(input.cursor ? { cursor: input.cursor } : {}),
          },
        }),
      );
      const r = parse(
        z.object({
          orders: z
            .array(
              z
                .object({
                  id: z.string().min(1),
                  number: z.string().catch(""),
                  status: z.string().nullish(),
                  paymentStatus: z.string().nullish(),
                  total: moneySchema,
                  createdAt: z.string().nullish(),
                  customer: z
                    .object({ firstName: z.string().nullish(), lastName: z.string().nullish() })
                    .nullish()
                    .catch(null),
                  lineItems: z
                    .array(
                      z
                        .object({ title: z.string().catch(""), quantity: z.number().catch(1) })
                        .nullable()
                        .catch(null),
                    )
                    .catch([]),
                })
                .nullable()
                .catch(null),
            )
            .catch([]),
          nextCursor: z.string().nullish(),
        }),
        data,
        "listCommerceOrders",
      );
      return {
        orders: r.orders.flatMap((o): OrderView[] => {
          if (!o) return [];
          const name = [o.customer?.firstName, o.customer?.lastName].filter(Boolean).join(" ");
          return [
            {
              id: o.id,
              number: o.number,
              status: o.status ?? null,
              paymentStatus: o.paymentStatus ?? null,
              total: o.total ?? null,
              createdAt: o.createdAt ?? null,
              items: o.lineItems
                .flatMap((l) => (l ? [l.quantity > 1 ? `${l.title} ×${l.quantity}` : l.title] : []))
                .join(", "),
              customerName: name || null,
            },
          ];
        }),
        nextCursor: r.nextCursor ?? null,
      };
    });
  }

  async listBlogs(input: { accountId: string; signal?: AbortSignal }) {
    return call("listBlogs", async (withFetch) => {
      const { data } = await this.zernio.blogs.listBlogs(
        withFetch({
          signal: input.signal,
          path: { accountId: input.accountId },
          query: { limit: 50 },
        }),
      );
      return parse(
        z.object({
          blogs: z
            .array(
              z
                .object({
                  id: z.string().min(1),
                  title: z.string().catch(""),
                  handle: z.string().nullish(),
                })
                .nullable()
                .catch(null),
            )
            .catch([]),
        }),
        data,
        "listBlogs",
      ).blogs.flatMap((b) => (b ? [{ id: b.id, title: b.title, handle: b.handle ?? null }] : []));
    });
  }

  async listBlogArticles(input: {
    accountId: string;
    blogId: string;
    cursor?: string;
    signal?: AbortSignal;
  }) {
    return call("listBlogArticles", async (withFetch) => {
      const { data } = await this.zernio.blogs.listBlogArticles(
        withFetch({
          signal: input.signal,
          path: { accountId: input.accountId, blogId: input.blogId },
          query: { limit: 20, ...(input.cursor ? { cursor: input.cursor } : {}) },
        }),
      );
      const r = parse(
        z.object({
          articles: z.array(blogArticleSchema.nullable().catch(null)).catch([]),
          nextCursor: z.string().nullish(),
        }),
        data,
        "listBlogArticles",
      );
      return {
        articles: r.articles.flatMap((a) => (a ? [blogArticleView(a)] : [])),
        nextCursor: r.nextCursor ?? null,
      };
    });
  }

  async createBlogArticle(input: {
    accountId: string;
    blogId: string;
    body: Record<string, unknown>;
    idempotencyKey: string;
    signal?: AbortSignal;
  }) {
    return call("createBlogArticle", async (withFetch) => {
      const { data } = await this.zernio.blogs.createBlogArticle(
        withFetch({
          signal: input.signal,
          path: { accountId: input.accountId, blogId: input.blogId },
          body: input.body as never,
          headers: { "Idempotency-Key": input.idempotencyKey },
        }),
      );
      return blogArticleView(
        parse(z.object({ article: blogArticleSchema }), data, "createBlogArticle").article,
      );
    });
  }

  async listRcsAgents(input: { profileId: string; signal?: AbortSignal }) {
    return call("listRcsAgents", async (withFetch) => {
      const { data } = await this.zernio.rcs.listRcsAgents(
        withFetch({ signal: input.signal, query: { includeClosed: true } }),
      );
      const record = z.record(z.string(), z.unknown());
      const rows = parse(
        z.object({
          agents: z
            .array(
              z
                .object({
                  id: z.string().min(1),
                  profileId: z.string().nullish(),
                  accountId: z.string().nullish(),
                  country: z.string().nullish(),
                  status: z.enum(RCS_AGENT_STATUSES),
                  displayName: z.string().catch(""),
                  useCase: z.string().nullish(),
                  reviewNote: z.string().nullish(),
                  declineReason: z.string().nullish(),
                  launchRequest: record.nullish().catch(null),
                  profile: record.nullish().catch(null),
                  brand: record.nullish().catch(null),
                  testDevices: z
                    .array(
                      z
                        .object({
                          testDeviceId: z.string().min(1),
                          phoneNumber: z.string().min(1),
                          inviteStatus: z
                            .enum(["PENDING", "ACCEPTED", "DECLINED"])
                            .catch("PENDING"),
                        })
                        .nullable()
                        .catch(null),
                    )
                    .catch([]),
                })
                .nullable()
                .catch(null),
            )
            .catch([]),
        }),
        data,
        "listRcsAgents",
      ).agents;
      return rows.flatMap((a): RcsAgentView[] =>
        a && a.profileId === input.profileId
          ? [
              {
                id: a.id,
                status: a.status,
                country: a.country ?? null,
                displayName: a.displayName,
                useCase: a.useCase ?? null,
                accountId: a.accountId ?? null,
                reviewNote: a.reviewNote ?? null,
                declineReason: a.declineReason ?? null,
                launchSent: !!a.launchRequest,
                testDevices: a.testDevices.flatMap((d) =>
                  d
                    ? [
                        {
                          id: d.testDeviceId,
                          phoneNumber: d.phoneNumber,
                          inviteStatus: d.inviteStatus,
                        },
                      ]
                    : [],
                ),
                filed: { brand: a.brand ?? null, profile: a.profile ?? null },
              },
            ]
          : [],
      );
    });
  }

  async requestRcsAgent(input: {
    body: Record<string, unknown>;
    idempotencyKey: string;
    signal?: AbortSignal;
  }) {
    return call("createRcsAgent", async (withFetch) => {
      const { data } = await this.zernio.rcs.createRcsAgent(
        withFetch({
          signal: input.signal,
          body: input.body as never,
          headers: { "Idempotency-Key": input.idempotencyKey },
        }),
      );
      const a = parse(
        z.object({
          agent: z.object({
            id: z.string().min(1),
            status: z.enum(RCS_AGENT_STATUSES).catch("requested"),
          }),
        }),
        data,
        "createRcsAgent",
      ).agent;
      return { id: a.id, status: a.status };
    });
  }

  async updateRcsAgent(input: {
    agentId: string;
    body: Record<string, unknown>;
    signal?: AbortSignal;
  }) {
    await call("updateRcsAgent", async (withFetch) => {
      await this.zernio.rcs.updateRcsAgent(
        withFetch({
          signal: input.signal,
          path: { agentId: input.agentId },
          body: input.body as never,
        }),
      );
    });
  }

  async uploadRcsAsset(input: { file: Blob; kind: "logo" | "banner"; signal?: AbortSignal }) {
    return call("uploadRcsAsset", async (withFetch) => {
      const { data } = await this.zernio.rcs.uploadRcsAsset(
        withFetch({ signal: input.signal, body: { file: input.file, kind: input.kind } }),
      );
      return { url: parse(z.object({ url: z.url() }), data, "uploadRcsAsset").url };
    });
  }

  async addRcsTestDevice(input: { agentId: string; phoneNumber: string; signal?: AbortSignal }) {
    await call("addRcsTestDevice", async (withFetch) => {
      await this.zernio.rcs.addRcsTestDevice(
        withFetch({
          signal: input.signal,
          path: { agentId: input.agentId },
          body: { phoneNumber: input.phoneNumber },
        }),
      );
    });
  }

  async removeRcsTestDevice(input: {
    agentId: string;
    testDeviceId: string;
    signal?: AbortSignal;
  }) {
    await call("removeRcsTestDevice", async (withFetch) => {
      await this.zernio.rcs.removeRcsTestDevice(
        withFetch({
          signal: input.signal,
          path: { agentId: input.agentId, testDeviceId: input.testDeviceId },
        }),
      );
    });
  }

  async requestRcsLaunch(input: {
    agentId: string;
    body: Record<string, unknown>;
    signal?: AbortSignal;
  }) {
    await call("requestRcsAgentLaunch", async (withFetch) => {
      await this.zernio.rcs.requestRcsAgentLaunch(
        withFetch({
          signal: input.signal,
          path: { agentId: input.agentId },
          body: input.body as never,
        }),
      );
    });
  }

  async listImessageSenders(input: { profileId: string; signal?: AbortSignal }) {
    return call("listImessageSenderOrders", async (withFetch) => {
      const { data } = await this.zernio.imessage.listImessageSenderOrders(
        withFetch({ signal: input.signal }),
      );
      const rows = parse(
        z.object({
          senders: z
            .array(
              z
                .object({
                  id: z.string().min(1),
                  profileId: z.string().nullish(),
                  status: z.enum(IMESSAGE_SENDER_STATUSES),
                  region: z.enum(["US", "GB"]).nullish().catch(null),
                  handle: z.string().nullish(),
                  optInLink: z.string().nullish(),
                  priceCents: z.number().nullish(),
                  displayName: z.string().nullish(),
                  failureReason: z.string().nullish(),
                  accountId: z.string().nullish(),
                })
                .nullable()
                .catch(null),
            )
            .catch([]),
        }),
        data,
        "listImessageSenderOrders",
      ).senders;
      return rows.flatMap((s): ImessageSenderView[] =>
        s && s.profileId === input.profileId && s.status !== "canceled"
          ? [
              {
                id: s.id,
                status: s.status,
                region: s.region ?? null,
                handle: s.handle ?? null,
                // Only the app link: the provider's hosted page would show its name.
                optInLink: s.optInLink?.startsWith("imessage:") ? s.optInLink : null,
                priceCents: s.priceCents ?? null,
                displayName: s.displayName ?? null,
                failureReason: s.failureReason ?? null,
                accountId: s.accountId ?? null,
              },
            ]
          : [],
      );
    });
  }

  async listImessageNumbers(input: { region: "US" | "GB"; signal?: AbortSignal }) {
    return call("listImessageAvailableNumbers", async (withFetch) => {
      const { data } = await this.zernio.imessage.listImessageAvailableNumbers(
        withFetch({ signal: input.signal, query: { region: input.region } }),
      );
      return parse(
        z.object({
          numbers: z
            .array(
              z
                .object({
                  id: z.string().min(1),
                  phone: z.string().min(1),
                  location: z.string().nullish(),
                })
                .nullable()
                .catch(null),
            )
            .catch([]),
        }),
        data,
        "listImessageAvailableNumbers",
      ).numbers.flatMap((n) =>
        n ? [{ id: n.id, phone: n.phone, location: n.location ?? null }] : [],
      );
    });
  }

  async orderImessageSender(input: {
    profileId: string;
    region: "US" | "GB";
    availableNumberId?: string;
    zipCode?: string;
    displayName: string;
    contact: { firstName: string; lastName?: string };
    purchaseIntentId: string;
    signal?: AbortSignal;
  }): Promise<ImessageOrderResult> {
    try {
      return await call("orderImessageSender", async (withFetch) => {
        const { data } = await this.zernio.imessage.orderImessageSender(
          withFetch({
            signal: input.signal,
            body: {
              profileId: input.profileId,
              kind: "phone",
              region: input.region,
              ...(input.availableNumberId ? { availableNumberId: input.availableNumberId } : {}),
              ...(input.zipCode ? { zipCode: input.zipCode } : {}),
              displayName: input.displayName,
              contact: input.contact,
              purchaseIntentId: input.purchaseIntentId,
            },
          }),
        );
        const s = parse(
          z.object({
            sender: z.object({
              id: z.string().min(1),
              status: z.enum(IMESSAGE_SENDER_STATUSES).catch("ordering"),
            }),
          }),
          data,
          "orderImessageSender",
        ).sender;
        return { kind: "ordered" as const, id: s.id, status: s.status };
      });
    } catch (error) {
      const status = error instanceof SocialProviderError ? error.details.status : undefined;
      if (status === 402 || status === 422) return { kind: "billing" };
      if (status === 502) return { kind: "refused" };
      throw error;
    }
  }

  async updateImessageSender(input: {
    senderId: string;
    displayName: string;
    contact: { firstName: string; lastName?: string };
    signal?: AbortSignal;
  }) {
    await call("updateImessageSender", async (withFetch) => {
      await this.zernio.imessage.updateImessageSender(
        withFetch({
          signal: input.signal,
          path: { senderId: input.senderId },
          body: { displayName: input.displayName, contact: input.contact },
        }),
      );
    });
  }

  async cancelImessageSender(input: { senderId: string; signal?: AbortSignal }) {
    await call("cancelImessageSender", async (withFetch) => {
      await this.zernio.imessage.cancelImessageSender(
        withFetch({ signal: input.signal, path: { senderId: input.senderId } }),
      );
    });
  }

  async setVoice(input: {
    numberId: string;
    settings: Partial<{
      forwardTo: string;
      voicemailGreeting: string;
      businessHoursEnabled: boolean;
      businessHoursTimezone: string;
      businessHours: { day: number; open: string; close: string }[];
    }>;
    signal?: AbortSignal;
  }): Promise<VoiceSettings> {
    return call("enableVoiceOnNumber", async (withFetch) => {
      const { data } = await this.zernio.voice.enableVoiceOnNumber(
        withFetch({
          signal: input.signal,
          path: { id: input.numberId },
          body: { ...input.settings, recordingEnabled: false },
        }),
      );
      const r = parse(
        z.object({
          enabled: z.boolean().catch(false),
          pstnForwardTo: z.string().nullish(),
          voicemailGreeting: z.string().nullish(),
          businessHoursEnabled: z.boolean().catch(false),
          businessHoursTimezone: z.string().nullish(),
          businessHours: z
            .array(z.object({ day: z.number().int(), open: z.string(), close: z.string() }))
            .catch([]),
        }),
        data,
        "enableVoiceOnNumber",
      );
      return {
        enabled: r.enabled,
        forwardTo: r.pstnForwardTo || null,
        voicemailGreeting: r.voicemailGreeting || null,
        businessHoursEnabled: r.businessHoursEnabled,
        businessHoursTimezone: r.businessHoursTimezone ?? null,
        businessHours: r.businessHours,
      };
    });
  }

  async getCallRecordingUrl(input: { callId: string; signal?: AbortSignal }) {
    try {
      return await call("getCallRecording", async (withFetch) => {
        const { data } = await this.zernio.calls.getCallRecording(
          withFetch({ signal: input.signal, path: { id: input.callId }, query: { as: "json" } }),
        );
        return parse(z.object({ url: z.url() }), data, "getCallRecording").url;
      });
    } catch (error) {
      // No recording (a missed call with no voicemail): nothing to play.
      if (error instanceof SocialProviderError && error.details.status === 404) return null;
      throw error;
    }
  }

  async listPhoneCountries(input?: { signal?: AbortSignal }): Promise<PhoneCountry[]> {
    return call("listPhoneNumberCountries", async (withFetch) => {
      const { data } = await this.zernio.phonenumbers.listPhoneNumberCountries(
        withFetch({ signal: input?.signal }),
      );
      const typeSchema = z.object({
        numberType: z.enum(["local", "mobile", "national", "toll_free"]),
        monthlyCents: z.number(),
        needsKyc: z.boolean().catch(true),
        callsAvailable: z.boolean().catch(false),
        smsAvailable: z.boolean().catch(false),
        inStock: z.boolean().catch(false),
        fulfilment: z.string().nullish(),
      });
      const countries = parse(
        z.object({
          countries: z
            .array(
              z.object({
                code: z.string().length(2),
                types: z.array(typeSchema.nullable().catch(null)).catch([]),
              }),
            )
            .catch([]),
        }),
        data,
        "listPhoneNumberCountries",
      ).countries;
      return countries.map((c) => ({
        code: c.code,
        types: c.types.flatMap((t) =>
          t
            ? [
                {
                  numberType: t.numberType,
                  monthlyCents: t.monthlyCents,
                  needsKyc: t.needsKyc,
                  callsAvailable: t.callsAvailable,
                  smsAvailable: t.smsAvailable,
                  inStock: t.inStock,
                  instant: t.fulfilment !== "request",
                },
              ]
            : [],
        ),
      }));
    });
  }

  async searchPhoneNumbers(input: {
    country: string;
    numberType: PhoneNumberType;
    areaCode?: string;
    signal?: AbortSignal;
  }) {
    return call("searchAvailablePhoneNumbers", async (withFetch) => {
      const { data } = await this.zernio.phonenumbers.searchAvailablePhoneNumbers(
        withFetch({
          signal: input.signal,
          query: {
            country: input.country,
            numberType: input.numberType,
            limit: 10,
            ...(input.areaCode ? { areaCode: input.areaCode } : {}),
          },
        }),
      );
      const numbers = parse(
        z.object({
          numbers: z
            .array(
              z.object({
                phoneNumber: z.string().min(4),
                features: z.array(z.string()).catch([]),
                locality: z.string().nullish(),
                bestEffort: z.boolean().nullish(),
              }),
            )
            .catch([]),
        }),
        data,
        "searchAvailablePhoneNumbers",
      ).numbers;
      return numbers
        .filter((n) => !n.bestEffort)
        .map((n) => ({
          phoneNumber: n.phoneNumber,
          locality: n.locality ?? null,
          features: n.features,
        }));
    });
  }

  async purchasePhoneNumber(input: {
    profileId: string;
    country: string;
    numberType: PhoneNumberType;
    phoneNumber: string;
    wantsSms: boolean;
    purchaseIntentId: string;
    signal?: AbortSignal;
  }): Promise<PurchaseResult> {
    return call("purchasePhoneNumber", async (withFetch) => {
      const { data } = await this.zernio.phonenumbers.purchasePhoneNumber(
        withFetch({
          signal: input.signal,
          body: {
            profileId: input.profileId,
            country: input.country,
            numberType: input.numberType,
            phoneNumber: input.phoneNumber,
            wantsSms: input.wantsSms,
            connectWhatsapp: false,
            purchaseIntentId: input.purchaseIntentId,
          },
        }),
      );
      const r = parse(
        z.object({
          status: z.string().nullish(),
          checkoutUrl: z.string().nullish(),
          numberId: z.string().nullish(),
          phoneNumber: z
            .union([
              z.string(),
              z.object({
                id: z.string(),
                phoneNumber: z.string(),
                profileId: z.string().nullish(),
              }),
            ])
            .nullish(),
          profileId: z.string().nullish(),
        }),
        data,
        "purchasePhoneNumber",
      );
      if (r.status === "kyc_required") return { kind: "needs_id" };
      if (r.checkoutUrl) return { kind: "needs_payment" };
      if (r.phoneNumber && typeof r.phoneNumber === "object") {
        return {
          kind: "bought",
          id: r.phoneNumber.id,
          phoneNumber: r.phoneNumber.phoneNumber,
          profileId: r.phoneNumber.profileId ?? null,
        };
      }
      if (r.status === "already_purchased" && r.numberId && typeof r.phoneNumber === "string") {
        return {
          kind: "bought",
          id: r.numberId,
          phoneNumber: r.phoneNumber,
          profileId: r.profileId ?? null,
        };
      }
      throw new SocialProviderError("Zernio purchasePhoneNumber: unexpected response shape", {
        ambiguous: true,
      });
    });
  }

  async listOwnedNumbers(input: { profileId: string; signal?: AbortSignal }) {
    return call("listPhoneNumbers", async (withFetch) => {
      const { data } = await this.zernio.phonenumbers.listPhoneNumbers(
        withFetch({ signal: input.signal, query: { profileId: input.profileId } }),
      );
      const numbers = parse(
        z.object({
          numbers: z
            .array(
              z
                .object({
                  _id: z.string().min(1),
                  phoneNumber: z.string().min(1),
                  country: z.string().catch(""),
                  numberType: z.string().nullish(),
                  status: z.string(),
                  monthlyCents: z.number().nullish(),
                })
                .nullable()
                .catch(null),
            )
            .catch([]),
        }),
        data,
        "listPhoneNumbers",
      ).numbers;
      return numbers.flatMap((n): OwnedNumber[] =>
        n && n.status !== "released" && n.status !== "releasing"
          ? [
              {
                id: n._id,
                phoneNumber: n.phoneNumber,
                country: n.country,
                numberType: n.numberType ?? null,
                status: n.status,
                monthlyCents: n.monthlyCents ?? null,
              },
            ]
          : [],
      );
    });
  }

  async releasePhoneNumber(input: { id: string; signal?: AbortSignal }) {
    await call("releasePhoneNumber", async (withFetch) => {
      await this.zernio.phonenumbers.releasePhoneNumber(
        withFetch({ signal: input.signal, path: { id: input.id } }),
      );
    });
  }

  async listCalendarEvents(input: {
    accountId: string;
    from: string;
    to: string;
    signal?: AbortSignal;
  }): Promise<CalendarEventSummary[]> {
    return call("listCalendarEvents", async (withFetch) => {
      const { data } = await this.zernio.calendar.listCalendarEvents(
        withFetch({
          signal: input.signal,
          query: {
            accountId: input.accountId,
            from: input.from,
            to: input.to,
            limit: 100,
            sortOrder: "asc",
          },
        }),
      );
      const rows = parse(
        z.object({
          data: z
            .array(
              z
                .object({
                  id: z.string().min(1),
                  title: z.string().nullish(),
                  start: z.string().min(1),
                  end: z.string().min(1),
                  allDay: z.boolean().catch(false),
                  busy: z.boolean().nullish().catch(null),
                  status: z.string().nullish().catch(null),
                })
                .nullable()
                .catch(null),
            )
            .catch([]),
        }),
        data,
        "listCalendarEvents",
      ).data;
      return rows.flatMap((e): CalendarEventSummary[] =>
        e && e.status !== "cancelled"
          ? [
              {
                id: e.id,
                title: e.title ?? "Busy",
                start: e.start,
                end: e.end,
                allDay: e.allDay,
                busy: e.busy !== false,
              },
            ]
          : [],
      );
    });
  }

  async createCalendarEvent(input: {
    accountId: string;
    title: string;
    start: string;
    end: string;
    description?: string;
    signal?: AbortSignal;
  }) {
    return call("createCalendarEvent", async (withFetch) => {
      const { data } = await this.zernio.calendar.createCalendarEvent(
        withFetch({
          signal: input.signal,
          body: {
            accountId: input.accountId,
            title: input.title,
            start: input.start,
            end: input.end,
            ...(input.description ? { description: input.description } : {}),
          } as never,
        }),
      );
      return {
        id: parse(
          z.object({ data: z.object({ id: z.string().min(1) }) }),
          data,
          "createCalendarEvent",
        ).data.id,
      };
    });
  }

  async listIntegrations(input: {
    profileId: string;
    platforms: readonly string[];
    signal?: AbortSignal;
  }) {
    return call("listIntegrations", async (withFetch) => {
      const { data } = await this.zernio.accounts.listAccounts(
        withFetch({ signal: input.signal, query: { profileId: input.profileId, limit: 100 } }),
      );
      const accounts = parse(
        z.object({
          accounts: z
            .array(
              z.object({
                _id: z.string().min(1),
                platform: z.string(),
                username: z.string().nullish(),
                displayName: z.string().nullish(),
                isActive: z.boolean().catch(false),
              }),
            )
            .catch([]),
        }),
        data,
        "listIntegrations",
      ).accounts;
      return accounts
        .filter((a) => input.platforms.includes(a.platform))
        .map((a): Integration => ({
          id: a._id,
          platform: a.platform,
          name: a.displayName ?? a.username ?? a.platform,
          active: a.isActive,
        }));
    });
  }

  async connectSiteWithKeys(input: { profileId: string; keys: SiteKeys; signal?: AbortSignal }) {
    const accountSchema = z.object({
      account: z.object({
        _id: z.string().min(1),
        username: z.string().nullish(),
        displayName: z.string().nullish(),
      }),
    });
    const k = input.keys;
    return call(`connect_${k.kind}`, async (withFetch) => {
      const { data } =
        k.kind === "shopify"
          ? await this.zernio.connect.connectShopifyWithToken(
              withFetch({
                signal: input.signal,
                body: { profileId: input.profileId, shop: k.shop, accessToken: k.accessToken },
              }),
            )
          : k.kind === "wordpress"
            ? await this.zernio.connect.connectWordPressWithApplicationPassword(
                withFetch({
                  signal: input.signal,
                  body: {
                    profileId: input.profileId,
                    siteUrl: k.siteUrl,
                    username: k.username,
                    applicationPassword: k.applicationPassword,
                  },
                }),
              )
            : await this.zernio.connect.connectWebflowWithSiteToken(
                withFetch({
                  signal: input.signal,
                  body: { profileId: input.profileId, siteToken: k.siteToken },
                }),
              );
      const a = parse(accountSchema, data, `connect_${k.kind}`).account;
      return { accountId: a._id, name: a.displayName ?? a.username ?? k.kind };
    });
  }

  async connectWhatsAppWithKeys(input: {
    profileId: string;
    accessToken: string;
    wabaId: string;
    phoneNumberId: string;
    pin?: string;
    signal?: AbortSignal;
  }) {
    return call("connectWhatsAppCredentials", async (withFetch) => {
      const { data } = await this.zernio.connect.connectWhatsAppCredentials(
        withFetch({
          signal: input.signal,
          body: {
            profileId: input.profileId,
            accessToken: input.accessToken,
            wabaId: input.wabaId,
            phoneNumberId: input.phoneNumberId,
            ...(input.pin ? { pin: input.pin } : {}),
          },
        }),
      );
      const a = parse(
        z.object({
          account: z.object({
            accountId: z.string().min(1),
            username: z.string().nullish(),
            phoneNumber: z.string().nullish(),
          }),
        }),
        data,
        "connectWhatsAppCredentials",
      ).account;
      return { accountId: a.accountId, username: a.username ?? a.phoneNumber ?? "WhatsApp" };
    });
  }

  async connectMetaAds(input: {
    profileId: string;
    facebookAccountId: string;
    redirectUrl: string;
    signal?: AbortSignal;
  }) {
    return call("connectAds", async (withFetch) => {
      const { data } = await this.zernio.connect.connectAds(
        withFetch({
          signal: input.signal,
          path: { platform: "facebook" },
          query: {
            profileId: input.profileId,
            accountId: input.facebookAccountId,
            loginMode: "classic",
            redirect_url: input.redirectUrl,
          },
        }),
      );
      const r = parse(
        z.object({ accountId: z.string().nullish(), authUrl: z.url().nullish() }),
        data,
        "connectAds",
      );
      if (r.authUrl) return { authUrl: r.authUrl };
      if (r.accountId) return { connectionId: r.accountId };
      throw new SocialProviderError("Zernio connectAds: neither a connection nor a link", {
        ambiguous: false,
      });
    });
  }

  async connectSameTokenAds(input: {
    profileId: string;
    platform: "linkedin" | "pinterest";
    postingAccountId: string;
    redirectUrl: string;
    signal?: AbortSignal;
  }) {
    try {
      return await call("connectAds", async (withFetch) => {
        const { data } = await this.zernio.connect.connectAds(
          withFetch({
            signal: input.signal,
            path: { platform: input.platform },
            query: {
              profileId: input.profileId,
              accountId: input.postingAccountId,
              redirect_url: input.redirectUrl,
            },
          }),
        );
        const r = parse(
          z.object({ accountId: z.string().nullish(), authUrl: z.url().nullish() }),
          data,
          "connectAds",
        );
        // An authUrl means a full sign-in on the partner's app: the owner reconnects the
        // posting account through our own connect flow instead.
        if (r.accountId && !r.authUrl) return { connectionId: r.accountId };
        return { needsReconnect: true as const };
      });
    } catch (error) {
      // 400 reconnect_required: the posting account's token can't reach ad accounts.
      if (error instanceof SocialProviderError && error.details.status === 400) {
        return { needsReconnect: true as const };
      }
      throw error;
    }
  }

  async getMessageAttachmentUrl(input: {
    accountId: string;
    conversationId: string;
    platformMessageId: string;
    index: number;
    signal?: AbortSignal;
  }) {
    return call("getMessageAttachment", async (withFetch) => {
      const { data } = await this.zernio.messages.getMessageAttachment(
        withFetch({
          signal: input.signal,
          path: {
            conversationId: input.conversationId,
            messageId: input.platformMessageId,
            index: input.index,
          },
          query: { accountId: input.accountId, format: "json" },
        }),
      );
      const r = parse(z.object({ url: z.url().nullish() }), data, "getMessageAttachment");
      return r.url ?? null;
    });
  }

  async connectOpenAiAds(input: { profileId: string; apiKey: string; signal?: AbortSignal }) {
    return call("connectOpenAIAdsCredentials", async (withFetch) => {
      const { data } = await this.zernio.connect.connectOpenAIAdsCredentials(
        withFetch({
          signal: input.signal,
          body: { apiKey: input.apiKey, profileId: input.profileId },
        }),
      );
      const r = parse(
        z.object({ accountId: z.string().min(1), adAccountName: z.string().nullish() }),
        data,
        "connectOpenAIAdsCredentials",
      );
      return { connectionId: r.accountId, name: r.adAccountName ?? "ChatGPT ads" };
    });
  }

  async createAd(input: { body: Record<string, unknown>; signal?: AbortSignal }) {
    return call("createStandaloneAd", async (withFetch) => {
      const { data } = await this.zernio.adcampaigns.createStandaloneAd(
        withFetch({ signal: input.signal, body: input.body as never }),
      );
      const ad = parse(
        z.object({ ad: z.object({ _id: z.string().min(1), status: adCampaignStatusSchema }) }),
        data,
        "createStandaloneAd",
      ).ad;
      return { id: ad._id, status: ad.status };
    });
  }

  async setAdCampaignBudget(input: {
    campaignId: string;
    platform: string;
    amount: number;
    type: "daily";
    signal?: AbortSignal;
  }) {
    await call("updateAdCampaign", async (withFetch) => {
      await this.zernio.adcampaigns.updateAdCampaign(
        withFetch({
          signal: input.signal,
          path: { campaignId: input.campaignId },
          body: {
            platform: input.platform as never,
            budget: { amount: input.amount, type: input.type },
          },
        } as never),
      );
    });
  }

  async listAdConnections(input: { profileId: string; signal?: AbortSignal }) {
    return call("listAdConnections", async (withFetch) => {
      const { data } = await this.zernio.accounts.listAccounts(
        withFetch({ signal: input.signal, query: { profileId: input.profileId, category: "ads" } }),
      );
      const accounts = parse(
        z.object({
          accounts: z
            .array(
              z.object({
                _id: z.string().min(1),
                platform: z.string(),
                username: z.string().nullish(),
                displayName: z.string().nullish(),
                parentAccountId: z.string().nullish(),
                isActive: z.boolean().catch(false),
              }),
            )
            .catch([]),
        }),
        data,
        "listAdConnections",
      ).accounts;
      return accounts.map((a): AdConnection => ({
        id: a._id,
        platform: a.platform,
        name: a.displayName ?? a.username ?? a.platform,
        parentAccountId: a.parentAccountId ?? null,
        active: a.isActive,
      }));
    });
  }

  async listAdAccounts(input: { connectionId: string; signal?: AbortSignal }) {
    return call("listAdAccounts", async (withFetch) => {
      const { data } = await this.zernio.adaccounts.listAdAccounts(
        withFetch({ signal: input.signal, query: { accountId: input.connectionId } }),
      );
      const accounts = parse(
        z.object({
          accounts: z
            .array(
              z.object({
                id: z.string().min(1),
                name: z.string().nullish(),
                currency: z.string().nullish(),
                minimumDailyBudget: z.number().nullish(),
                billingStatus: z.enum(["ok", "missing", "unknown"]).nullish().catch(null),
                selectable: z.boolean().nullish(),
              }),
            )
            .catch([]),
        }),
        data,
        "listAdAccounts",
      ).accounts;
      return accounts.map((a): AdAccount => ({
        id: a.id,
        name: a.name ?? a.id,
        currency: a.currency ?? "USD",
        minDailyBudget: a.minimumDailyBudget ?? null,
        billing: a.billingStatus ?? "unknown",
        usable: a.selectable !== false,
      }));
    });
  }

  async boostPost(input: {
    body: Record<string, unknown>;
    idempotencyKey: string;
    signal?: AbortSignal;
  }) {
    return call("boostPost", async (withFetch) => {
      const { data } = await this.zernio.adcampaigns.boostPost(
        withFetch({
          signal: input.signal,
          body: input.body as never,
          headers: { "Idempotency-Key": input.idempotencyKey },
        }),
      );
      const ad = parse(
        z.object({ ad: z.object({ _id: z.string().min(1), status: adCampaignStatusSchema }) }),
        data,
        "boostPost",
      ).ad;
      return { id: ad._id, status: ad.status };
    });
  }

  async listAdCampaigns(input: { connectionId: string; signal?: AbortSignal }) {
    return call("listAdCampaigns", async (withFetch) => {
      const { data } = await this.zernio.adcampaigns.listAdCampaigns(
        withFetch({ signal: input.signal, query: { accountId: input.connectionId, limit: 50 } }),
      );
      return parse(adCampaignsSchema, data, "listAdCampaigns").campaigns.flatMap(
        (c): AdCampaignSummary[] =>
          c
            ? [
                {
                  id: c.platformCampaignId,
                  platform: c.platform,
                  name: c.campaignName ?? "Ad",
                  status: c.status,
                  budget: c.budget ?? null,
                  currency: c.currency ?? null,
                  spend: c.metrics?.spend ?? 0,
                  reach: c.metrics?.reach ?? 0,
                  clicks: c.metrics?.clicks ?? 0,
                },
              ]
            : [],
      );
    });
  }

  async setAdCampaignStatus(input: {
    campaignId: string;
    platform: string;
    status: "active" | "paused";
    signal?: AbortSignal;
  }) {
    await call("updateAdCampaignStatus", async (withFetch) => {
      await this.zernio.adcampaigns.updateAdCampaignStatus(
        withFetch({
          signal: input.signal,
          path: { campaignId: input.campaignId },
          body: { status: input.status, platform: input.platform as never },
        }),
      );
    });
  }

  async listAdRules(input: { connectionId: string; signal?: AbortSignal }) {
    return call("listAdRules", async (withFetch) => {
      const { data } = await this.zernio.adrules.listAdRules(
        withFetch({ signal: input.signal, query: { accountId: input.connectionId, limit: 50 } }),
      );
      return parse(
        z.object({
          rules: z
            .array(
              z.object({
                id: z.string().min(1),
                name: z.string(),
                adAccountId: z.string(),
                enabled: z.boolean(),
              }),
            )
            .catch([]),
        }),
        data,
        "listAdRules",
      ).rules.map((r): AdRuleSummary => ({ ...r }));
    });
  }

  async createAdRule(input: { body: Record<string, unknown>; signal?: AbortSignal }) {
    return call("createAdRule", async (withFetch) => {
      const { data } = await this.zernio.adrules.createAdRule(
        withFetch({ signal: input.signal, body: input.body as never }),
      );
      return {
        id: parse(z.object({ rule: z.object({ id: z.string().min(1) }) }), data, "createAdRule")
          .rule.id,
      };
    });
  }

  async setAdRuleEnabled(input: { id: string; enabled: boolean; signal?: AbortSignal }) {
    await call("updateAdRule", async (withFetch) => {
      await this.zernio.adrules.updateAdRule(
        withFetch({
          signal: input.signal,
          path: { ruleId: input.id },
          body: { enabled: input.enabled },
        }),
      );
    });
  }

  async deleteAdRule(input: { id: string; signal?: AbortSignal }) {
    await call("deleteAdRule", async (withFetch) => {
      await this.zernio.adrules.deleteAdRule(
        withFetch({ signal: input.signal, path: { ruleId: input.id } }),
      );
    });
  }

  async listLeadForms(input: { accountId: string; signal?: AbortSignal }): Promise<LeadForm[]> {
    return call("listLeadForms", async (withFetch) => {
      const { data } = await this.zernio.leadgen.listLeadForms(
        withFetch({ signal: input.signal, query: { accountId: input.accountId, limit: 50 } }),
      );
      const forms = parse(
        z.object({ forms: z.array(z.record(z.string(), z.unknown())).catch([]) }),
        data,
        "listLeadForms",
      ).forms;
      return forms.flatMap((f): LeadForm[] => {
        const id = typeof f.id === "string" ? f.id : null;
        if (!id) return [];
        return [
          {
            id,
            name: typeof f.name === "string" ? f.name : "Lead form",
            status: typeof f.status === "string" ? f.status.toLowerCase() : "active",
          },
        ];
      });
    });
  }

  async createLeadForm(input: { body: Record<string, unknown>; signal?: AbortSignal }) {
    return call("createLeadForm", async (withFetch) => {
      const { data } = await this.zernio.leadgen.createLeadForm(
        withFetch({ signal: input.signal, body: input.body as never }),
      );
      return {
        id: parse(z.object({ form: z.object({ id: z.string().min(1) }) }), data, "createLeadForm")
          .form.id,
      };
    });
  }

  async listAdLeads(input: { accountIds: string[]; status?: AdLeadStatus; signal?: AbortSignal }) {
    return call("listLeads", async (withFetch) => {
      const { data } = await this.zernio.leadgen.listLeads(
        withFetch({
          signal: input.signal,
          query: {
            accountIds: input.accountIds.join(","),
            platform: "meta",
            limit: 100,
            ...(input.status ? { status: input.status } : {}),
          },
        }),
      );
      return parse(adLeadsSchema, data, "listLeads").leads.flatMap((l): AdLead[] =>
        l
          ? [
              {
                id: l.id,
                formName: l.formName ?? "Lead form",
                createdAt: l.createdTime ?? null,
                fields: l.fields,
                consents: l.consents ?? [],
                status: l.status,
                contactId: l.contactId ?? null,
              },
            ]
          : [],
      );
    });
  }

  async updateAdLeadStatus(input: { id: string; status: AdLeadStatus; signal?: AbortSignal }) {
    await call("updateLead", async (withFetch) => {
      await this.zernio.leadgen.updateLead(
        withFetch({ signal: input.signal, path: { id: input.id }, body: { status: input.status } }),
      );
    });
  }

  async listBroadcasts(input: { profileId: string; signal?: AbortSignal }): Promise<Broadcast[]> {
    return call("listBroadcasts", async (withFetch) => {
      const { data } = await this.zernio.broadcasts.listBroadcasts(
        withFetch({ signal: input.signal, query: { profileId: input.profileId, limit: 50 } }),
      );
      return parse(broadcastsSchema, data, "listBroadcasts").broadcasts.flatMap((b): Broadcast[] =>
        b
          ? [
              {
                id: b.id,
                name: b.name,
                platform: b.platform,
                status: b.status,
                preview: b.messagePreview,
                scheduledAt: b.scheduledAt ?? null,
                completedAt: b.completedAt ?? null,
                recipients: b.recipientCount,
                sent: b.sentCount,
                delivered: b.deliveredCount,
                read: b.readCount,
                failed: b.failedCount,
              },
            ]
          : [],
      );
    });
  }

  async createWhatsAppBroadcast(input: {
    profileId: string;
    accountId: string;
    name: string;
    template: { name: string; language: string; nameVariable: boolean };
    tag: string | null;
    signal?: AbortSignal;
  }): Promise<{ id: string; recipients: number }> {
    const { id } = await call("createBroadcast", async (withFetch) => {
      const { data } = await this.zernio.broadcasts.createBroadcast(
        withFetch({
          signal: input.signal,
          body: {
            profileId: input.profileId,
            accountId: input.accountId,
            platform: "whatsapp",
            name: input.name,
            template: {
              name: input.template.name,
              language: input.template.language,
              ...(input.template.nameVariable
                ? { variableMapping: { "1": { field: "name" } } }
                : {}),
            },
            // Only people who agreed to messages, ever.
            segmentFilters: { isSubscribed: true, ...(input.tag ? { tags: [input.tag] } : {}) },
          },
        }),
      );
      return parse(
        z.object({ broadcast: z.object({ id: z.string().min(1) }) }),
        data,
        "createBroadcast",
      ).broadcast;
    });
    const added = await call("addBroadcastRecipients", async (withFetch) => {
      const { data } = await this.zernio.broadcasts.addBroadcastRecipients(
        withFetch({ signal: input.signal, path: { broadcastId: id }, body: { useSegment: true } }),
      );
      return parse(z.object({ added: z.number().catch(0) }), data, "addBroadcastRecipients").added;
    });
    return { id, recipients: added };
  }

  async startBroadcast(input: { id: string; at: string | null; signal?: AbortSignal }) {
    await call(input.at ? "scheduleBroadcast" : "sendBroadcast", async (withFetch) => {
      if (input.at) {
        await this.zernio.broadcasts.scheduleBroadcast(
          withFetch({
            signal: input.signal,
            path: { broadcastId: input.id },
            body: { scheduledAt: input.at },
          }),
        );
      } else {
        await this.zernio.broadcasts.sendBroadcast(
          withFetch({ signal: input.signal, path: { broadcastId: input.id } }),
        );
      }
    });
  }

  async cancelBroadcast(input: { id: string; signal?: AbortSignal }) {
    await call("cancelBroadcast", async (withFetch) => {
      await this.zernio.broadcasts.cancelBroadcast(
        withFetch({ signal: input.signal, path: { broadcastId: input.id } }),
      );
    });
  }

  async listContacts(input: {
    profileId: string;
    search?: string;
    tag?: string;
    skip?: number;
    signal?: AbortSignal;
  }): Promise<{ contacts: Contact[]; total: number }> {
    return call("listContacts", async (withFetch) => {
      const { data } = await this.zernio.contacts.listContacts(
        withFetch({
          signal: input.signal,
          query: {
            profileId: input.profileId,
            limit: 50,
            skip: input.skip ?? 0,
            ...(input.search ? { search: input.search } : {}),
            ...(input.tag ? { tag: input.tag } : {}),
          },
        }),
      );
      const parsed = parse(contactsSchema, data, "listContacts");
      const contacts = parsed.contacts.flatMap((c): Contact[] =>
        c
          ? [
              {
                id: c.id,
                name: c.name,
                email: c.email ?? null,
                tags: c.tags,
                subscribed: c.isSubscribed,
                platform: c.platform ?? null,
                identifier: c.displayIdentifier ?? c.platformIdentifier ?? null,
                lastMessageAt: c.lastMessageReceivedAt ?? c.lastMessageSentAt ?? null,
              },
            ]
          : [],
      );
      return { contacts, total: parsed.pagination?.total ?? contacts.length };
    });
  }

  async createContact(input: {
    profileId: string;
    name: string;
    email?: string;
    tags: string[];
    subscribed: boolean;
    channel?: { accountId: string; platform: string; identifier: string };
    signal?: AbortSignal;
  }): Promise<{ id: string }> {
    return call("createContact", async (withFetch) => {
      const { data } = await this.zernio.contacts.createContact(
        withFetch({
          signal: input.signal,
          body: {
            profileId: input.profileId,
            name: input.name,
            ...(input.email ? { email: input.email } : {}),
            tags: input.tags,
            isSubscribed: input.subscribed,
            ...(input.channel
              ? {
                  accountId: input.channel.accountId,
                  platform: input.channel.platform as "whatsapp",
                  platformIdentifier: input.channel.identifier,
                  displayIdentifier: input.channel.identifier,
                }
              : {}),
          },
        }),
      );
      return {
        id: parse(z.object({ contact: z.object({ id: z.string().min(1) }) }), data, "createContact")
          .contact.id,
      };
    });
  }

  async importContacts(input: {
    profileId: string;
    accountId?: string;
    rows: { name: string; identifier?: string; email?: string; tags: string[] }[];
    signal?: AbortSignal;
  }) {
    return call("bulkCreateContacts", async (withFetch) => {
      const { data } = await this.zernio.contacts.bulkCreateContacts(
        withFetch({
          signal: input.signal,
          body: {
            profileId: input.profileId,
            ...(input.accountId ? { accountId: input.accountId } : {}),
            contacts: input.rows.map((r) => ({
              name: r.name,
              ...(input.accountId && r.identifier
                ? { platformIdentifier: r.identifier, displayIdentifier: r.identifier }
                : {}),
              ...(r.email ? { email: r.email } : {}),
              tags: r.tags,
            })),
          },
        }),
      );
      const parsed = parse(
        z.object({
          created: z.number().catch(0),
          skipped: z.number().catch(0),
          errors: z.array(z.string()).catch([]),
        }),
        data,
        "bulkCreateContacts",
      );
      return { created: parsed.created, skipped: parsed.skipped, errors: parsed.errors.length };
    });
  }

  async updateContact(input: {
    id: string;
    tags?: string[];
    subscribed?: boolean;
    signal?: AbortSignal;
  }) {
    await call("updateContact", async (withFetch) => {
      await this.zernio.contacts.updateContact(
        withFetch({
          signal: input.signal,
          path: { contactId: input.id },
          body: {
            ...(input.tags ? { tags: input.tags } : {}),
            ...(input.subscribed !== undefined ? { isSubscribed: input.subscribed } : {}),
          },
        }),
      );
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
        z.object({
          contacts: z.array(z.object({ id: z.string().optional() }).catch({})).catch([]),
        }),
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
                  who: l.commenterUsername
                    ? `@${l.commenterUsername}`
                    : (l.commenterName ?? "Someone"),
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

  async retryPost(input: {
    postId: string;
    idempotencyKey: string;
    signal?: AbortSignal;
  }): Promise<{ status: ProviderPostStatus; results: PostPlatformResult[] }> {
    return call("retryPost", async (withFetch) => {
      const { data } = await this.zernio.posts.retryPost(
        withFetch({
          signal: input.signal,
          path: { postId: input.postId },
          headers: { "Idempotency-Key": input.idempotencyKey },
        }),
      );
      return retryOutcome(parse(retrySchema, data, "retryPost"));
    });
  }

  async updatePost(
    input: UpdatePostInput & { signal?: AbortSignal },
  ): Promise<{ status: ProviderPostStatus; scheduledFor: string | null }> {
    return call("updatePost", async (withFetch) => {
      const targets = input.targets
        ? await this.postTargets({
            content: input.content ?? "",
            media: input.media,
            targets: input.targets,
            extras: input.extras,
            tiktokConsent: input.tiktokConsent,
            publishAt: input.publishAt ?? null,
            idempotencyKey: input.idempotencyKey,
          })
        : undefined;
      const { data } = await this.zernio.posts.updatePost(
        withFetch({
          signal: input.signal,
          path: { postId: input.postId },
          body: {
            ...(input.content !== undefined ? { content: input.content } : {}),
            // An empty list takes the files off (the owner removed the photo).
            ...(input.media ? { mediaItems: toMediaItems(input.media) } : {}),
            ...(targets ? { platforms: targets } : {}),
            ...(input.publishAt ? { scheduledFor: input.publishAt.toISOString() } : {}),
          },
          headers: { "Idempotency-Key": input.idempotencyKey },
        }),
      );
      const { post } = parse(postSchema, data, "updatePost");
      return { status: post.status, scheduledFor: post.scheduledFor ?? null };
    });
  }

  async editPublishedPost(input: {
    postId: string;
    platform: string;
    accountId?: string;
    content: string;
    signal?: AbortSignal;
  }): Promise<{ url: string | null }> {
    return call("editPublishedPost", async (withFetch) => {
      const { data } = await this.zernio.posts.editPost(
        withFetch({
          signal: input.signal,
          path: { postId: input.postId },
          body: {
            platform: input.platform as "facebook",
            content: input.content,
            ...(input.accountId ? { accountId: input.accountId } : {}),
          },
        }),
      );
      const parsed = editSchema.safeParse(data);
      return { url: parsed.success ? (parsed.data.url ?? null) : null };
    });
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

  async getAccountCategory(input: {
    accountId: string;
    platform: string;
    username?: string | null;
    signal?: AbortSignal;
  }): Promise<AccountCategory> {
    try {
      return await this.readAccountCategory(input);
    } catch {
      // Setup goes on without it (the kind is asked instead). No details: the error is Zernio's.
      return EMPTY_ACCOUNT_CATEGORY;
    }
  }

  private async readAccountCategory(input: {
    accountId: string;
    platform: string;
    username?: string | null;
    signal?: AbortSignal;
  }): Promise<AccountCategory> {
    const text = z
      .string()
      .nullish()
      .transform((v) => v?.trim() || null);
    if (input.platform === "facebook") {
      return call("getAccountCategory", async (withFetch) => {
        // docs.zernio.com: GET /v1/accounts/{accountId}/facebook-page (pages[].name,
        // pages[].category, selectedPageId).
        const { data } = await this.zernio.connect.getFacebookPages(
          withFetch({ signal: input.signal, path: { accountId: input.accountId } }),
        );
        const found = parse(
          z.object({
            pages: z
              .array(z.object({ id: z.string().nullish(), name: text, category: text }))
              .nullish(),
            selectedPageId: z.string().nullish(),
          }),
          data,
          "getAccountCategory",
        );
        const pages = found.pages ?? [];
        const page =
          pages.find((p) => !!found.selectedPageId && p.id === found.selectedPageId) ??
          (pages.length === 1 ? pages[0] : undefined);
        return {
          ...EMPTY_ACCOUNT_CATEGORY,
          name: page?.name ?? null,
          category: page?.category ?? null,
        };
      });
    }
    if (input.platform === "instagram" && input.username) {
      const username = input.username.replace(/^@/, "");
      return call("getAccountCategory", async (withFetch) => {
        // docs.zernio.com: GET /v1/accounts/{accountId}/instagram/business-discovery?username=
        // (profile.biography, website; needs an account connected with Facebook Login).
        const { data } = await this.zernio.instagram.getInstagramBusinessDiscovery(
          withFetch({
            signal: input.signal,
            path: { accountId: input.accountId },
            query: { username, limit: 1 },
          }),
        );
        const found = parse(
          z.object({ profile: z.object({ biography: text, website: text }) }),
          data,
          "getAccountCategory",
        );
        return {
          ...EMPTY_ACCOUNT_CATEGORY,
          bio: found.profile.biography,
          website: found.profile.website,
        };
      });
    }
    if (input.platform === "googlebusiness") {
      return call("getAccountCategory", async (withFetch) => {
        // docs.zernio.com: GET /v1/accounts/{accountId}/gmb-location-details
        // ?readMask=categories,profile (categories.primaryCategory.displayName,
        // profile.description; `title`, the business name, always comes back).
        const { data } = await this.zernio.gmblocationdetails.getGoogleBusinessLocationDetails(
          withFetch({
            signal: input.signal,
            path: { accountId: input.accountId },
            query: { readMask: "categories,profile" },
          }),
        );
        const found = parse(
          z.object({
            title: text,
            location: z.object({ name: text }).nullish(),
            categories: z
              .object({ primaryCategory: z.object({ displayName: text }).nullish() })
              .nullish(),
            profile: z.object({ description: text }).nullish(),
            websiteUri: text,
          }),
          data,
          "getAccountCategory",
        );
        return {
          ...EMPTY_ACCOUNT_CATEGORY,
          name: found.title ?? found.location?.name ?? null,
          category: found.categories?.primaryCategory?.displayName ?? null,
          description: found.profile?.description ?? null,
          website: found.websiteUri,
        };
      });
    }
    return EMPTY_ACCOUNT_CATEGORY;
  }

  async getBusinessProfile(input: {
    accountId: string;
    platform: string;
    username?: string | null;
    captions?: number;
    signal?: AbortSignal;
  }): Promise<BusinessProfile | null> {
    const nullable = z
      .string()
      .nullish()
      .transform((v) => v?.trim() || null);
    if (input.platform === "facebook") {
      return call("getBusinessProfile", async (withFetch) => {
        // docs.zernio.com/account-settings/get-facebook-page-info
        const { data } = await this.zernio.accountsettings.getFacebookPageInfo(
          withFetch({ signal: input.signal, path: { accountId: input.accountId } }),
        );
        const page = parse(
          z.object({
            about: nullable,
            description: nullable,
            website: nullable,
            phone: nullable,
            emails: z.array(z.string()).nullish(),
            hours: z.record(z.string(), z.string()).nullish(),
          }),
          data,
          "getBusinessProfile",
        );
        const about = [page.about, page.description].filter(Boolean).join("\n\n") || null;
        return {
          source: "facebook_page" as const,
          name: null,
          about,
          website: page.website,
          phone: page.phone,
          emails: page.emails ?? [],
          hours: page.hours ?? {},
          captions: [],
        };
      });
    }
    if (input.platform !== "instagram" || !input.username) return null;
    const username = input.username;
    try {
      return await call("getBusinessProfile", async (withFetch) => {
        // docs.zernio.com/instagram/get-instagram-business-discovery: our own handle, looked up
        // through our own account.
        const { data } = await this.zernio.instagram.getInstagramBusinessDiscovery(
          withFetch({
            signal: input.signal,
            path: { accountId: input.accountId },
            query: { username, limit: input.captions ?? 25 },
          }),
        );
        const found = parse(
          z.object({
            profile: z.object({ name: nullable, biography: nullable, website: nullable }),
            media: z.array(z.object({ caption: nullable })).nullish(),
          }),
          data,
          "getBusinessProfile",
        );
        return {
          source: "instagram_profile" as const,
          name: found.profile.name,
          about: found.profile.biography,
          website: found.profile.website,
          phone: null,
          emails: [],
          hours: {},
          captions: (found.media ?? []).flatMap((m) => (m.caption ? [m.caption] : [])),
        };
      });
    } catch (error) {
      // Connected with Instagram Login (instagram_business_discovery_requires_facebook_login), or
      // a personal account: nothing we can read.
      if (error instanceof SocialProviderError && error.details.status === 400) return null;
      throw error;
    }
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
        senderName: m.senderName ?? null,
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

  async listCommentedPostsPage(input: {
    accountId: string;
    since: Date;
    cursor?: string | null;
    limit?: number;
    signal?: AbortSignal;
  }): Promise<{ postIds: string[]; nextCursor: string | null }> {
    return call("listCommentedPostsPage", async (withFetch) => {
      const { data } = await this.zernio.comments.listInboxComments(
        withFetch({
          signal: input.signal,
          query: {
            accountId: input.accountId,
            since: input.since.toISOString(),
            limit: input.limit ?? 50,
            minComments: 1,
            // The default sort: the only one the cursor walks coherently.
            sortBy: "date",
            sortOrder: "desc",
            ...(input.cursor ? { cursor: input.cursor } : {}),
          },
        }),
      );
      const page = parse(commentedPostsPageSchema, data, "listCommentedPostsPage");
      const seen = new Set<string>();
      const posts = (page.data ?? []).filter((p) => !seen.has(p.id) && seen.add(p.id));
      return {
        postIds: posts.map((p) => p.id),
        posts: posts.map((p) => ({ id: p.id, caption: p.content ?? null })),
        nextCursor: page.pagination?.nextCursor ?? null,
      };
    });
  }

  async listPostCommentsPage(input: {
    accountId: string;
    postId: string;
    cursor?: string | null;
    limit?: number;
    signal?: AbortSignal;
  }): Promise<{ comments: ProviderComment[]; nextCursor: string | null }> {
    return call("listPostCommentsPage", async (withFetch) => {
      const { data } = await this.zernio.comments.getInboxPostComments(
        withFetch({
          signal: input.signal,
          path: { postId: input.postId },
          query: {
            accountId: input.accountId,
            limit: input.limit ?? 50,
            ...(input.cursor ? { cursor: input.cursor } : {}),
          },
        }),
      );
      const page = parse(postCommentsPageSchema, data, "listPostCommentsPage");
      return {
        comments: (page.comments ?? []).map((c) => ({
          id: c.id,
          text: c.message ?? "",
          authorName: c.from?.username ?? c.from?.name ?? null,
          fromOwner: c.from?.isOwner ?? false,
          createdAt: c.createdTime ?? null,
          ownerReplied: (c.replies ?? []).some((r) => r.from?.isOwner === true),
          ownerRepliedAt: firstOwnerReplyAt(c.replies ?? []),
        })),
        nextCursor: page.pagination?.hasMore ? (page.pagination.cursor ?? null) : null,
      };
    });
  }

  async listConversations(input: {
    accountId: string;
    limit?: number;
    signal?: AbortSignal;
  }): Promise<ProviderConversation[]> {
    return call("listConversations", async (withFetch) => {
      const { data } = await this.zernio.messages.listInboxConversations(
        withFetch({
          signal: input.signal,
          query: { accountId: input.accountId, limit: input.limit ?? 100, sortOrder: "desc" },
        }),
      );
      const list = parse(conversationsSchema, data, "listConversations");
      // 200 with the account in meta.failedAccounts / accountsSkipped: its DMs couldn't be read.
      const issue = conversationsAccessIssue(list.meta, input.accountId);
      if (issue?.issue === "rate_limited") {
        throw new SocialProviderError("Zernio listConversations failed (rate limited)", {
          status: 429,
          ambiguous: false,
          retryAfterSeconds: issue.retryAfterSeconds,
        });
      }
      if (issue?.issue === "no_access") {
        throw new SocialProviderError("Zernio listConversations: account's messages unavailable", {
          code: DM_ACCESS_MISSING,
          ambiguous: false,
        });
      }
      return (list.data ?? []).map((c) => ({
        id: c.id,
        participantId: c.participantId ?? null,
        participantName: c.participantName ?? null,
        updatedTime: c.updatedTime ?? null,
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

  async getAccountsHealth(input: { profileId: string }): Promise<AccountsHealthReport> {
    return call("getAccountsHealth", async (withFetch) => {
      const { data } = await this.zernio.accounts.getAllAccountsHealth(
        withFetch({
          query: { profileId: input.profileId },
        }),
      );
      const parsed = parse(healthSchema, data, "getAccountsHealth");
      // The endpoint has no paging (docs: /accounts/get-all-accounts-health). Complete only when
      // the summary's total matches and nothing from another profile came back.
      const total = parsed.summary?.total;
      const complete =
        typeof total === "number" &&
        total === parsed.accounts.length &&
        parsed.accounts.every((a) => a.profileId == null || a.profileId === input.profileId);
      return {
        complete,
        accounts: parsed.accounts.map((a) => ({
          accountId: a.accountId,
          platform: a.platform,
          username: a.username ?? null,
          status: a.status,
          needsReconnect: a.needsReconnect ?? false,
          canPost: a.canPost ?? false,
          issues: a.issues ?? [],
        })),
      };
    });
  }

  async accountExists(input: { accountId: string; signal?: AbortSignal }): Promise<boolean> {
    try {
      await call("accountExists", async (withFetch) => {
        await this.zernio.accounts.getAccountHealth(
          withFetch({ signal: input.signal, path: { accountId: input.accountId } }),
        );
      });
      return true;
    } catch (error) {
      if (error instanceof SocialProviderError && error.details.status === 404) return false;
      throw error;
    }
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
/** `mediaItems` for createPost and validate: each file with its type (and alt text). */
function mediaItemsFor(input: Pick<CreatePostInput, "media" | "mediaUrls">) {
  const media = postMediaOf(input);
  return media.length ? toMediaItems(media) : undefined;
}

const POST_STATUSES = [
  "draft",
  "pending_approval",
  "scheduled",
  "publishing",
  "published",
  "partial",
  "failed",
  "cancelled",
] as const;

/**
 * `POST /v1/posts/{postId}/retry` (docs.zernio.com/posts/retry-post): 200 or 207 with the post
 * and one `platformResults` entry per platform. Read loosely: only what Waggle shows.
 */
const retrySchema = z.object({
  post: z
    .object({
      status: z.enum(POST_STATUSES).optional().catch(undefined),
      platforms: z
        .array(
          z.object({
            platform: z.string().optional(),
            accountId: z
              .union([z.string(), z.object({ _id: z.string() }).transform((a) => a._id)])
              .optional()
              .catch(undefined),
            status: z.string().optional(),
            platformPostUrl: z.string().nullish(),
            errorMessage: z.string().nullish(),
            errorCategory: z.string().nullish(),
          }),
        )
        .optional()
        .catch(undefined),
    })
    .optional(),
  platformResults: z
    .array(
      z.object({
        platform: z.string(),
        accountId: z.string().nullish(),
        status: z.string(),
        error: z.string().nullish(),
        errorCategory: z.string().nullish(),
      }),
    )
    .optional()
    .catch(undefined),
});

/** The post's status and each platform's result after a retry (URLs from `post.platforms`). */
export function retryOutcome(r: z.infer<typeof retrySchema>): {
  status: ProviderPostStatus;
  results: PostPlatformResult[];
} {
  const targets = r.post?.platforms ?? [];
  const urlOf = (platform: string, accountId: string | null | undefined) =>
    targets.find((t) => t.platform === platform && (!accountId || t.accountId === accountId))
      ?.platformPostUrl ?? null;
  const results: PostPlatformResult[] = r.platformResults?.length
    ? r.platformResults.map((p) => ({
        platform: p.platform,
        accountId: p.accountId ?? null,
        status: p.status,
        url: urlOf(p.platform, p.accountId),
        error: p.error ?? null,
        errorCategory: p.errorCategory ?? null,
      }))
    : targets.flatMap((t) =>
        t.platform
          ? [
              {
                platform: t.platform,
                accountId: t.accountId ?? null,
                status: t.status ?? "pending",
                url: t.platformPostUrl ?? null,
                error: t.errorMessage ?? null,
                errorCategory: t.errorCategory ?? null,
              },
            ]
          : [],
      );
  const status: ProviderPostStatus =
    r.post?.status ??
    (results.every((p) => p.status === "published")
      ? "published"
      : results.some((p) => p.status === "published")
        ? "partial"
        : results.some((p) => p.status === "failed")
          ? "failed"
          : "publishing");
  return { status, results };
}

function legacyExtras(
  platform: string,
  input: Pick<CreatePostInput, "pinterestBoardId" | "youtubeTitle">,
): TargetExtras {
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
