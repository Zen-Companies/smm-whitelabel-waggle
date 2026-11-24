import {
  dailyAmount,
  EXTRAS,
  PLAN_IDS,
  PLANS,
  TRIAL,
  type PaidPlanId,
  type Plan,
  type PlanId,
} from "./plans";
import { upgradeCopy, type OfferReason } from "./upgrade";

// What the upgrade pop-up offers, by the plan the organization is on (Walter's flow, 20 Nov; the
// ladder of 19 Nov): Free → Solo (7 days free with a card on a first paid plan), Solo → Team
// (switched in place, prorated), Team → Business (priced on a call: Book a call), Business →
// nothing above it. A limit that needs a higher plan (team features need Team) skips ahead. Paid
// plans also get the extra that fixes the limit (an account at $10 a month, or 200 replies for
// $15); Free gets only the upgrade (19 Nov). Every number comes from the plans as staff set them.
// Pure.

export interface UpgradeOffer {
  /** The plan offered, or null at the top of the ladder. */
  next: PaidPlanId | null;
  /**
   * How it's taken: a 7-day trial with a card (first paid plan), a checkout (Free again after a
   * paid plan), a switch in place, or a call.
   */
  via: "trial" | "checkout" | "switch" | "call" | null;
  title: string;
  body: string;
  /** One line on what the offered plan has. */
  line: string | null;
  cta: string | null;
  /** The add-on that fixes this limit without changing plan (paid plans only). */
  extra: "account" | "topUp" | null;
  footnote: string | null;
  /** The price banner: "$1.61" a day, of "$49 a month after 7 days free". */
  day: { amount: string; of: string } | null;
}

export interface OfferContext {
  /** The organization never had a paid plan: its first one starts with the trial. */
  trial: boolean;
  /** How long that trial is: 7 days, or 30 with the Black Friday or referral month. */
  trialDays?: number;
  /** Out of replies: the date replies come back, "December 1". */
  resetsOn?: string;
}

const LADDER: Record<PlanId, PaidPlanId | null> = {
  free: "solo",
  solo: "business",
  business: "team",
  team: null,
};

/** Pure: the next plan up, or null at the top. */
export function nextPlan(current: PlanId): PaidPlanId | null {
  return LADDER[current];
}

const rank = (p: PlanId) => PLAN_IDS.indexOf(p);
const n = (v: number) => v.toLocaleString("en-US");

/** Pure: the plan a reason offers: the next one up, or further when the limit needs it. */
export function offeredPlan(current: PlanId, reason: OfferReason): PaidPlanId | null {
  const next = nextPlan(current);
  if (!next || reason === "out" || reason === "nudge") return next;
  const needs = upgradeCopy(reason).plan;
  return rank(needs) > rank(next) ? needs : next;
}

/** Pure: the honest out-of-replies line (decision 9). */
export function outLine(resetsOn: string | undefined): string {
  return `Waggle has stopped writing replies${resetsOn ? ` until ${resetsOn}` : " for this month"}. New messages still arrive in your Inbox, and you can answer them yourself.`;
}

function planLine(p: Plan): string {
  const parts = [`${n(p.accounts)} accounts`, `${n(p.replies)} AI replies`];
  if (p.features.autoReply) parts.push("Auto-reply");
  if (p.features.leadsFlagged) parts.push("Leads and complaints flagged");
  if (p.features.team) parts.push("Your team");
  return parts.join(" · ");
}

