import * as Sentry from "@sentry/nextjs";
import type { z } from "zod";
import type { Json } from "@/lib/supabase/database.types";
import type { ServiceClient } from "@/lib/supabase/service";
import { isSocialPlatform, type SocialPlatform } from "@/lib/social/types";
import { writeAudit } from "@/lib/audit";
import { insertInboundItem } from "./items";
import { transitionItem } from "./status";
import {
  accountConnectedSchema,
  accountDisconnectedSchema,
  commentEventSchema,
  envelopeSchema,
  messageEventSchema,
  messageFailedSchema,
  postEventSchema,
  zernioAccountIdOf,
  type ZernioEnvelope,
} from "./zernio-events";

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
    "post.published": (t) => mapPost(deps.db, t.tenantId, payload),
    "post.partial": (t) => mapPost(deps.db, t.tenantId, payload),
    "post.failed": (t) => mapPost(deps.db, t.tenantId, payload),
    "post.cancelled": (t) => mapPost(deps.db, t.tenantId, payload),
    "account.connected": (t) => mapAccountConnected(deps, t, payload),
    "account.disconnected": (t) => mapAccountDisconnected(deps, t, payload),
    "message.failed": (t) => mapMessageFailed(deps.db, t.tenantId, payload),
  };
  const handler = handlers[event.event];
  if (!handler) return skipped("not_mapped");

  const tenant = await resolveTenant(deps.db, event.profiles);
  if (!tenant) return rejected("unknown_tenant");
  return handler(tenant);
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

function supportedAccount(account: AccountBlock) {
  return isSocialPlatform(account.platform) ? { ...account, platform: account.platform } : null;
}

async function mapComment(
  deps: IngestDeps,
  tenantId: string,
  payload: unknown,
): Promise<IngestResult> {
  const e = parse(commentEventSchema, payload);
  if (!e) return rejected("invalid_payload");
  // Meta re-delivers our own replies as comments.
  if (e.comment.author.isOwnAccount) return skipped("own_account");
  const account = supportedAccount(e.account);
  if (!account) return skipped("unsupported_platform");

  const resolved = await accountFor(deps, tenantId, account);
  if ("rejected" in resolved) return rejected(resolved.rejected);

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

  const resolved = await accountFor(deps, tenantId, account);
  if ("rejected" in resolved) return rejected(resolved.rejected);

  const participantName =
    e.message.sender.name ?? e.conversation?.participantName ?? e.message.sender.username ?? null;
  const { db } = deps;
  const { error: upsertError } = await db.from("conversations").upsert(
    {
      tenant_id: tenantId,
      social_account_id: resolved.accountId,
      zernio_conversation_id: e.message.conversationId,
      platform: account.platform,
      participant_name: participantName,
      participant_external_id: e.message.sender.id,
    },
    { onConflict: "zernio_conversation_id", ignoreDuplicates: true },
  );
  if (upsertError) throw new Error(`conversations upsert failed: ${upsertError.message}`);

  const { data: conversation, error: lookupError } = await db
    .from("conversations")
    .select("id, tenant_id")
    .eq("zernio_conversation_id", e.message.conversationId)
    .single();
  if (lookupError) throw new Error(`conversations lookup failed: ${lookupError.message}`);
  if (conversation.tenant_id !== tenantId) return rejected("foreign_conversation");

  // The 24-hour reply window (§7.4) runs from the latest customer message.
  const { error: windowError } = await db
    .from("conversations")
    .update({ last_customer_message_at: e.message.sentAt })
    .eq("id", conversation.id)
    .or(`last_customer_message_at.is.null,last_customer_message_at.lt."${e.message.sentAt}"`);
  if (windowError) throw new Error(`conversation window update failed: ${windowError.message}`);

  const { created } = await insertInboundItem(db, {
    kind: "dm",
    tenantId,
    socialAccountId: resolved.accountId,
    zernioMessageId: e.message.id,
    conversationId: conversation.id,
    authorName: participantName,
    // Attachment-only messages have no text.
    text: e.message.text ?? "",
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
    .map((p) => `${p.platform}: ${p.error}`)
    .join("; ");
  let failureReason: "zernio_paused" | "account_removed" | null = null;
  if (status === "failed") {
    const { data: pause } = await db
      .from("platform_state")
      .select("value")
      .eq("key", "zernio_pause")
      .maybeSingle();
    const paused = !!(pause?.value as { pausedAt?: string } | null)?.pausedAt;
    if (paused || PAYMENT_ERROR.test(errors)) failureReason = "zernio_paused";
  }
  // Cancelled by Zernio: its only account was removed after the disconnect grace period.
  if (status === "cancelled") failureReason = "account_removed";

  const { data, error } = await db
    .from("posts")
    .update({
      status,
      last_error: errors || null,
      failure_reason: failureReason,
      platform_results: e.post.platforms.map((p) => ({
        platform: p.platform,
        status: p.status,
        url: p.publishedUrl ?? null,
        error: p.error ?? null,
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
