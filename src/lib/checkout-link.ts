// The checkout deep link for HighLevel's upgrade buttons (Walter, 25 Nov):
// app.gowaggle.ai/plan?start=solo (or start=team). Pure, no I/O: the proxy (sign-in first), sign-in
// (back to the link) and Your plan (start Checkout) all read it. Never Business (a custom price,
// set on a call).

export type StartPlan = "solo" | "team";

/** HighLevel's plan word → Waggle's plan id. Careful: Team is id `business` (the ids are swapped). */
export const START_PLAN_ID = { solo: "solo", team: "business" } as const;

export const START_PATH = "/plan";

/** `start=solo` / `start=team` (any case), else null. Business or anything else: null. */
export function parseStartParam(value: unknown): StartPlan | null {
  const v = Array.isArray(value) ? value[0] : value;
  if (typeof v !== "string") return null;
  const s = v.trim().toLowerCase();
  return s === "solo" || s === "team" ? s : null;
}

/** The link itself, as a path: `/plan?start=solo`. */
export function startCheckoutPath(start: StartPlan): string {
  return `${START_PATH}?start=${start}`;
}

/** Whether a sign-in `next` is the deep link (only the exact path, nothing added). */
export function isStartCheckoutPath(next: string): boolean {
  return /^\/plan\?start=(solo|team)$/.test(next);
}

/**
 * Signed out on the deep link: sign in first, then back to the same link. Returns the sign-in
 * path, or null when this isn't the deep link.
 */
export function loginForStart(pathname: string, params: URLSearchParams): string | null {
  if (pathname !== START_PATH) return null;
  const start = parseStartParam(params.get("start"));
  if (!start) return null;
  return `/login?next=${encodeURIComponent(startCheckoutPath(start))}`;
}
