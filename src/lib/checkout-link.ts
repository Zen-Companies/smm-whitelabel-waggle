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

// ── The site's plan cards (board "From the site's plan card to that plan in the app", 25 Nov) ──
// gowaggle.ai's Solo and Team "Start free →" open /signup?plan=solo (or plan=team). The plan rides
// through sign-up to setup's first page, which starts Checkout: account → Checkout → setup.

/** Setup's first page, where a new owner lands after sign-up. */
export const SIGNUP_LANDING = "/welcome";

/** `/welcome?start=solo`: setup's first page, starting Checkout for the plan picked on the site. */
export function signupStartPath(start: StartPlan): string {
  return `${SIGNUP_LANDING}?start=${start}`;
}

/** Whether a sign-in `next` (Google's sign-up) is that path, exactly. */
export function isSignupStartPath(next: string): boolean {
  return /^\/welcome\?start=(solo|team)$/.test(next);
}

/** The plan in Google's sign-up `next` (`/welcome?start=team` → "team"), else null. */
export function signupStartOf(next: string): StartPlan | null {
  return isSignupStartPath(next) ? parseStartParam(next.slice(next.indexOf("=") + 1)) : null;
}

/** Where sign-up goes once the account exists: setup's first page, with the plan when one rode in. */
export function afterSignupPath(start: StartPlan | null): string {
  return start ? signupStartPath(start) : SIGNUP_LANDING;
}

/**
 * The sign-up page with another plan, or with none (`null`: "Start on Free instead"). The
 * page's other parameters (a friend's `ref`, utm) stay as they were.
 */
export function signupPlanHref(
  params: Record<string, string | string[] | undefined>,
  start: StartPlan | null,
): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (k === "plan") continue;
    const value = Array.isArray(v) ? v[0] : v;
    if (typeof value === "string") q.set(k, value);
  }
  if (start) q.set("plan", start);
  const s = q.toString();
  return s ? `/signup?${s}` : "/signup";
}
