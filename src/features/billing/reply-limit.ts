import { AI_CAP_WARN_RATIO, nextMonthStart } from "@/lib/llm/spend";
import { EXTRAS, PLANS, type PlanId } from "./plans";

// The AI reply limit (Pricing Bible, "When the AI reply limit runs out"). Pure. Only AI drafting
// pauses at the limit: posting, the inbox, replying by hand and lead and review alerts go on.

export type ReplyLimitLevel = "ok" | "warn" | "reached";

export interface ReplyLimit {
  used: number;
  allowance: number;
  left: number;
  level: ReplyLimitLevel;
  resetsAt: Date;
}

/** At 80% an email and an in-app note; at 100% drafts pause. */
export function replyLimit(used: number, allowance: number, now: Date): ReplyLimit {
  const level: ReplyLimitLevel =
    used >= allowance ? "reached" : used >= allowance * AI_CAP_WARN_RATIO ? "warn" : "ok";
  return {
    used,
    allowance,
    left: Math.max(0, allowance - used),
    level,
    resetsAt: nextMonthStart(now),
  };
}

function day(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });
}

/** The page's promise. */
export const NEVER_DARK = "You never go dark. Waggle just stops writing for you until next month.";

/**
 * Pure: the owner's note at 80% and 100% (the Bible's words), or null below 80%. `plan` picks
 * the upgrade offer: Solo is offered Business; Business and Team only the top-up.
 */
export function replyLimitNote(
  limit: ReplyLimit,
  plan: PlanId,
): { title: string; body: string; offers: string[] } | null {
  if (limit.level === "ok") return null;
  const resets = `Resets on ${day(limit.resetsAt)}.`;
  const topUp = `+${EXTRAS.topUp.replies} replies for $${EXTRAS.topUp.usd}`;
  if (limit.level === "warn") {
    return {
      title: `You've used ${limit.used} of ${limit.allowance} replies.`,
      body: resets,
      offers: [],
    };
  }
  return {
    title: "Waggle has stopped writing replies for this month.",
    body: `${NEVER_DARK} Posting, the inbox and replying yourself keep working. ${resets}`,
    offers: plan === "solo" ? [topUp, `Upgrade to ${PLANS.business.name}`] : [topUp],
  };
}

/** Pure: whether the 80% or 100% email is due (each once a month). */
export function limitEmailDue(
  limit: ReplyLimit,
  sent: { warn: boolean; reached: boolean },
): "warn" | "reached" | null {
  if (limit.level === "reached" && !sent.reached) return "reached";
  if (limit.level === "warn" && !sent.warn) return "warn";
  return null;
}
