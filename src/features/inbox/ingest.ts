import * as Sentry from "@sentry/nextjs";
import {
  isAutomatedEmail,
  isEmailPlatform,
  looksLikeWaggleEmail,
  ownEmailDomains,
  readableEmailText,
  senderAddress,
} from "./email-text";
import { z } from "zod";
import type { Json } from "@/lib/supabase/database.types";
import type { ServiceClient } from "@/lib/supabase/service";
import { isInboxLive } from "@/lib/social/platforms";
import { isSocialPlatform, type SocialPlatform } from "@/lib/social/types";
import { writeAudit } from "@/lib/audit";
import { recordConversation } from "./conversations";
import { insertInboundItem } from "./items";
import { transitionItem } from "./status";
import {
  accountConnectedSchema,
  accountDisconnectedSchema,
  commentEventSchema,
  callEndedSchema,
  envelopeSchema,
  leadReceivedSchema,
  rcsStatusSchema,
  messageEventSchema,
  messageFailedSchema,
  postEventSchema,
  reviewEventSchema,
  reviewUpdatedSchema,
  zernioAccountIdOf,
  type ZernioEnvelope,
} from "./zernio-events";
import { customerText } from "@/lib/social/whitelabel";
import { isOptKeyword } from "./opt-keywords";

// Webhook mapping (docs/tdd.md §7.1): dedupe on the event id, then map to rows. DB writes only,
// no external calls. Never logs payloads (they hold customer text); logs event ids.

/** Account handlers live in features/accounts; the route passes them in (no import cycle). */
export interface AccountHandlers {
  connected(
    db: ServiceClient,
    input: {
      tenantId: string;
      zernioAccountId: string;
      platform: SocialPlatform;
      username: string;
    },
  ): Promise<{ accountId: string; outcome: string }>;
  disconnected(
    db: ServiceClient,
    input: {
      tenantId: string;
      zernioAccountId: string;
      disconnectionType?: string;
      reason?: string;
    },
  ): Promise<{ accountId: string | null }>;
}

export interface IngestDeps {
  db: ServiceClient;
  accounts: AccountHandlers;
}

export type IngestResult =
  | { outcome: "processed"; detail?: string }
  | { outcome: "duplicate" }
  | { outcome: "skipped"; reason: string }
  /** Stored with webhook_events.error = reason; nothing else created. Not retried. */
  | { outcome: "rejected"; reason: string };

export class InvalidWebhookError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidWebhookError";
  }
}

const skipped = (reason: string): IngestResult => ({ outcome: "skipped", reason });
const rejected = (reason: string): IngestResult => ({ outcome: "rejected", reason });

