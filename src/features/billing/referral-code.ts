// Referral links (23 November 2026). Pure.

/** Same shape gowaggle.ai passes along as ?ref= (gowaggle repo, app/lib/referral.ts). */
export const REF_PATTERN = /^[a-z0-9]{8}$/;

/** The cookie the sign-up page keeps the code in, so Google sign-up counts too. 30 days. */
export const REF_COOKIE = "waggle_ref";
export const REF_COOKIE_MAX_AGE_S = 30 * 24 * 60 * 60;

/** A referral only counts for an organization made this recently (a brand-new sign-up). */
export const NEW_ORG_WINDOW_MS = 24 * 60 * 60 * 1000;

// No 0/o, 1/l/i: easy to read aloud and type.
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

/** Pure: a code from random bytes (crypto.getRandomValues in the caller). */
export function codeFromBytes(bytes: Uint8Array): string {
  if (bytes.length < 8) throw new Error("need 8 bytes");
  let out = "";
  for (let i = 0; i < 8; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

/** Pure: a cleaned code, or null when it isn't one. */
export function parseRefCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const code = raw.trim().toLowerCase();
  return REF_PATTERN.test(code) ? code : null;
}

/** Pure: the link an owner shares. Straight to sign-up: the fewest pages for the friend. */
export function referralLink(appUrl: string, code: string): string {
  return `${appUrl.replace(/\/+$/, "")}/signup?ref=${code}`;
}

/** Pure: whether an organization made at `createdAt` is new enough to be credited to a referral. */
export function isNewOrg(createdAt: string | null | undefined, now: Date): boolean {
  if (!createdAt) return false;
  const made = Date.parse(createdAt);
  if (Number.isNaN(made)) return false;
  const age = now.getTime() - made;
  return age >= 0 && age <= NEW_ORG_WINDOW_MS;
}

/**
 * Pure: whether the friend's plan is part of the offer (Pricing Bible, 24 Nov): Solo or Team
 * (ids "solo" and "business"), taken with a card at checkout. Business is a custom price set on a
 * call, never a checkout, so it never earns the referrer a month.
 */
export function referralPlanQualifies(plan: string | null | undefined): boolean {
  return plan === "solo" || plan === "business";
}

/**
 * Pure: whether a paid invoice is the friend's first real payment, the moment the referrer earns
 * the month. A $0 invoice (the free month itself) doesn't count; top-ups don't count.
 */
export function earnsReferralReward(invoice: {
  amount_paid: number;
  billing_reason: string | null;
  metadata?: Record<string, string> | null;
}): boolean {
  if (invoice.amount_paid <= 0) return false;
  const kind = invoice.metadata?.kind;
  if (kind === "auto_top_up" || kind === "top_up_now") return false;
  return (
    invoice.billing_reason === "subscription_cycle" ||
    invoice.billing_reason === "subscription_create" ||
    invoice.billing_reason === "subscription_update"
  );
}
