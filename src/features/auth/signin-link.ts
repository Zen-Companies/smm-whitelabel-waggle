// One-time sign-in link (Connect fix 2, approved 24 Nov): moving from Instagram's or Facebook's
// own browser to Safari or Chrome (or scanning the desktop QR code) keeps the person signed in.
// The link carries Supabase's own magic-link token hash (admin generateLink; verified with
// verifyOtp, single-use by Supabase) plus the id of a signin_links row that limits it to
// 10 minutes, one use, one user and one setup screen. No crypto of our own. Pure, tested.

import { z } from "zod";

/** A link works for 10 minutes. */
export const SIGNIN_LINK_TTL_MS = 10 * 60 * 1000;
/** At most this many links per person per 10 minutes (a page refresh makes one). */
export const SIGNIN_LINK_MAX_PER_WINDOW = 12;

/** Pure: when a link made now stops working. */
export function signinLinkExpiresAt(now: Date): Date {
  return new Date(now.getTime() + SIGNIN_LINK_TTL_MS);
}

/** Pure: a stored link can still sign someone in (unused and not expired). */
export function isSigninLinkUsable(
  row: { expires_at: string; used_at: string | null },
  now: Date,
): boolean {
  if (row.used_at) return false;
  const expires = Date.parse(row.expires_at);
  return Number.isFinite(expires) && expires > now.getTime();
}

/** Pure: whether another link may be made, given how many were made in the last 10 minutes. */
export function mayCreateSigninLink(recent: number): boolean {
  return recent < SIGNIN_LINK_MAX_PER_WINDOW;
}

const BEFORE = new Set(["instagram", "facebook"]);

/**
 * Pure: the setup screen the link lands on. Only /welcome (setup step 1, Connect) with its own
 * view params (`all=1`, `before=instagram|facebook`); anything else lands on /welcome. Never an
 * outside address (no open redirect), never a connect's error params (they belong to that try).
 */
export function signinLinkNext(next: string | null | undefined): string {
  if (typeof next !== "string" || !next.startsWith("/welcome")) return "/welcome";
  let u: URL;
  try {
    u = new URL(next, "https://waggle.invalid");
  } catch {
    return "/welcome";
  }
  if (u.origin !== "https://waggle.invalid" || u.pathname !== "/welcome") return "/welcome";
  const keep = new URLSearchParams();
  if (u.searchParams.get("all") === "1") keep.set("all", "1");
  const before = u.searchParams.get("before");
  if (before && BEFORE.has(before)) keep.set("before", before);
  const q = keep.toString();
  return q ? `/welcome?${q}` : "/welcome";
}

/** Pure: the address a link opens (our handoff route on this site). */
export function signinLinkUrl(origin: string, id: string, tokenHash: string): string {
  const u = new URL("/auth/handoff", origin);
  u.searchParams.set("id", id);
  u.searchParams.set("token_hash", tokenHash);
  return u.toString();
}

/** The handoff route's query, checked before anything is looked up. */
export const handoffParams = z.object({
  id: z.uuid(),
  token_hash: z.string().regex(/^[A-Za-z0-9_-]{16,200}$/),
});
