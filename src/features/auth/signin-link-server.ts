import "server-only";
import * as Sentry from "@sentry/nextjs";
import type { ServiceClient } from "@/lib/supabase/service";
import {
  mayCreateSigninLink,
  SIGNIN_LINK_TTL_MS,
  signinLinkExpiresAt,
  signinLinkNext,
  signinLinkUrl,
} from "./signin-link";

// One-time sign-in link, server side (see signin-link.ts). The token only ever travels in the
// link itself: never stored, logged or audited (ids and times only).

async function audit(
  db: ServiceClient,
  organizationId: string | null,
  action: string,
  actor: string,
  details: Record<string, string>,
) {
  if (!organizationId) return;
  const { error } = await db
    .from("organization_audit")
    .insert({ organization_id: organizationId, action, actor, details });
  if (error) throw new Error(`organization_audit insert failed (${action}): ${error.message}`);
}

/**
 * Makes a link that signs this person in once, within 10 minutes, on the given setup screen.
 * Returns null when it can't (unconfirmed email, too many links, Supabase said no): the caller
 * then shares the plain page address, and the person signs in again there.
 */
export async function createSigninLink(
  db: ServiceClient,
  input: {
    userId: string;
    email: string | undefined;
    emailConfirmed: boolean;
    organizationId: string | null;
    next: string | null;
    origin: string;
    now?: Date;
  },
): Promise<{ url: string; expiresAt: string } | null> {
  if (!input.email || !input.emailConfirmed) return null;
  const now = input.now ?? new Date();
  try {
    const { count } = await db
      .from("signin_links")
      .select("id", { count: "exact", head: true })
      .eq("user_id", input.userId)
      .gte("created_at", new Date(now.getTime() - SIGNIN_LINK_TTL_MS).toISOString());
    if (!mayCreateSigninLink(count ?? 0)) return null;

    const { data: link, error: linkError } = await db.auth.admin.generateLink({
      type: "magiclink",
      email: input.email,
    });
    const tokenHash = link?.properties?.hashed_token;
    // Bound to this user: Supabase made the token for this email's login.
    if (linkError || !tokenHash || link.user?.id !== input.userId) return null;

    const next = signinLinkNext(input.next);
    const expiresAt = signinLinkExpiresAt(now).toISOString();
    const { data: row, error } = await db
      .from("signin_links")
      .insert({
        user_id: input.userId,
        organization_id: input.organizationId,
        next,
        created_at: now.toISOString(),
        expires_at: expiresAt,
      })
      .select("id")
      .single();
    if (error || !row) throw new Error(`signin_links insert failed: ${error?.message}`);
    await audit(db, input.organizationId, "signin_link_created", input.userId, {
      link_id: row.id,
      next,
      expires_at: expiresAt,
    });
    return { url: signinLinkUrl(input.origin, row.id, tokenHash), expiresAt };
  } catch (err) {
    Sentry.captureException(err, { tags: { area: "signin-link" } });
    return null;
  }
}

/**
 * Redeems a link: marks its row used (only if unused and not expired, in one update, so two taps
 * can't both pass), then signs in with Supabase's token. Returns where to land, or null.
 * `verify` is the request's own Supabase client's verifyOtp (it sets the session cookies).
 */
export async function redeemSigninLink(
  db: ServiceClient,
  input: { id: string; tokenHash: string; now?: Date },
  verify: (tokenHash: string) => Promise<{ userId: string | null }>,
  signOut: () => Promise<void>,
): Promise<string | null> {
  const now = (input.now ?? new Date()).toISOString();
  const { data: row } = await db
    .from("signin_links")
    .update({ used_at: now })
    .eq("id", input.id)
    .is("used_at", null)
    .gt("expires_at", now)
    .select("user_id, organization_id, next")
    .maybeSingle();
  if (!row) return null;
  const { userId } = await verify(input.tokenHash);
  if (!userId) return null;
  if (userId !== row.user_id) {
    // A token for someone else: never leave that session behind.
    await signOut();
    return null;
  }
  try {
    await audit(db, row.organization_id, "signin_link_used", userId, { link_id: input.id });
  } catch (err) {
    Sentry.captureException(err, { tags: { area: "signin-link" } });
  }
  return signinLinkNext(row.next);
}