export async function receiveZernioEvent(
  deps: IngestDeps,
  payload: unknown,
): Promise<IngestResult> {
  const envelope = envelopeSchema.safeParse(payload);
  if (!envelope.success) throw new InvalidWebhookError("payload is not a Zernio event");
  const { db } = deps;
  const event = envelope.data;

  const { data: inserted, error: insertError } = await db
    .from("webhook_events")
    .upsert(
      { id: event.id, source: "zernio", event_type: event.event, payload: payload as Json },
      { onConflict: "id", ignoreDuplicates: true },
    )
    .select("id");
  if (insertError) throw new Error(`webhook_events insert failed: ${insertError.message}`);

  if (inserted.length === 0) {
    const { data: existing } = await db
      .from("webhook_events")
      .select("processed_at")
      .eq("id", event.id)
      .single();
    // Processed before: a redelivery. Not processed: an earlier attempt failed, so map it again
    // (mapping is idempotent).
    if (existing?.processed_at) return { outcome: "duplicate" };
  }

  let result: IngestResult;
  try {
    result = await mapEvent(deps, event, payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    await db
      .from("webhook_events")
      .update({ error: message.slice(0, 500) })
      .eq("id", event.id);
    throw error;
  }

  await db
    .from("webhook_events")
    .update({
      processed_at: new Date().toISOString(),
      error: result.outcome === "rejected" ? result.reason : null,
    })
    .eq("id", event.id);
  if (result.outcome === "rejected") {
    Sentry.captureMessage(`zernio webhook rejected: ${result.reason}`, {
      extra: { eventId: event.id, eventType: event.event },
    });
  }
  return result;
}

/**
 * The tenant an event belongs to: profiles[0].externalId must be an existing tenant AND
 * profiles[0].id must be that tenant's Zernio profile. Anything else is not ours.
 */
async function resolveTenant(
  db: ServiceClient,
  profiles: ZernioEnvelope["profiles"],
): Promise<{ tenantId: string; profileId: string } | null> {
  const profile = profiles?.[0];
  if (!profile?.externalId || !/^[0-9a-f-]{36}$/i.test(profile.externalId)) return null;
  const { data } = await db
    .from("tenants")
    .select("id, zernio_profile_id")
    .eq("id", profile.externalId)
    .maybeSingle();
  if (!data || data.zernio_profile_id !== profile.id) return null;
  return { tenantId: data.id, profileId: profile.id };
}

function parse<S extends z.ZodType>(schema: S, payload: unknown): z.infer<S> | null {
  const parsed = schema.safeParse(payload);
  return parsed.success ? parsed.data : null;
}

async function mapEvent(
  deps: IngestDeps,
  event: ZernioEnvelope,
  payload: unknown,
): Promise<IngestResult> {
  if (event.test) return skipped("test_event");

  const handlers: Record<
    string,
    (tenant: { tenantId: string; profileId: string }) => Promise<IngestResult>
  > = {
    "comment.received": (t) => mapComment(deps, t.tenantId, payload),
    "message.received": (t) => mapMessage(deps, t.tenantId, payload),
    "review.new": (t) => mapReview(deps, t.tenantId, payload),
    "review.updated": (t) => mapReviewUpdated(deps.db, t.tenantId, payload),
    "post.published": (t) => mapPost(deps.db, t.tenantId, payload),
    "post.partial": (t) => mapPost(deps.db, t.tenantId, payload),
    "post.failed": (t) => mapPost(deps.db, t.tenantId, payload),
    "post.cancelled": (t) => mapPost(deps.db, t.tenantId, payload),
    "account.connected": (t) => mapAccountConnected(deps, t, payload),
    "account.disconnected": (t) => mapAccountDisconnected(deps, t, payload),
    "message.failed": (t) => mapMessageFailed(deps.db, t.tenantId, payload),
    "lead.received": (t) => mapLeadReceived(deps.db, t, event.id, payload),
    "rcs.agent.status_updated": (t) => mapRcsStatus(deps.db, t, event.id, payload),
    "call.ended": (t) => mapCallEnded(deps, t.tenantId, payload),
  };
  const handler = handlers[event.event];
  if (!handler) return skipped("not_mapped");

  const tenant =
    (await resolveTenant(deps.db, event.profiles)) ??
    (POST_EVENTS.has(event.event) ? await resolvePostTenant(deps.db, payload) : null);
  if (!tenant) return rejected("unknown_tenant");
  return handler(tenant);
}

const POST_EVENTS = new Set(["post.published", "post.partial", "post.failed", "post.cancelled"]);

/**
 * A post event Zernio sent without `profiles` (seen on staging, 25 Nov: a post.published for a
 * post Waggle created carried only the post). The post itself is ours when Waggle stored its
 * Zernio id: the tenant is that post's, and its profile the tenant's own. The body is already
 * signed; a Zernio id Waggle never stored stays unknown_tenant.
 */
async function resolvePostTenant(
  db: ServiceClient,
  payload: unknown,
): Promise<{ tenantId: string; profileId: string } | null> {
  const id = z.object({ post: z.object({ id: z.string().min(1) }) }).safeParse(payload);
  if (!id.success) return null;
  const { data: post } = await db
    .from("posts")
    .select("tenant_id")
    .eq("zernio_post_id", id.data.post.id)
    .maybeSingle();
  if (!post) return null;
  const { data: tenant } = await db
    .from("tenants")
    .select("id, zernio_profile_id")
    .eq("id", post.tenant_id)
    .maybeSingle();
  if (!tenant?.zernio_profile_id) return null;
  return { tenantId: tenant.id, profileId: tenant.zernio_profile_id };
}

/**
 * T82b: an inbound call nobody answered, or that went to voicemail, becomes a `call` item that
 * goes straight to the owner (escalated: never classified or drafted). Answered and outgoing
 * calls create nothing. Phone accounts only (WhatsApp calls come later).
 */
async function mapCallEnded(
  deps: IngestDeps,
  tenantId: string,
  payload: unknown,
): Promise<IngestResult> {
  const e = parse(callEndedSchema, payload);
  if (!e) return rejected("invalid_payload");
  if (e.call.direction !== "inbound") return skipped("outgoing_call");
  const missed = e.call.isVoicemail || e.call.endReason === "no_answer";
  if (!missed) return skipped("answered_call");
  if (e.account.platform !== "phone") return skipped("unsupported_platform");

  const resolved = await accountFor(deps, tenantId, { ...e.account, platform: "phone" });
  if ("rejected" in resolved) return rejected(resolved.rejected);
  const voicemail = e.call.isVoicemail;
  const { itemId, created } = await insertInboundItem(deps.db, {
    kind: "call",
    tenantId,
    socialAccountId: resolved.accountId,
    zernioCallId: e.call.id,
    voicemail,
    durationSeconds: e.call.durationSeconds,
    authorName: e.call.from || null,
    // What the inbox shows; not customer text.
    text: voicemail ? "Left a voicemail" : "Missed call",
    receivedAt: e.call.startedAt,
  });
  if (created) {
    await transitionItem(deps.db, {
      itemId,
      from: "new",
      event: "escalate",
      details: { policyReason: voicemail ? "voicemail" : "missed_call" },
    });
  }
  return { outcome: "processed", detail: created ? "call_item_created" : "item_exists" };
}

/**
 * A lead from an ad's form (T78d): one 'ad_lead' alert (email + bell) per lead. The answers stay
 * in the stored event; the alert keeps ids and the form name only (rule 10).
 */
async function mapLeadReceived(
  db: ServiceClient,
  tenant: { tenantId: string; profileId: string },
  eventId: string,
  payload: unknown,
): Promise<IngestResult> {
  const e = parse(leadReceivedSchema, payload);
  if (!e) return rejected("invalid_payload");
  if (e.account.profileId !== tenant.profileId) return rejected("profile_mismatch");
  const { data: account } = await db
    .from("social_accounts")
    .select("id")
    .eq("tenant_id", tenant.tenantId)
    .eq("zernio_account_id", e.account.accountId ?? e.account.id)
    .maybeSingle();
  if (!account) return skipped("unknown_account");
  const { error } = await db.from("alerts").upsert(
    {
      tenant_id: tenant.tenantId,
      kind: "ad_lead",
      social_account_id: account.id,
      details: {
        source: "ad_form",
        eventId,
        zernioLeadId: e.lead.id,
        formName: e.lead.formName ?? null,
        platform: e.lead.platform ?? "meta",
      },
      dedupe_key: `ad_lead:${e.lead.leadgenId}`,
    },
    { onConflict: "dedupe_key", ignoreDuplicates: true },
  );
  if (error) throw new Error(`ad lead alert insert failed: ${error.message}`);
  return { outcome: "processed", detail: "ad_lead" };
}

/** RCS statuses the owner acts on (T83b); the others show on the Messaging page only. */
const RCS_ALERT_STATUSES = new Set(["changes_requested", "testing", "live", "rejected"]);

/** An RCS agent moved status (T83b): one 'rcs_status' alert (email + bell) when it needs the owner. */
async function mapRcsStatus(
  db: ServiceClient,
  tenant: { tenantId: string; profileId: string },
  eventId: string,
  payload: unknown,
): Promise<IngestResult> {
  const e = parse(rcsStatusSchema, payload);
  if (!e) return rejected("invalid_payload");
  if (e.agent.profileId !== tenant.profileId) return rejected("profile_mismatch");
  if (!RCS_ALERT_STATUSES.has(e.status))
    return { outcome: "processed", detail: "rcs_status_noted" };
  const { error } = await db.from("alerts").upsert(
    {
      tenant_id: tenant.tenantId,
      kind: "rcs_status",
      details: {
        source: "rcs",
        agentId: e.agent.id,
        status: e.status,
        // The partner's review note (never customer text); shown to the owner as written.
        reason: e.reason?.slice(0, 1000) ?? null,
      },
      dedupe_key: `rcs_status:${eventId}`,
    },
    { onConflict: "dedupe_key", ignoreDuplicates: true },
  );
  if (error) throw new Error(`rcs status alert insert failed: ${error.message}`);
  return { outcome: "processed", detail: "rcs_status" };
}

/** A reply we sent was not delivered: its draft and item fail, and the owner is told (T13). */
async function mapMessageFailed(
  db: ServiceClient,
  tenantId: string,
  payload: unknown,
): Promise<IngestResult> {
  const e = parse(messageFailedSchema, payload);
  if (!e) return rejected("invalid_payload");
  const ids = [e.message.platformMessageId, e.message.id].filter((id): id is string => !!id);
  const { data: draft } = await db
    .from("drafts")
    .select("id, item_id, status")
    .eq("tenant_id", tenantId)
    .in("zernio_reply_id", ids)
    .limit(1)
    .maybeSingle();
  if (!draft) return skipped("unknown_message");
  if (draft.status !== "sent") return { outcome: "processed", detail: "already_failed" };

  await db.from("drafts").update({ status: "failed" }).eq("id", draft.id).eq("status", "sent");
  const { applied } = await transitionItem(db, {
    itemId: draft.item_id,
    from: "sent",
    event: "delivery_failed",
    details: { draftId: draft.id },
  });
  await writeAudit(db, {
    tenantId,
    itemId: draft.item_id,
    action: "delivery_failed",
    actor: "system",
    // Platform error code and title only; never message text.
    details: { draftId: draft.id, code: e.error?.code ?? null, title: e.error?.title ?? null },
  });
  return { outcome: "processed", detail: applied ? "delivery_failed" : "item_moved" };
}

type AccountBlock = { id: string; accountId?: string; platform: string; username: string };

/** The item's social account; an account we don't know yet is upserted from the event. */
async function accountFor(
  deps: IngestDeps,
  tenantId: string,
  account: AccountBlock & { platform: SocialPlatform },
): Promise<{ accountId: string } | { rejected: string }> {
  const zernioAccountId = zernioAccountIdOf(account);
  const { data } = await deps.db
    .from("social_accounts")
    .select("id, tenant_id")
    .eq("zernio_account_id", zernioAccountId)
    .maybeSingle();
  if (data)
    return data.tenant_id === tenantId ? { accountId: data.id } : { rejected: "foreign_account" };

  const result = await deps.accounts.connected(deps.db, {
    tenantId,
    zernioAccountId,
    platform: account.platform,
    username: account.username,
  });
  return result.outcome === "foreign"
    ? { rejected: "foreign_account" }
    : { accountId: result.accountId };
}

/** Comments and DMs only for platforms whose inbox is live (later waves add the rest). */
function supportedAccount(account: AccountBlock) {
  return isSocialPlatform(account.platform) && isInboxLive(account.platform)
    ? { ...account, platform: account.platform }
    : null;
}

async function mapComment(
  deps: IngestDeps,
  tenantId: string,
  payload: unknown,
): Promise<IngestResult> {
  const e = parse(commentEventSchema, payload);
  if (!e) return rejected("invalid_payload");
  // Meta re-delivers our own replies as comments. Zernio only flags them on Meta (and TikTok,
  // inferred), so also skip the account's own handle and any comment that is a reply we sent.
  if (e.comment.author.isOwnAccount) return skipped("own_account");
  if (sameHandle(e.comment.author.username, e.account.username)) return skipped("own_account");
  const account = supportedAccount(e.account);
  if (!account) return skipped("unsupported_platform");

  const resolved = await accountFor(deps, tenantId, account);
  if ("rejected" in resolved) return rejected(resolved.rejected);
  if (await isOurReply(deps.db, tenantId, e.comment.id)) return skipped("own_reply");

  const { created } = await insertInboundItem(deps.db, {
    kind: "comment",
    tenantId,
    socialAccountId: resolved.accountId,
    zernioCommentId: e.comment.id,
    // Set even for posts not published through Zernio; the reply endpoint accepts it (§7.4).
    zernioPostId: e.comment.platformPostId,
    permalink: e.post?.permalink ?? null,
    authorName: e.comment.author.username ?? e.comment.author.name ?? null,
    text: e.comment.text,
    receivedAt: e.comment.createdAt,
  });
  return { outcome: "processed", detail: created ? "item_created" : "item_exists" };
}

/** Pure: the commenter is the connected account itself ("@cafe" vs "cafe", any case). */
export function sameHandle(author: string | undefined, account: string): boolean {
  const norm = (s: string) => s.trim().replace(/^@/, "").toLowerCase();
  return !!author && norm(author) !== "" && norm(author) === norm(account);
}

/** A comment Waggle posted itself (its id is what our reply call returned). */
async function isOurReply(db: ServiceClient, tenantId: string, commentId: string) {
  const { data, error } = await db
    .from("drafts")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("zernio_reply_id", commentId)
    .limit(1);
  if (error) throw new Error(`own reply lookup failed: ${error.message}`);
  return data.length > 0;
}

/** T61: a new Google review. Ones already answered need nothing. */
async function mapReview(
  deps: IngestDeps,
  tenantId: string,
  payload: unknown,
): Promise<IngestResult> {
  const e = parse(reviewEventSchema, payload);
  if (!e) return rejected("invalid_payload");
  if (e.review.hasReply) return skipped("already_replied");
  const account = supportedAccount(e.account);
  if (!account) return skipped("unsupported_platform");

  const resolved = await accountFor(deps, tenantId, account);
  if ("rejected" in resolved) return rejected(resolved.rejected);

  const { created } = await insertInboundItem(deps.db, {
    kind: "review",
    tenantId,
    socialAccountId: resolved.accountId,
    zernioReviewId: e.review.id,
    authorName: e.review.reviewer?.name ?? null,
    text: e.review.text ?? "",
    receivedAt: e.review.createdAt,
    recommends: null,
    rating: e.review.rating ?? null,
  });
  return { outcome: "processed", detail: created ? "item_created" : "item_exists" };
}

/** Statuses where Waggle hasn't sent (or started sending) a reply: an owner's reply wins. */
const NOT_ANSWERED = [
  "new",
  "classified",
  "drafted",
  "awaiting_approval",
  "escalated",
  "failed",
  "paused",
] as const;

/**
 * T65: a review got a reply. If Waggle hasn't sent one (or isn't sending one), the owner wrote it
 * in Google: the waiting draft is dropped so approving it can't replace theirs.
 */
async function mapReviewUpdated(
  db: ServiceClient,
  tenantId: string,
  payload: unknown,
): Promise<IngestResult> {
  const e = parse(reviewUpdatedSchema, payload);
  if (!e) return rejected("invalid_payload");
  if (!e.review.hasReply) return skipped("no_reply");
  const { data: item } = await db
    .from("inbound_items")
    .select("id, status")
    .eq("tenant_id", tenantId)
    .eq("kind", "review")
    .eq("zernio_review_id", e.review.id)
    .maybeSingle();
  if (!item) return skipped("unknown_review");
  const from = NOT_ANSWERED.find((s) => s === item.status);
  // Sending, sent, handled, ignored, rejected: the reply is ours, or nothing waits on it.
  if (!from) return skipped("already_answered");

  const { applied } = await transitionItem(db, {
    itemId: item.id,
    from,
    event: "answered_elsewhere",
    details: { platform: "googlebusiness" },
  });
  if (!applied) return skipped("item_moved");
  await db
    .from("inbound_items")
    .update({ answered_on_platform_at: new Date().toISOString() })
    .eq("id", item.id);
  await db
    .from("drafts")
    .update({ status: "rejected" })
    .eq("item_id", item.id)
    .eq("status", "pending");
  await writeAudit(db, {
    tenantId,
    itemId: item.id,
    action: "answered_on_platform",
    actor: "system",
    details: { platform: "googlebusiness", previousStatus: item.status },
  });
  return { outcome: "processed", detail: "answered_on_platform" };
}

async function mapMessage(
  deps: IngestDeps,
  tenantId: string,
  payload: unknown,
): Promise<IngestResult> {
  const e = parse(messageEventSchema, payload);
  if (!e) return rejected("invalid_payload");
  if (e.message.direction !== "incoming") return skipped("outgoing_message");
  const account = supportedAccount(e.account);
  if (!account) return skipped("unsupported_platform");
  // T83d: STOP and START on texting channels are handled upstream, never answered.
  if (isOptKeyword(account.platform, e.message.text)) return skipped("opt_keyword");
  // 18 Nov: no-reply senders and Waggle's own emails never need an answer.
  const email = isEmailPlatform(account.platform);
  if (
    email &&
    (isAutomatedEmail(
      senderAddress(e.message.sender),
      ownEmailDomains(process.env.ALERT_FROM_EMAIL),
    ) ||
      looksLikeWaggleEmail(
        e.message.sender.name ?? e.conversation?.participantName,
        e.message.text,
        process.env.ALERT_FROM_EMAIL,
      ))
  ) {
    return skipped("automated_email");
  }

  const resolved = await accountFor(deps, tenantId, account);
  if ("rejected" in resolved) return rejected(resolved.rejected);

  const participantName =
    e.message.sender.name ?? e.conversation?.participantName ?? e.message.sender.username ?? null;
  const { db } = deps;
  const recorded = await recordConversation(db, {
    tenantId,
    socialAccountId: resolved.accountId,
    zernioConversationId: e.message.conversationId,
    platform: account.platform,
    participantName,
    participantExternalId: e.message.sender.id,
    subject: e.metadata?.email?.subject?.trim() || null,
    zernioContactId: e.message.sender.contactId ?? null,
    customerMessageAt: e.message.sentAt,
  });
  if ("foreign" in recorded) return rejected("foreign_conversation");
  const conversation = { id: recorded.conversationId };

  const { created } = await insertInboundItem(db, {
    kind: "dm",
    tenantId,
    socialAccountId: resolved.accountId,
    zernioMessageId: e.message.id,
    conversationId: conversation.id,
    platformMessageId: e.message.platformMessageId ?? null,
    attachments: (e.message.attachments ?? []).map((a) => ({
      type: a.type,
      ...(a.originalType ? { originalType: a.originalType } : {}),
    })),
    authorName: participantName,
    // Attachment-only messages have no text ("Sent a photo", T72).
    // Email: the words, not every tracking link spelled out (18 Nov).
    text: email ? readableEmailText(e.message.text ?? "") : (e.message.text ?? ""),
    receivedAt: e.message.sentAt,
  });
  return { outcome: "processed", detail: created ? "item_created" : "item_exists" };
}

const POST_STATUS = {
  "post.published": "published",
  "post.partial": "partial",
  "post.failed": "failed",
  "post.cancelled": "cancelled",
} as const;

/**
 * A post that came due while Zernio paused the team fails "with a payment error" and is not
 * retried (docs.zernio.com/multi-tenant). We know we're paused (platform_state) or the error says
 * so; either way the owner has to reschedule. VERIFY the exact error on a real pause.
 */
const PAYMENT_ERROR = /payment|billing|PAYMENT_REQUIRED|402/i;

async function mapPost(
  db: ServiceClient,
  tenantId: string,
  payload: unknown,
): Promise<IngestResult> {
  const e = parse(postEventSchema, payload);
  if (!e) return rejected("invalid_payload");
  const status = POST_STATUS[e.event];
  const errors = e.post.platforms
    .filter((p) => p.error)
    .map((p) => `${p.platform}: ${customerText(p.error ?? "")}`)
    .join("; ");
  let failureReason: "zernio_paused" | "account_removed" | "taken_down" | null = null;
  if (status === "failed") {
    const { data: pause } = await db
      .from("platform_state")
      .select("value")
      .eq("key", "zernio_pause")
      .maybeSingle();
    const paused = !!(pause?.value as { pausedAt?: string } | null)?.pausedAt;
    if (paused || PAYMENT_ERROR.test(errors)) failureReason = "zernio_paused";
  }
  // Cancelled: the owner took it down here (T75c), or its only account was removed after the
  // disconnect grace period.
  if (status === "cancelled") {
    const { data: row } = await db
      .from("posts")
      .select("taken_down_at")
      .eq("tenant_id", tenantId)
      .eq("zernio_post_id", e.post.id)
      .maybeSingle();
    failureReason = row?.taken_down_at ? "taken_down" : "account_removed";
  }

  const { data, error } = await db
    .from("posts")
    .update({
      status,
      last_error: errors || null,
      failure_reason: failureReason,
      platform_results: e.post.platforms.map((p) => ({
        platform: p.platform,
        accountId: p.accountId ?? null,
        status: p.status,
        url: p.publishedUrl ?? null,
        error: customerText(p.error ?? null),
        errorCategory: p.errorCategory ?? null,
      })),
      ...(e.post.publishedAt ? { published_at: e.post.publishedAt } : {}),
    })
    .eq("tenant_id", tenantId)
    .eq("zernio_post_id", e.post.id)
    .select("id");
  if (error) throw new Error(`posts update failed: ${error.message}`);
  // Posts made outside this app have no row.
  if (data.length === 0) return skipped("unknown_post");

  await writeAudit(db, {
    tenantId,
    action: "post_status_changed",
    actor: "system",
    details: { postId: data[0].id, zernioPostId: e.post.id, status, failureReason },
  });
  return { outcome: "processed", detail: status };
}

async function mapAccountConnected(
  deps: IngestDeps,
  tenant: { tenantId: string; profileId: string },
  payload: unknown,
): Promise<IngestResult> {
  const e = parse(accountConnectedSchema, payload);
  if (!e) return rejected("invalid_payload");
  if (e.account.profileId !== tenant.profileId) return rejected("profile_mismatch");
  if (!isSocialPlatform(e.account.platform)) return skipped("unsupported_platform");

  const result = await deps.accounts.connected(deps.db, {
    tenantId: tenant.tenantId,
    zernioAccountId: e.account.accountId,
    platform: e.account.platform,
    username: e.account.username,
  });
  if (result.outcome === "foreign") return rejected("foreign_account");
  return { outcome: "processed", detail: result.outcome };
}

async function mapAccountDisconnected(
  deps: IngestDeps,
  tenant: { tenantId: string; profileId: string },
  payload: unknown,
): Promise<IngestResult> {
  const e = parse(accountDisconnectedSchema, payload);
  if (!e) return rejected("invalid_payload");
  if (e.account.profileId !== tenant.profileId) return rejected("profile_mismatch");

  const result = await deps.accounts.disconnected(deps.db, {
    tenantId: tenant.tenantId,
    zernioAccountId: e.account.accountId,
    disconnectionType: e.account.disconnectionType,
    reason: e.account.reason,
  });
  return result.accountId
    ? { outcome: "processed", detail: "account_disconnected" }
    : skipped("unknown_account");
}
