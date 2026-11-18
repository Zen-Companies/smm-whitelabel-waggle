// Ad conversion tags for the app (Jason, 17 Nov: the paid Waggle ads must see who starts a trial).
// gowaggle.ai (the public site) loads Meta and TikTok on every page; the app does NOT. It loads
// them only for the two moments an ad needs to learn from, and never on pages with customer
// messages:
//   - CompleteRegistration: a new owner's first look at /welcome after signing up.
//   - StartTrial: Stripe's return from a first-time plan checkout, checked with Stripe first.
// Pure helpers only; the browser part is conversion-tag.tsx.

// Same IDs as gowaggle.ai (gowaggle repo, app/lib/pixels.ts), so both halves of the funnel land
// in one dataset per platform. These IDs are public by design: they are in every page's source.
export const META_PIXEL_ID = "1798875508046249"; // Meta dataset "Waggle - gowaggle.ai"
export const TIKTOK_PIXEL_ID = "DBSPBLRC77UC811K6NNG"; // TikTok "Waggle - gowaggle.ai" (Zen Community Services)
export const TIKTOK_ADS_PIXEL_ID = "DBU583JC77U5KA7QAP60"; // TikTok, owned by the Zen Companies Inc_adv ad account

/** Hosts where the tags run. Anywhere else (local, staging) only after ?pixels=on in that tab. */
export const LIVE_HOSTS = ["app.gowaggle.ai"];

/** The "Your privacy choices" opt-out. A cookie on .gowaggle.ai so the site's choice reaches the app. */
export const OPT_OUT_COOKIE = "waggle_no_ads";

export type ConversionEvent = "CompleteRegistration" | "StartTrial";

/** A registration counts only on the first visits to /welcome, not weeks later. */
export const REGISTRATION_WINDOW_MS = 48 * 60 * 60 * 1000;

/** Pure: whether a login made at `createdAt` is still new enough to count as a registration. */
export function isNewRegistration(createdAt: string | undefined, now: Date): boolean {
  if (!createdAt) return false;
  const made = Date.parse(createdAt);
  if (Number.isNaN(made)) return false;
  const age = now.getTime() - made;
  return age >= 0 && age <= REGISTRATION_WINDOW_MS;
}

/**
 * Pure: the event id. Stable for the same signup or checkout, so a reload, a second tab, or a
 * server-side copy added later is counted once (Meta and TikTok drop repeats of an event id).
 */
export function conversionEventId(event: ConversionEvent, key: string): string {
  return `${event === "StartTrial" ? "trial" : "reg"}-${key}`;
}

/** Pure: an email as Meta and TikTok want it before hashing: trimmed, lower case. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Pure: whether a cookie header has the ad opt-out set. */
export function cookieOptsOut(cookieHeader: string): boolean {
  return cookieHeader
    .split(";")
    .map((c) => c.trim())
    .some((c) => c === `${OPT_OUT_COOKIE}=1`);
}
