import * as Sentry from "@sentry/nextjs";
import type { Step, StepResult } from "@/features/inbox";
import { writeAudit } from "@/lib/audit";
import { RetryLaterError } from "@/lib/jobs";
import {
  getPlatformPause,
  PLATFORM_PAUSE_RETRY_SECONDS,
  recordPlatformPause,
} from "@/lib/social/platform-pause";
import { SocialProviderError, type SocialProvider } from "@/lib/social/types";
import { isPlatformPaused } from "@/lib/social/zernio";
import type { ServiceClient } from "@/lib/supabase/service";
import { privateReplyClosesAt, type ReplyVia } from "./private-reply";
import {
  policy,
  type AutonomyMode,
  type Category,
  type PolicyInput,
  type SubscriptionStatus,
} from "./policy";

// The `sending` step (docs/tdd.md §7.4): policy check again (rule 6), then one reply through
// SocialProvider with the draft's idempotency key (rule 7). A request whose outcome is unknown
// (5xx, timeout, crash) leaves drafts.send_attempted_at set, and the next attempt looks for the
// reply on the platform before sending again.

/** Retry delay when Zernio says the same idempotency key is still in flight (409). */
const IN_FLIGHT_RETRY_SECONDS = 30;
/** How often a reply held by "Pause all replies" checks again (no attempt counted). */
export const REPLIES_PAUSED_RETRY_SECONDS = 120;
/** 429 without a reset header. */
const RATE_LIMIT_FALLBACK_SECONDS = 60;
/** A reconciled DM must be no older than the first attempt (minus clock skew). */
const RECONCILE_SKEW_MS = 5 * 60 * 1000;

interface SendContext {
  tenantId: string;
  kind: "comment" | "dm" | "review";
  receivedAt: string;
  zernioCommentId: string | null;
  zernioPostId: string | null;
  /** T42: the review a reply goes under. */
  zernioReviewId: string | null;
  account: { zernioAccountId: string; status: PolicyInput["account"]["status"] };
  conversation: { zernioConversationId: string; lastCustomerMessageAt: string | null } | null;
  input: Omit<PolicyInput, "draft" | "now">;
  draft: {
    id: string;
    message: string;
    status: string;
    needsHuman: boolean;
    approvedByOwner: boolean;
    writtenByOwner: boolean;
    idempotencyKey: string;
    sendAttemptedAt: string | null;
    zernioReplyId: string | null;
    /** T41: a comment answered in the commenter's DMs. */
    replyVia: ReplyVia;
  } | null;
}

