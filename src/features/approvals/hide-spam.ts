import { writeAudit } from "@/lib/audit";
import type { ServiceClient } from "@/lib/supabase/service";
import { SocialProviderError, type SocialProvider } from "@/lib/social/types";

// T40: hiding a spam comment on its post (Instagram/Facebook), from the job (auto-hide) or the
// owner. Never changes inbound_items.status (rule 5): callers move the item themselves.

export type HideOutcome =
  /** Hidden (or unhidden) on the platform. */
  | "done"
  /** The platform says the comment no longer exists: nothing to hide. */
  | "gone"
  /** Didn't work this time (network, 5xx, rate limit, auth): try again later. */
  | "failed";

/** Pure: what a provider error means for a hide or unhide. */
export function hideErrorOutcome(error: unknown): Exclude<HideOutcome, "done"> {
  if (
    error instanceof SocialProviderError &&
    error.details.status === 400 &&
    error.details.code === "PLATFORM_API_ERROR"
  ) {
    return "gone";
  }
  return "failed";
}

interface CommentRef {
  id: string;
  tenantId: string;
  hiddenAt: string | null;
  accountId: string;
  postId: string;
  commentId: string;
}

async function loadComment(
  db: ServiceClient,
  tenantId: string,
  itemId: string,
): Promise<CommentRef | null> {
  const { data } = await db
    .from("inbound_items")
    .select(
      "id, tenant_id, kind, zernio_post_id, zernio_comment_id, hidden_on_platform_at, " +
        "social_accounts!inner (zernio_account_id)",
    )
    .eq("id", itemId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const row = data as unknown as {
    id: string;
    tenant_id: string;
    kind: string;
    zernio_post_id: string | null;
    zernio_comment_id: string | null;
    hidden_on_platform_at: string | null;
    social_accounts: { zernio_account_id: string };
  } | null;
  if (!row || row.kind !== "comment" || !row.zernio_post_id || !row.zernio_comment_id) return null;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    hiddenAt: row.hidden_on_platform_at,
    accountId: row.social_accounts.zernio_account_id,
    postId: row.zernio_post_id,
    commentId: row.zernio_comment_id,
  };
}

/**
 * Hides (or unhides) one comment on the platform and records it: `hidden_on_platform_at` and a
 * `comment_hidden` / `comment_unhidden` audit row with the outcome. `actor` is the owner's user
 * id or "system" (auto-hide). Returns null when the item isn't a comment Waggle can hide.
 */
export async function setCommentHidden(
  deps: { db: ServiceClient; social: SocialProvider; now?: () => Date },
  input: { tenantId: string; itemId: string; actor: string; hidden: boolean; signal?: AbortSignal },
): Promise<HideOutcome | null> {
  const { db, social } = deps;
  const comment = await loadComment(db, input.tenantId, input.itemId);
  if (!comment) return null;
  // Already in the state asked for: nothing to call (a double click, a retried job).
  if (input.hidden === (comment.hiddenAt !== null)) return "done";

  const call = input.hidden ? social.hideComment : social.unhideComment;
  let outcome: HideOutcome = "done";
  try {
    await call.call(social, {
      accountId: comment.accountId,
      postId: comment.postId,
      commentId: comment.commentId,
      signal: input.signal,
    });
  } catch (error) {
    outcome = hideErrorOutcome(error);
  }

  if (outcome === "done") {
    const at = input.hidden ? (deps.now?.() ?? new Date()).toISOString() : null;
    const { error } = await db
      .from("inbound_items")
      .update({ hidden_on_platform_at: at })
      .eq("id", comment.id);
    if (error) throw new Error(`hide: storing the hidden state failed: ${error.message}`);
  }
  await writeAudit(db, {
    tenantId: comment.tenantId,
    itemId: comment.id,
    action: input.hidden ? "comment_hidden" : "comment_unhidden",
    actor: input.actor,
    details: { outcome },
  });
  return outcome;
}
