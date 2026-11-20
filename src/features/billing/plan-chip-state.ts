// Your plan next to your profile (design "Your plan next to your profile", approved 18 Nov).
// Pure: which chip the header shows, from what Your plan already knows.

export type PlanChipState =
  | { kind: "trial"; planName: string; daysLeft: number }
  | { kind: "plan"; planName: string; used: number; allowance: number }
  /** Free (19 Nov): no paid plan. Its offer is always Upgrade to Solo, never an add-on. */
  | { kind: "free"; used: number; allowance: number }
  | { kind: "reached"; free?: boolean }
  | { kind: "past_due" };

const DAY_MS = 24 * 60 * 60_000;

export function planChipState(input: {
  /** org_billing status, or null with no billing row. */
  status: string | null;
  /** The plan's name when the plan is live (trialing, active, past due). */
  planName: string | null;
  trialEndsAt: string | null;
  replies: { used: number; allowance: number } | null;
  now: Date;
  /** Stripe is set up on this server. Unused since Free (no paid plan is still a plan). */
  stripeOn?: boolean;
}): PlanChipState | null {
  if (!input.planName) {
    // No replies counted (an organization holding a test brand): nothing to show.
    if (!input.replies) return null;
    if (input.replies.used >= input.replies.allowance) return { kind: "reached", free: true };
    return { kind: "free", used: input.replies.used, allowance: input.replies.allowance };
  }
  if (input.status === "past_due") return { kind: "past_due" };
  if (input.replies && input.replies.used >= input.replies.allowance) return { kind: "reached" };
  if (input.status === "trialing" && input.trialEndsAt) {
    const left = Math.ceil((new Date(input.trialEndsAt).getTime() - input.now.getTime()) / DAY_MS);
    return { kind: "trial", planName: input.planName, daysLeft: Math.max(0, left) };
  }
  return {
    kind: "plan",
    planName: input.planName,
    used: input.replies?.used ?? 0,
    allowance: input.replies?.allowance ?? 0,
  };
}

/** The chip's words; `short` for the phone header. */
export function planChipText(state: PlanChipState, short = false): string {
  switch (state.kind) {
    case "trial": {
      const days = state.daysLeft === 1 ? "1 day left" : `${state.daysLeft} days left`;
      return short ? days : `${state.planName} trial · ${days}`;
    }
    case "plan":
      return state.planName;
    case "free":
      return short ? "Free" : "Free · Upgrade";
    case "reached":
      if (state.free) return short ? "Upgrade" : "Replies used up · Upgrade to Solo";
      return short ? "Add 200 replies" : "Replies used up · Add 200 for $15";
    case "past_due":
      return short ? "Update card" : "Card declined · Update card";
  }
}

/** The phone header shows the chip only when there's something to do or a trial running. */
export const showOnPhone = (state: PlanChipState) => state.kind !== "plan";
