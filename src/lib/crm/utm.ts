// First-touch UTM (18 Nov): the campaign a person first came from, kept in a cookie by the proxy
// and sent to HighLevel at sign-up, never overwriting UTMs the contact already has (the waitlist
// on gowaggle.ai may have set them first). Pure, no I/O.

/** The cookie holding the first visit's campaign (90 days, first one wins). */
export const UTM_COOKIE = "waggle_utm";
export const UTM_COOKIE_MAX_AGE = 90 * 24 * 60 * 60;

/** URL parameter → HighLevel contact field (plain key; the sub-account already has these). */
export const UTM_FIELDS = {
  utm_source: "utm_source",
  utm_medium: "utm_medium",
  utm_campaign: "utm_campaign",
  utm_content: "utm_content",
  ref: "ref_code",
} as const;

export type Utm = Partial<Record<(typeof UTM_FIELDS)[keyof typeof UTM_FIELDS], string>>;

const clean = (v: string | null) => (v ?? "").trim().slice(0, 200);

/** The campaign in a URL's parameters, or null when it has none. */
export function utmFromParams(params: URLSearchParams): Utm | null {
  const out: Utm = {};
  for (const [param, field] of Object.entries(UTM_FIELDS)) {
    const v = clean(params.get(param));
    if (v) out[field] = v;
  }
  return Object.keys(out).length ? out : null;
}

/** The cookie's campaign, or null when it's missing or not ours. */
export function parseUtmCookie(raw: string | undefined | null): Utm | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Record<string, unknown>;
    const out: Utm = {};
    for (const field of Object.values(UTM_FIELDS)) {
      if (typeof v[field] === "string" && v[field]) out[field] = clean(v[field] as string);
    }
    return Object.keys(out).length ? out : null;
  } catch {
    return null;
  }
}

/**
 * What to send: the visit's UTMs only when the contact has none yet (first touch wins, field by
 * field would mix two campaigns, so all or nothing).
 */
export function firstTouchUtm(visit: Utm | null, contact: Record<string, string>): Utm {
  if (!visit) return {};
  const hasAny = Object.values(UTM_FIELDS).some((f) => (contact[f] ?? "").trim() !== "");
  return hasAny ? {} : visit;
}
