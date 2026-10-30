// The policy check (docs/tdd.md §11): pure, no I/O. No reply is sent without passing it
// (CLAUDE.md rule 6).

export type Category = "faq" | "lead" | "complaint" | "spam" | "unclear";
export type AutonomyMode = "off" | "approve" | "auto";
export type SubscriptionStatus = "trialing" | "active" | "past_due" | "canceled";

/** Meta only allows replying to a DM within 24 hours of the customer's last message. */
export const DM_REPLY_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface PolicyInput {
  item: { kind: "comment" | "dm" };
  classification: { category: Category; confidence: number };
  /**
   * null before drafting (triage), or when no draft was written. `approvedByOwner`: the owner
   * approved it in the inbox (checked again at send time, T12).
   */
  draft: { needsHuman: boolean; approvedByOwner?: boolean } | null;
  tenant: {
    subscriptionStatus: SubscriptionStatus;
    confidenceThreshold: number;
    /** The owner pressed "Pause all replies" (T27): nothing goes out on its own. */
    repliesPaused?: boolean;
  };
  account: { status: "active" | "disconnected" | "error" };
  autonomyMode: AutonomyMode;
  /** DMs: the customer's last message, which opens the 24-hour window. */
  lastCustomerMessageAt: Date | null;
  now: Date;
}

export type PolicyReason =
  | "tenant_inactive"
  | "account_inactive"
  | "spam"
  | "mode_off"
  | "complaint"
  | "unclear"
  | "needs_human"
  | "low_confidence"
  | "dm_window_closed"
  | "approval_required"
  | "auto_send"
  | "owner_approved"
  | "replies_paused";

export type PolicyDecision =
  | { decision: "pause"; reason: "tenant_inactive" | "account_inactive" }
  | { decision: "ignore"; reason: "spam" }
  | {
      decision: "escalate";
      reason:
        | "mode_off"
        | "complaint"
        | "unclear"
        | "needs_human"
        | "low_confidence"
        | "dm_window_closed";
    }
  | { decision: "approve"; reason: "approval_required" | "replies_paused" }
  | { decision: "send"; reason: "auto_send" | "owner_approved" };

const PAYING: readonly SubscriptionStatus[] = ["active", "trialing"];

/** Steps 1-4 without the draft: whether an item is worth drafting at all. */
export function triage(
  input: Omit<PolicyInput, "draft" | "lastCustomerMessageAt" | "now">,
): Extract<PolicyDecision, { decision: "pause" | "ignore" | "escalate" }> | { decision: "draft" } {
  // 1. Not paying or account down: wait (handled before drafting, §11).
  if (!PAYING.includes(input.tenant.subscriptionStatus)) {
    return { decision: "pause", reason: "tenant_inactive" };
  }
  if (input.account.status !== "active") return { decision: "pause", reason: "account_inactive" };
  // 2. Spam is dropped, whatever the mode.
  const { category, confidence } = input.classification;
  if (category === "spam") return { decision: "ignore", reason: "spam" };
  // 3. Always the owner's call.
  if (category === "complaint") return { decision: "escalate", reason: "complaint" };
  if (category === "unclear") return { decision: "escalate", reason: "unclear" };
  if (input.autonomyMode === "off") return { decision: "escalate", reason: "mode_off" };
  // 4. Not sure enough: treat as unclear.
  if (confidence < input.tenant.confidenceThreshold) {
    return { decision: "escalate", reason: "low_confidence" };
  }
  return { decision: "draft" };
}

export function policy(input: PolicyInput): PolicyDecision {
  const pre = triage(input);
  if (pre.decision !== "draft") return pre;

  // 3. The draft says the knowledge base doesn't cover it (or there is no draft).
  if (!input.draft || input.draft.needsHuman)
    return { decision: "escalate", reason: "needs_human" };

  // 5. A DM reply must go out inside Meta's 24-hour window.
  if (input.item.kind === "dm") {
    const last = input.lastCustomerMessageAt;
    if (!last || input.now.getTime() - last.getTime() >= DM_REPLY_WINDOW_MS) {
      return { decision: "escalate", reason: "dm_window_closed" };
    }
  }

  // 6-7. In approve mode, the owner's approval is what allows the send. While the owner has paused
  // replies, auto mode waits for them too (an approved reply is held by the send step).
  if (input.autonomyMode === "auto") {
    return input.tenant.repliesPaused
      ? { decision: "approve", reason: "replies_paused" }
      : { decision: "send", reason: "auto_send" };
  }
  return input.draft.approvedByOwner
    ? { decision: "send", reason: "owner_approved" }
    : { decision: "approve", reason: "approval_required" };
}
