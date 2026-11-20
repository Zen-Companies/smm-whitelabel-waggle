import { EXTRAS, PLANS, type PaidPlanId, type Plan, type PlanId } from "./plans";

// Every Free limit pushes to the first plan that lifts it (Jason and Febron, 19-20 Nov; canvas
// "Free plan, no card" → "Every Free limit, and what it says"). Each one says what it unlocks and
// the cheapest plan that has it: "To …, upgrade to Solo or above" (Team for team features).
// Numbers come from the plans as staff set them on Staff → Plans (decision 10, 20 Nov), never
// typed into the copy. Pure.

export const UPGRADE_REASONS = [
  "accounts",
  "replies",
  "top_up",
  "extra_account",
  "auto_reply",
  "idle",
  "team",
  "follow_ups",
  "leads",
  "brands",
] as const;
export type UpgradeReason = (typeof UPGRADE_REASONS)[number];

export function isUpgradeReason(v: unknown): v is UpgradeReason {
  return typeof v === "string" && (UPGRADE_REASONS as readonly string[]).includes(v);
}

export interface UpgradeCopy {
  /** The upgrade screen's title: which limit was hit. */
  title: string;
  /** One line on what's happening and what the next plan adds. */
  why: string;
  /** "To <todo>, upgrade to <plan> or above." */
  todo: string;
  /** The cheapest plan that lifts it. */
  plan: PaidPlanId;
}

const count = (n: number, one: string, many: string) =>
  `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/** Pure: one limit's words, with the numbers from the plans as staff set them. */
export function upgradeCopy(
  reason: UpgradeReason,
  plans: Record<PlanId, Plan> = PLANS,
): UpgradeCopy {
  const { free, solo, business: team } = plans;
  switch (reason) {
    case "accounts":
      return {
        title: `${free.name} connects ${count(free.accounts, "account", "accounts")}`,
        why: `Your account is connected. ${solo.name} connects ${solo.accounts}, ${team.name} ${team.accounts}.`,
        todo: "connect more accounts",
        plan: "solo",
      };
    case "replies":
      return {
        title: "You’ve used your replies this month",
        why: "New messages still arrive in your Inbox, and you can answer them yourself. Waggle drafts again next month.",
        todo: "get more replies this month",
        plan: "solo",
      };
    case "top_up":
      return {
        title: "Buying replies is on paid plans",
        why: `Reply top-ups come with ${solo.name} and up. ${solo.name} already has ${solo.replies.toLocaleString("en-US")} replies a month.`,
        todo: "buy more replies",
        plan: "solo",
      };
    case "extra_account":
      return {
        title: "Extra accounts are on paid plans",
        why: `Extra accounts ($${EXTRAS.accountUsd} a month each) come with ${solo.name} and up. ${solo.name} already connects ${solo.accounts}.`,
        todo: "add accounts",
        plan: "solo",
      };
    case "auto_reply":
      return {
        title: `Replying on its own is on ${solo.name}`,
        why: `On ${free.name}, Waggle drafts every reply and you approve it. On ${solo.name} it answers the regular questions by itself once you trust it.`,
        todo: "let Waggle reply on its own",
        plan: "solo",
      };
    case "idle":
      return {
        title: "Stay connected while you’re away",
        why: `${free.name} accounts disconnect after 30 days without a sign-in. Paid plans never do.`,
        todo: "stay connected while you’re away",
        plan: "solo",
      };
    case "team":
      return {
        title: `Inviting your team is on ${team.name}`,
        why: `${free.name} and ${solo.name} are just you. ${team.name} adds members and roles, flags leads and follows up.`,
        todo: "invite your team",
        plan: "business",
      };
    case "follow_ups":
      return {
        title: `Follow-ups are on ${team.name}`,
        why: `${team.name} follows up with leads that go quiet, in your own words.`,
        todo: "get leads followed up",
        plan: "business",
      };
    case "leads":
      return {
        title: `Flagged leads are on ${team.name}`,
        why: `${team.name} flags leads and complaints to you as they come in.`,
        todo: "get leads flagged",
        plan: "business",
      };
    case "brands":
      return {
        title: `Another business is on ${team.name}`,
        why: `${free.name} and ${solo.name} cover one business. ${team.name} covers as many as you run.`,
        todo: "add another business",
        plan: "business",
      };
  }
}

/** Every limit's words with the default plans (for the plan a limit points at). */
export const UPGRADE: Record<UpgradeReason, UpgradeCopy> = Object.fromEntries(
  UPGRADE_REASONS.map((r) => [r, upgradeCopy(r)]),
) as Record<UpgradeReason, UpgradeCopy>;

/** "To connect more accounts, upgrade to Solo or above." */
export function upgradeLine(reason: UpgradeReason): string {
  const u = UPGRADE[reason];
  return `To ${u.todo}, upgrade to ${PLANS[u.plan].name} or above.`;
}

/** The button's words: "Upgrade to Solo". */
export function upgradeLabel(reason: UpgradeReason): string {
  return `Upgrade to ${PLANS[UPGRADE[reason].plan].name}`;
}

/** Why the upgrade pop-up opened (`?upgrade=`): a limit, out of replies, or the Try Solo nudge. */
export type OfferReason = UpgradeReason | "out" | "nudge";

export function isOfferReason(v: unknown): v is OfferReason {
  return v === "out" || v === "nudge" || isUpgradeReason(v);
}

/**
 * The link that opens the upgrade offer for a limit (Walter's flow, 20 Nov). With no page, Your
 * plan with the upgrade screen on top (`/plan?upgrade=<reason>#upgrade`). With a page (any
 * dashboard or setup page, its own query kept), that page with the upgrade pop-up over it:
 * `upgradeHref("auto_reply", "/setup?step=3")` → `/setup?step=3&upgrade=auto_reply`.
 */
export function upgradeHref(reason: OfferReason, here?: string): string {
  if (!here) return `/plan?upgrade=${reason}#upgrade`;
  const url = new URL(here, "http://waggle.local");
  url.searchParams.set("upgrade", reason);
  return `${url.pathname}${url.search}${url.hash}`;
}

/** The welcome pop-up after setup, over the Inbox, once (Walter's flow, 20 Nov). */
export const WELCOME_HREF = "/inbox?welcome=1";