async function loadSendContext(db: ServiceClient, itemId: string): Promise<SendContext> {
  const { data, error } = await db
    .from("inbound_items")
    .select(
      "tenant_id, kind, received_at, category, confidence, zernio_comment_id, zernio_post_id, " +
        "zernio_review_id, " +
        "social_accounts!inner (zernio_account_id, status), " +
        "tenants!inner (subscription_status, confidence_threshold, replies_paused), " +
        "conversations (zernio_conversation_id, last_customer_message_at)",
    )
    .eq("id", itemId)
    .single();
  if (error) throw new Error(`send: item lookup failed: ${error.message}`);
  const row = data as unknown as {
    tenant_id: string;
    kind: "comment" | "dm" | "review";
    received_at: string;
    category: Category | null;
    confidence: number | null;
    zernio_comment_id: string | null;
    zernio_post_id: string | null;
    zernio_review_id: string | null;
    social_accounts: { zernio_account_id: string; status: PolicyInput["account"]["status"] };
    tenants: {
      subscription_status: SubscriptionStatus;
      confidence_threshold: number;
      replies_paused: boolean;
    };
    conversations: {
      zernio_conversation_id: string;
      last_customer_message_at: string | null;
    } | null;
  };
  if (!row.category || row.confidence === null) throw new Error("send: item is not classified");

  const [{ data: setting }, { data: draft }] = await Promise.all([
    db
      .from("autonomy_settings")
      .select("mode")
      .eq("tenant_id", row.tenant_id)
      .eq("category", row.category)
      .maybeSingle(),
    db
      .from("drafts")
      .select(
        "id, body, edited_body, status, needs_human, decided_by, idempotency_key, " +
          "send_attempted_at, zernio_reply_id, reply_via, owner_written",
      )
      .eq("item_id", itemId)
      .in("status", ["approved", "sent"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const d = draft as unknown as {
    id: string;
    body: string;
    edited_body: string | null;
    status: string;
    needs_human: boolean;
    decided_by: string | null;
    idempotency_key: string;
    send_attempted_at: string | null;
    zernio_reply_id: string | null;
    reply_via: string;
    owner_written: boolean;
  } | null;

  const last = row.conversations?.last_customer_message_at ?? null;
  return {
    tenantId: row.tenant_id,
    kind: row.kind,
    receivedAt: row.received_at,
    zernioCommentId: row.zernio_comment_id,
    zernioPostId: row.zernio_post_id,
    zernioReviewId: row.zernio_review_id,
    account: {
      zernioAccountId: row.social_accounts.zernio_account_id,
      status: row.social_accounts.status,
    },
    conversation: row.conversations
      ? {
          zernioConversationId: row.conversations.zernio_conversation_id,
          lastCustomerMessageAt: last,
        }
      : null,
    input: {
      item: { kind: row.kind },
      classification: { category: row.category, confidence: Number(row.confidence) },
      tenant: {
        subscriptionStatus: row.tenants.subscription_status,
        confidenceThreshold: Number(row.tenants.confidence_threshold),
        repliesPaused: row.tenants.replies_paused,
      },
      account: { status: row.social_accounts.status },
      autonomyMode: (setting?.mode as AutonomyMode | undefined) ?? "off",
      lastCustomerMessageAt: last ? new Date(last) : null,
    },
    draft: d
      ? {
          id: d.id,
          message: d.edited_body ?? d.body,
          status: d.status,
          needsHuman: d.needs_human,
          approvedByOwner: d.decided_by !== null,
          writtenByOwner: d.owner_written,
          idempotencyKey: d.idempotency_key,
          sendAttemptedAt: d.send_attempted_at,
          zernioReplyId: d.zernio_reply_id,
          replyVia: row.kind === "comment" && d.reply_via === "dm" ? "dm" : "public",
        }
      : null,
  };
}

const normalize = (text: string | null) => (text ?? "").replace(/\s+/g, " ").trim();

/** The reply's provider id if it is already on the platform, else null (inconclusive). */
async function findDelivered(
  social: SocialProvider,
  c: SendContext,
  message: string,
  attemptedAt: Date,
  signal: AbortSignal,
): Promise<string | null> {
  const wanted = normalize(message);
  if (c.kind === "review") {
    // A review has at most one reply from the Page: if it has one now, ours went through.
    const reviews = await social.listReviews({ accountId: c.account.zernioAccountId, signal });
    const review = reviews.find((r) => r.id === c.zernioReviewId);
    return review?.hasReply ? `review_reply:${c.zernioReviewId}` : null;
  }
  if (c.kind === "comment") {
    const replies = await social.listCommentReplies({
      accountId: c.account.zernioAccountId,
      postId: c.zernioPostId!,
      commentId: c.zernioCommentId!,
      signal,
    });
    return replies.find((r) => r.fromOwner && normalize(r.text) === wanted)?.id ?? null;
  }
  const messages = await social.listConversationMessages({
    accountId: c.account.zernioAccountId,
    conversationId: c.conversation!.zernioConversationId,
    signal,
  });
  const since = attemptedAt.getTime() - RECONCILE_SKEW_MS;
  return (
    messages.find(
      (m) =>
        m.direction === "outgoing" &&
        normalize(m.text) === wanted &&
        new Date(m.createdAt).getTime() >= since,
    )?.id ?? null
  );
}

export function createSendStep(opts: { social: () => SocialProvider; now?: () => Date }): Step {
  return async (item, ctx): Promise<StepResult> => {
    const { db } = ctx;
    const now = opts.now?.() ?? new Date();
    const c = await loadSendContext(db, item.id);
    const draft = c.draft;

    // Zernio answered but the status change was lost: finish without sending again.
    if (draft?.status === "sent") {
      return { event: "sent", details: { draftId: draft.id, recovered: true } };
    }
    if (!draft) return { event: "escalate", details: { sendReason: "no_approved_draft" } };

    // Rule 6, at the moment of sending: the DM window may have closed or the account dropped
    // while the draft waited.
    const decision = policy({
      ...c.input,
      draft: {
        needsHuman: draft.needsHuman,
        approvedByOwner: draft.approvedByOwner,
        writtenByOwner: draft.writtenByOwner,
      },
      now,
    });
    if (decision.decision !== "send") {
      if (decision.decision === "approve") {
        // Auto-approved, then the owner switched the category to approve or paused all replies:
        // their call now.
        await db
          .from("drafts")
          .update({ status: "pending", decided_at: null, send_attempted_at: null })
          .eq("id", draft.id)
          .eq("status", "approved");
        return {
          event: "await_approval",
          details: { draftId: draft.id, policyReason: decision.reason },
        };
      }
      return {
        event: "escalate",
        details: { draftId: draft.id, decision: decision.decision, policyReason: decision.reason },
      };
    }

    // T27: the owner paused all replies. Hold the approved reply without counting an attempt;
    // it goes out on the first run after they turn replies back on.
    if (c.input.tenant.repliesPaused) throw new RetryLaterError(REPLIES_PAUSED_RETRY_SECONDS);

    // T19: Zernio paused for billing (every call 402s). Wait without counting an attempt and
    // without escalating; the job route probes and clears the pause.
    if (await getPlatformPause(db)) throw new RetryLaterError(PLATFORM_PAUSE_RETRY_SECONDS);
    const pausedNow = async (error: unknown) => {
      if (!isPlatformPaused(error)) return;
      await recordPlatformPause(db);
      throw new RetryLaterError(PLATFORM_PAUSE_RETRY_SECONDS);
    };

    const social = opts.social();
    /** A definite refusal (bad request, permissions, deleted comment): retrying won't help. */
    const rejected = async (status?: number, code?: string): Promise<StepResult> => {
      await db
        .from("drafts")
        .update({ status: "failed", send_attempted_at: null })
        .eq("id", draft.id);
      await writeAudit(db, {
        tenantId: c.tenantId,
        itemId: item.id,
        action: "send_failed",
        actor: "system",
        details: { draftId: draft.id, status: status ?? null, code: code ?? null },
      });
      Sentry.captureMessage("reply send rejected", {
        extra: { itemId: item.id, draftId: draft.id, status, code },
      });
      return {
        event: "escalate",
        details: { draftId: draft.id, sendReason: "send_rejected", status: status ?? null },
      };
    };
    const markSent = async (providerId: string, reconciled: boolean): Promise<StepResult> => {
      const { error } = await db
        .from("drafts")
        .update({
          status: "sent",
          sent_at: now.toISOString(),
          zernio_reply_id: providerId,
          send_attempted_at: null,
        })
        .eq("id", draft.id);
      if (error) throw new Error(`send: recording the sent reply failed: ${error.message}`);
      await writeAudit(db, {
        tenantId: c.tenantId,
        itemId: item.id,
        action: "reply_sent",
        actor: "system",
        details: {
          draftId: draft.id,
          kind: c.kind,
          replyVia: draft.replyVia,
          providerId,
          reconciled,
        },
      });
      return { event: "sent", details: { draftId: draft.id, providerId, reconciled } };
    };

    // T41: a comment answered in DM. Meta allows one private reply per comment, within 7 days.
    if (draft.replyVia === "dm") {
      const unavailable = async (
        sendReason: "private_reply_used" | "private_reply_expired",
      ): Promise<StepResult> => {
        await db
          .from("drafts")
          .update({ status: "failed", send_attempted_at: null })
          .eq("id", draft.id);
        await writeAudit(db, {
          tenantId: c.tenantId,
          itemId: item.id,
          action: "send_failed",
          actor: "system",
          details: { draftId: draft.id, replyVia: "dm", reason: sendReason },
        });
        return { event: "escalate", details: { draftId: draft.id, sendReason } };
      };
      const retry = !!draft.sendAttemptedAt;
      if (!retry && now >= privateReplyClosesAt(c.receivedAt)) {
        return unavailable("private_reply_expired");
      }
      if (!retry) {
        const { error } = await db
          .from("drafts")
          .update({ send_attempted_at: now.toISOString() })
          .eq("id", draft.id);
        if (error) throw new Error(`send: marking the attempt failed: ${error.message}`);
      }
      // Rule 7: a private reply takes no idempotency key, and its DM thread isn't known until it
      // exists. Meta's one-per-comment limit is the guard instead: after an unknown outcome,
      // sending again either delivers it once or answers "consumed", which means the earlier
      // attempt went through.
      try {
        const { providerMessageId } = await social.sendPrivateReply({
          accountId: c.account.zernioAccountId,
          postId: c.zernioPostId!,
          commentId: c.zernioCommentId!,
          message: draft.message,
          signal: ctx.callSignal(),
        });
        return markSent(providerMessageId, false);
      } catch (error) {
        if (!(error instanceof SocialProviderError)) throw error;
        if (error.details.privateReplyConsumed) {
          return retry
            ? markSent("private_reply_consumed", true)
            : unavailable("private_reply_used");
        }
        const { status, code, ambiguous, retryAfterSeconds } = error.details;
        if (isPlatformPaused(error) || status === 429) {
          // Not delivered: no attempt counted, nothing to reconcile.
          await db.from("drafts").update({ send_attempted_at: null }).eq("id", draft.id);
          await pausedNow(error);
          throw new RetryLaterError(retryAfterSeconds ?? RATE_LIMIT_FALLBACK_SECONDS);
        }
        if (!ambiguous) return rejected(status, code);
        throw error;
      }
    }

    // Rule 7: an earlier attempt may have gone through. Look before sending again; if the
    // platform doesn't show it (Zernio: an empty list is inconclusive), the resend reuses the
    // idempotency key, so a delivered first request is replayed rather than repeated.
    if (draft.sendAttemptedAt) {
      const found = await findDelivered(
        social,
        c,
        draft.message,
        new Date(draft.sendAttemptedAt),
        ctx.callSignal(),
      ).catch(async (error: unknown) => {
        await pausedNow(error);
        throw error;
      });
      if (found) return markSent(found, true);
    } else {
      const { error } = await db
        .from("drafts")
        .update({ send_attempted_at: now.toISOString() })
        .eq("id", draft.id);
      if (error) throw new Error(`send: marking the attempt failed: ${error.message}`);
    }

    const clearAttempt = () =>
      db.from("drafts").update({ send_attempted_at: null }).eq("id", draft.id);

    let providerId: string;
    try {
      providerId =
        c.kind === "review"
          ? (
              await social.replyToReview({
                accountId: c.account.zernioAccountId,
                reviewId: c.zernioReviewId!,
                message: draft.message,
                idempotencyKey: draft.idempotencyKey,
                signal: ctx.callSignal(),
              })
            ).providerReplyId
          : c.kind === "comment"
            ? (
                await social.replyToComment({
                  accountId: c.account.zernioAccountId,
                  postId: c.zernioPostId!,
                  commentId: c.zernioCommentId!,
                  message: draft.message,
                  idempotencyKey: draft.idempotencyKey,
                  signal: ctx.callSignal(),
                })
              ).providerReplyId
            : (
                await social.sendDm({
                  accountId: c.account.zernioAccountId,
                  conversationId: c.conversation!.zernioConversationId,
                  message: draft.message,
                  idempotencyKey: draft.idempotencyKey,
                  signal: ctx.callSignal(),
                })
              ).providerMessageId;
    } catch (error) {
      if (!(error instanceof SocialProviderError)) throw error;
      if (isPlatformPaused(error)) {
        // 402: nothing was delivered. Not the item's fault: no attempt, no escalation.
        await clearAttempt();
        await pausedNow(error);
      }
      const { status, code, ambiguous, retryAfterSeconds } = error.details;
      if (status === 429) {
        // Not delivered. Wait for Retry-After / X-RateLimit-Reset; no attempt counted (§14).
        await clearAttempt();
        throw new RetryLaterError(retryAfterSeconds ?? RATE_LIMIT_FALLBACK_SECONDS);
      }
      if (status === 409) {
        // The same key is still in flight: the first request may yet succeed. Keep the mark.
        throw new RetryLaterError(retryAfterSeconds ?? IN_FLIGHT_RETRY_SECONDS);
      }
      if (!ambiguous) return rejected(status, code);
      // Ambiguous: counted as an attempt and retried; the next attempt reconciles first.
      throw error;
    }
    return markSent(providerId, false);
  };
}
