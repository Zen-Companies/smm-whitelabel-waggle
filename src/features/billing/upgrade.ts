import { PLANS, type PaidPlanId } from "./plans";

// Every Free limit pushes to the first plan that lifts it (Jason and Febron, 19-20 Nov; canvas
// "Free plan, no card" → "Every Free limit, and what it says"). Each one says what it unlocks and
// the cheapest plan that has it: "To …, upgrade to Solo or above" (Team for team features), and
// opens Your plan with the upgrade screen on top. Never an add-on. Pure.

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

export const UPGRADE: Record<UpgradeReason, UpgradeCopy> = {
  accounts: {
    title: "Free connects 1 account",
    why: "Your account is connected. Solo connects 3, Team 6.",
    todo: "connect more accounts",
    plan: "solo",
  },
  replies: {
    title: "You’ve used your replies this month",
    why: "New messages still arrive in your Inbox, and you can answer them yourself. Waggle drafts again next month.",
    todo: "get more replies this month",
    plan: "solo",
  },
  top_up: {
    title: "Buying replies is on paid plans",
    why: "Reply top-ups come with Solo and up. Solo already has 300 replies a month.",
    todo: "buy more replies",
    plan: "solo",
  },
  extra_account: {
    title: "Extra accounts are on paid plans",
    why: "Extra accounts ($10 a month each) come with Solo and up. Solo already connects 3.",
    todo: "add accounts",
    plan: "solo",
  },
  auto_reply: {
    title: "Replying on its own is on Solo",
    why: "On Free, Waggle drafts every reply and you approve it. On Solo it answers the regular questions by itself once you trust it.",
    todo: "let Waggle reply on its own",
    plan: "solo",
  },
  idle: {
    title: "Stay connected while you’re away",
    why: "Free accounts disconnect after 30 days without a sign-in. Paid plans never do.",
    todo: "stay connected while you’re away",
    plan: "solo",
  },
  team: {
    title: "Inviting your team is on Team",
    why: "Free and Solo are just you. Team adds members and roles, flags leads and follows up.",
    todo: "invite your team",
    plan: "business",
  },
  follow_ups: {
    title: "Follow-ups are on Team",
    why: "Team follows up with leads that go quiet, in your own words.",
    todo: "get leads followed up",
    plan: "business",
  },
  leads: {
    title: "Flagged leads are on Team",
    why: "Team flags leads and complaints to you as they come in.",
    todo: "get leads flagged",
    plan: "business",
  },
  brands: {
    title: "Another business is on Team",
    why: "Free and Solo cover one business. Team covers as many as you run.",
    todo: "add another business",
    plan: "business",
  },
};

/** "To connect more accounts, upgrade to Solo or above." */
export function upgradeLine(reason: UpgradeReason): string {
  const u = UPGRADE[reason];
  return `To ${u.todo}, upgrade to ${PLANS[u.plan].name} or above.`;
}

/** The button's words: "Upgrade to Solo". */
export function upgradeLabel(reason: UpgradeReason): string {
  return `Upgrade to ${PLANS[UPGRADE[reason].plan].name}`;
}

/** Your plan with the upgrade screen for this limit on top. */
export function upgradeHref(reason: UpgradeReason): string {
  return `/plan?upgrade=${reason}#upgrade`;
}