export function upgradeOffer(
  current: PlanId,
  reason: OfferReason,
  plans: Record<PlanId, Plan> = PLANS,
  ctx: OfferContext = { trial: false },
): UpgradeOffer {
  const cur = plans[current];
  const id = offeredPlan(current, reason);
  const next = id ? plans[id] : null;
  const byCall = !!next && !next.forSale;
  const via: UpgradeOffer["via"] = !next
    ? null
    : byCall
      ? "call"
      : current !== "free"
        ? "switch"
        : ctx.trial
          ? "trial"
          : "checkout";
  const cta =
    via === "trial"
      ? `Start ${ctx.trialDays ?? TRIAL.days} days free`
      : via === "checkout"
        ? `Upgrade to ${next!.name}`
        : via === "switch"
          ? `Switch to ${next!.name}`
          : via === "call"
            ? "Book a call"
            : null;
  const footnote =
    via === "trial"
      ? `A card starts your trial. Cancel before day ${ctx.trialDays ?? TRIAL.days} and you pay nothing.`
      : via === "checkout"
        ? "Paid at checkout. Cancel any time and you go back to Free."
        : via === "switch"
          ? "You pay the difference for the rest of this period. Everything you’ve set up stays."
          : via === "call"
            ? `We set ${next!.name} up with you on a short call, priced for what you run.`
            : null;
  const day =
    next && !byCall
      ? {
          amount: dailyAmount(next.monthlyUsd),
          of:
            via === "trial"
              ? `$${next.monthlyUsd} a month after ${ctx.trialDays ?? TRIAL.days} days free`
              : `$${next.monthlyUsd} a month`,
        }
      : null;
  const base = { next: id, via, cta, footnote, day, line: next ? planLine(next) : null };

  // Free: only the upgrade, never an add-on (19 Nov).
  if (current === "free") {
    const to = next!;
    const auto = to.features.autoReply;
    switch (reason) {
      case "accounts":
        return {
          ...base,
          extra: null,
          title: `${cur.name} includes ${n(cur.accounts)} account${cur.accounts === 1 ? "" : "s"}.`,
          body: `Upgrade to ${to.name} to connect ${n(to.accounts)}.`,
        };
      case "replies":
      case "top_up":
        return {
          ...base,
          extra: null,
          title: `More AI replies come with ${to.name}.`,
          body: `${cur.name} has ${n(cur.replies)} a month and no top-ups. ${to.name} has ${n(to.replies)}${auto ? ", and Waggle can answer regular questions on its own" : ""}.`,
        };
      case "out":
        return {
          ...base,
          extra: null,
          title: "You’re out of AI replies.",
          body: `${outLine(ctx.resetsOn)} ${to.name} has ${n(to.replies)} a month.`,
        };
      case "nudge":
        return {
          ...base,
          extra: null,
          title:
            via === "trial"
              ? `Try ${to.name} free for ${ctx.trialDays ?? TRIAL.days} days.`
              : `Upgrade to ${to.name}.`,
          body: `${auto ? "Waggle answers the regular questions on its own" : "More room for Waggle"}: ${n(to.accounts)} accounts and ${n(to.replies)} AI replies a month.`,
        };
      default: {
        const copy = upgradeCopy(reason, plans);
        return { ...base, extra: null, title: `${copy.title}.`, body: copy.why };
      }
    }
  }

  // Paid plans: the extra that fixes it, and the next plan up.
  const more = (what: "accounts" | "replies") =>
    !next
      ? "For more, add extras any time on Your plan."
      : byCall
        ? `Running several businesses or clients? ${next.name} is sized for that.`
        : `${next.name} has ${n(next[what])}.`;
  const topUp = `${EXTRAS.topUp.replies} more replies for $${EXTRAS.topUp.usd}`;
  switch (reason) {
    case "accounts":
    case "extra_account":
      return {
        ...base,
        extra: "account",
        title: `${cur.name} includes ${n(cur.accounts)} accounts.`,
        body: `Add one more for $${EXTRAS.accountUsd} a month. ${more("accounts")}`,
      };
    case "replies":
    case "top_up":
      return {
        ...base,
        extra: "topUp",
        title: "Need more AI replies?",
        body: `${cur.name} has ${n(cur.replies)} a month. Add ${topUp}; unused ones carry over a month. ${more("replies")}`,
      };
    case "out":
      return {
        ...base,
        extra: "topUp",
        title: "You’re out of AI replies.",
        body: `${outLine(ctx.resetsOn)} Add ${topUp} to keep Waggle writing now. ${more("replies")}`,
      };
    case "nudge":
    case "auto_reply":
    case "idle":
      return {
        ...base,
        extra: null,
        title: next ? `Try ${next.name}` : `You’re on ${cur.name}`,
        body: !next
          ? "You have everything Waggle does. Extra accounts and replies are on Your plan."
          : byCall
            ? `For agencies and bigger teams: ${n(next.accounts)}+ accounts and ${n(next.replies)} AI replies, set up with you.`
            : planLine(next),
      };
    default: {
      const copy = upgradeCopy(reason, plans);
      // A team feature the plan already has (Team or Business): nothing to lift.
      if (rank(copy.plan) <= rank(current)) {
        return {
          next: null,
          via: null,
          cta: null,
          footnote: null,
          day: null,
          line: null,
          extra: null,
          title: `You’re on ${cur.name}`,
          body: "Your plan already includes this.",
        };
      }
      return { ...base, extra: null, title: `${copy.title}.`, body: copy.why };
    }
  }
}
