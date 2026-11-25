import type { PlanId } from "./plans";
import type { ReplyLimitLevel } from "./reply-limit";
import { isOfferReason, upgradeHref, type OfferReason } from "./upgrade";

// Which plan banner shows on top of every dashboard page, and which pop-up opens (Walter's flow,
// 20 Nov; decision 9). Pure: the browser-storage reads happen in the component.

/** "Try Solo free" comes back this many days after × (Walter: "a gentle nudge every few days"). */
export const NUDGE_EVERY_DAYS = 3;

/** Pure: whether the nudge is due, from when × last hid it (ms since epoch, as stored). */
export function nudgeDue(hiddenAt: string | null, now: number): boolean {
  const at = hiddenAt ? Number(hiddenAt) : NaN;
  return !Number.isFinite(at) || now - at >= NUDGE_EVERY_DAYS * 86_400_000;
}

/**
 * Pure: the banner on every dashboard page. Out of replies on any plan: the out banner (it stays
 * until replies come back). Free with replies left and below the warning: "Try Solo free" (at
 * the warning, Today's running-low notice says it instead). Nothing while limits are off.
 */
export function billingBanner(input: {
  limitsOn: boolean;
  plan: PlanId | null;
  level: ReplyLimitLevel | null;
}): "out" | "nudge" | null {
  if (!input.limitsOn || !input.plan || !input.level) return null;
  if (input.level === "reached") return "out";
  if (input.plan === "free" && input.level === "ok") return "nudge";
  return null;
}

export type Popup =
  { kind: "upgrade"; reason: OfferReason } | { kind: "welcome" } | { kind: "out" } | null;

/**
 * Pure: the pop-up to open on this page. A link's `?upgrade=<reason>` first (not on Your plan,
 * whose own upgrade screen says it, unless `onPlanToo`: Free's pop-ups open everywhere, 23 Nov),
 * then `?welcome=1` (once per organization in this browser), then out of replies (once per
 * browser session).
 */
export function popupFor(input: {
  path: string;
  upgrade: string | null;
  welcome: string | null;
  welcomeSeen: boolean;
  outDue: boolean;
  onPlanToo?: boolean;
}): Popup {
  if (isOfferReason(input.upgrade) && (input.onPlanToo || input.path !== "/plan")) {
    return { kind: "upgrade", reason: input.upgrade };
  }
  if (input.welcome === "1" && !input.welcomeSeen) return { kind: "welcome" };
  if (input.outDue) return { kind: "out" };
  return null;
}

/**
 * Pure: the closed pop-up's address to remember on `urlKey` (the page with its query). A pop-up
 * opened from the address stays closed only while the address is still the one it was closed on;
 * closing drops its parameters, and once the address moves on it's forgotten, so a later link to
 * the same `?upgrade=` opens it again (fix 25 Nov: the Black Friday bar's "Choose a plan" did
 * nothing once the pop-up had been closed on that page).
 */
export function rememberClosed(closedAt: string | null, urlKey: string): string | null {
  return closedAt === urlKey ? closedAt : null;
}

/**
 * Pure: where a promotion bar's link goes (fix 25 Nov). "plan-popup": the upgrade pop-up over
 * this page when it can open here (an Owner on Free: the first-month-free Try Solo version),
 * otherwise Your plan. Any other link is a path, as staff set it.
 */
export function promoBarHref(input: {
  link: string;
  /** This page with its query ("/today?tab=new"). */
  here: string;
  /** The pop-up opens for this viewer: an Owner whose organization is on Free. */
  popup: boolean;
}): string {
  if (input.link !== "plan-popup") return input.link;
  return input.popup ? upgradeHref("nudge", input.here) : "/plan";
}

/** Browser storage keys (conveniences only: a cleared browser just shows them again). */
export const STORAGE = {
  nudgeHiddenAt: "waggle.soloNudge.hiddenAt",
  welcomeSeen: (orgId: string) => `waggle.welcome.seen.${orgId}`,
  /** Session storage: the out-of-replies pop-up was shown this session for this month. */
  outShown: (orgId: string, resetsAt: string) => `waggle.out.shown.${orgId}.${resetsAt}`,
} as const;

/**
 * Pure: where a checkout started on Your plan itself comes back to (its plan cards, HighLevel's
 * /plan?start=): Your plan with the success pop-up of the chosen plan, which confirms the
 * checkout with Stripe and stores it, so the plan shows without a reload (QA, 25 Nov). Stripe's
 * `checkout=done&session_id=` is added after the trailing "&".
 */
export function planPageReturn(plan: "solo" | "team" | "business"): string {
  return `/plan?upgrade=${successReason(plan)}&`;
}

/**
 * Pure: the pop-up reason whose success state names the plan bought. Careful: Team is id
 * `business` (the ids are swapped), so only Solo is "nudge".
 */
export function successReason(plan: "solo" | "team" | "business"): "nudge" | "team" {
  return plan === "solo" ? "nudge" : "team";
}
