// Hover the plan pill (approved 20 Nov, canvas "Plan pill peek + Free and Solo bees"): a small
// card with the plan, AI replies, accounts, businesses and replies on their own, and the one
// action. Pure: the words and the action from what Your plan already knows.

import type { PlanChipState } from "./plan-chip-state";

export interface PeekRow {
  name: string;
  value: string;
  note?: string;
  /** Not on this plan, or paused: said quietly. */
  quiet?: boolean;
}

export type PeekAction =
  | { kind: "upgrade" }
  | { kind: "top_up" }
  | { kind: "update_card" }
  | { kind: "call" }
  | { kind: "none" };

export interface PlanPeek {
  title: string;
  replies: { used: number; allowance: number; resets: string };
  rows: PeekRow[];
  /** A short line beside the action, when the state needs one. */
  note: string | null;
  action: PeekAction;
}

export interface PeekInput {
  state: PlanChipState;
  planName: string;
  /** "team" is the plan shown as Business (by call). */
  planId: string;
  renews: string | null;
  replies: { used: number; allowance: number; resets: string };
  accounts: { connected: number; allowance: number; paid: boolean };
  brands: { count: number; limit: number | null };
  autoReplyIncluded: boolean;
  /** Categories set to reply on their own on any of the organization's brands. */
  autoCategories: string[];
  accountUsd: number;
}

const AUTO_NAMES: Record<string, string> = { faq: "Questions", lead: "Leads" };

function autoRow(input: PeekInput): PeekRow {
  const name = "Replies on their own";
  if (!input.autoReplyIncluded) {
    return {
      name,
      value: `Not on ${input.planName}`,
      note: "You approve every reply",
      quiet: true,
    };
  }
  if (input.state.kind === "reached") {
    return {
      name,
      value: "Paused",
      note: "Until you add replies or the month resets",
      quiet: true,
    };
  }
  const on = ["faq", "lead"]
    .filter((c) => input.autoCategories.includes(c))
    .map((c) => AUTO_NAMES[c]);
  if (on.length === 0) return { name, value: "Off", note: "You approve every reply" };
  return { name, value: `On for ${on.join(" and ")}` };
}

function title(input: PeekInput): string {
  const { state, planName } = input;
  switch (state.kind) {
    case "trial":
      return `${planName} · free trial, ${state.daysLeft === 1 ? "1 day" : `${state.daysLeft} days`} left`;
    case "reached":
      return `${planName} · replies used up`;
    case "past_due":
      return `${planName} · card declined`;
    case "free":
      return planName;
    case "plan":
      return input.renews ? `${planName} · renews ${input.renews}` : planName;
  }
}

export function planPeek(input: PeekInput): PlanPeek {
  const { state, accounts, brands } = input;
  const rows: PeekRow[] = [
    {
      name: "Accounts",
      value: `${accounts.connected} of ${accounts.allowance} connected`,
      note: accounts.paid ? `Then $${input.accountUsd} each` : undefined,
    },
    brands.limit === null
      ? { name: "Businesses", value: String(brands.count), note: "No limit" }
      : { name: "Businesses", value: `${brands.count} of ${brands.limit}` },
    autoRow(input),
  ];

  let note: string | null = null;
  let action: PeekAction = { kind: "none" };
  if (state.kind === "past_due") {
    note = "Your last payment didn’t go through. Update your card so Waggle keeps writing.";
    action = { kind: "update_card" };
  } else if (state.kind === "reached") {
    note = "New messages still come in. Waggle stops writing.";
    action = state.free ? { kind: "upgrade" } : { kind: "top_up" };
  } else if (state.kind === "free") {
    action = { kind: "upgrade" };
  } else if (input.planId === "team") {
    action = { kind: "call" };
  }

  return { title: title(input), replies: input.replies, rows, note, action };
}
