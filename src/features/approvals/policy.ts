// The policy check (docs/tdd.md §11): pure, no I/O. No reply is sent without passing it
// (CLAUDE.md rule 6).

import { inboxRules } from "@/lib/social/platforms";

export type Category = "faq" | "lead" | "complaint" | "spam" | "unclear";
export type AutonomyMode = "off" | "approve" | "auto";
export type SubscriptionStatus = "trialing" | "active" | "past_due" | "canceled";

/** Meta only allows replying to a DM within 24 hours of the customer's last message. */
export const DM_REPLY_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * A platform's DM rules (T61): Meta 24 h; TikTok 48 h and 10 replies; Bluesky none (null).
 * Without a platform (older callers), Meta's.
 */
export function dmWindowFor(
  platform: string | undefined,
): { ms: number; maxReplies: number | null } | null {
  if (!platform) return { ms: DM_REPLY_WINDOW_MS, maxReplies: null };
  const w = inboxRules(platform).dmWindow;
  return w ? { ms: w.hours * 60 * 60 * 1000, maxReplies: w.maxReplies } : null;
}

/** When a DM's reply window closes; null when the platform has none or nothing is known. */
export function dmWindowClosesAt(platform: string | undefined, last: Date | null): Date | null {
  const w = dmWindowFor(platform);
  return w && last ? new Date(last.getTime() + w.ms) : null;
}

export interface PolicyInput {
  item: { kind: "comment" | "dm" | "review" };
  classification: { category: Category; confidence: number };
  /**
   * null before drafting (triage), or when no draft was written. `approvedByOwner`: the owner
   * approved it in the inbox (checked again at send time, T12). `writtenByOwner`: the owner wrote
   * the reply themselves, for a message handed to them (MCP Q1).
   */
  draft: {
    needsHuman: boolean;
    approvedByOwner?: boolean;
    writtenByOwner?: boolean;
    /** T67: a WhatsApp template the owner chose; allowed after the 24-hour window. */
    template?: boolean;
  } | null;
  tenant: {
    subscriptionStatus: SubscriptionStatus;
    confidenceThreshold: number;
    /** The owner pressed "Pause all replies" (T27): nothing goes out on its own. */
    repliesPaused?: boolean;
    /** "Hide spam comments for me" (T40): spam comments are hidden on the platform. */
    autoHideSpam?: boolean;
  };
  /** `platform`: the account's (T61); decides the DM window and whether spam can be hidden. */
  account: { status: "active" | "disconnected" | "error"; platform?: string };
  autonomyMode: AutonomyMode;
  /** DMs: the customer's last message, which opens the reply window. */
  lastCustomerMessageAt: Date | null;
  /** DMs on a platform with a reply cap (TikTok): replies sent since that message. */
  dmRepliesSinceCustomer?: number;
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
  | "dm_reply_limit"
  | "approval_required"
  | "auto_send"
  | "owner_approved"
  | "replies_paused"
  | "ai_cap_reached"
  | "review_public";

export type PolicyDecision =
  | { decision: "pause"; reason: "tenant_inactive" | "account_inactive" }
  | { decision: "ignore"; reason: "spam" }
  /** A spam comment, auto-hide on: hide it on the platform, then ignore it (T40). */
  | { decision: "hide"; reason: "spam" }
  | {
      decision: "escalate";
      reason:
        | "spam"
        | "mode_off"
        | "complaint"
        | "unclear"
        | "needs_human"
        | "low_confidence"
        | "dm_window_closed"
        | "dm_reply_limit"
        | "ai_cap_reached";
    }
  | { decision: "approve"; reason: "approval_required" | "replies_paused" | "review_public" }
  | { decision: "send"; reason: "auto_send" | "owner_approved" };

const PAYING: readonly SubscriptionStatus[] = ["active", "trialing"];

type DmInput = Pick<
  PolicyInput,
  "account" | "lastCustomerMessageAt" | "dmRepliesSinceCustomer" | "now"
>;

/** Why a DM reply can't go out now, or null when it can. */
function dmBlocked(input: DmInput): "dm_window_closed" | "dm_reply_limit" | null {
  const w = dmWindowFor(input.account.platform);
  if (!w) return null;
  const last = input.lastCustomerMessageAt;
  if (!last || input.now.getTime() - last.getTime() >= w.ms) return "dm_window_closed";
  if (w.maxReplies !== null && (input.dmRepliesSinceCustomer ?? 0) >= w.maxReplies) {
    return "dm_reply_limit";
  }
  return null;
}

/**
 * Steps 1-4 without the draft: whether an item is worth drafting at all. `aiCapReached`: the
 * business has used this month's AI allowance (T32), so nothing more is drafted. policy() never
 * passes it: a reply already drafted was paid for and goes on as usual.
 */
export function triage(
  input: Omit<PolicyInput, "draft" | "lastCustomerMessageAt" | "now"> & { aiCapReached?: boolean },
):
  | Extract<PolicyDecision, { decision: "pause" | "ignore" | "hide" | "escalate" }>
  | { decision: "draft" } {
  // 1. Not paying or account down: wait (handled before drafting, §11).
  if (!PAYING.includes(input.tenant.subscriptionStatus)) {
    return { decision: "pause", reason: "tenant_inactive" };
  }
  if (input.account.status !== "active") return { decision: "pause", reason: "account_inactive" };
  // 2. Spam is never answered, whatever the mode. A spam DM is dropped. A spam comment is public
  // on the post, so it is hidden (auto-hide on) or comes to the owner to hide (T40).
  const { category, confidence } = input.classification;
  if (category === "spam") {
    // DMs and reviews can't be hidden: dropped. So are comments where the platform can't hide
    // them (LinkedIn, Bluesky, YouTube): nothing the owner could do from Waggle.
    if (input.item.kind !== "comment") return { decision: "ignore", reason: "spam" };
    if (input.account.platform && !inboxRules(input.account.platform).hide) {
      return { decision: "ignore", reason: "spam" };
    }
    // Hidden for the owner only when Waggle is sure (the same threshold as replies).
    return input.tenant.autoHideSpam && confidence >= input.tenant.confidenceThreshold
      ? { decision: "hide", reason: "spam" }
      : { decision: "escalate", reason: "spam" };
  }
  // 3. Always the owner's call.
  if (category === "complaint") return { decision: "escalate", reason: "complaint" };
  if (category === "unclear") return { decision: "escalate", reason: "unclear" };
  if (input.autonomyMode === "off") return { decision: "escalate", reason: "mode_off" };
  // 4. Not sure enough: treat as unclear.
  if (confidence < input.tenant.confidenceThreshold) {
    return { decision: "escalate", reason: "low_confidence" };
  }
  // The month's AI allowance is used up: it comes to the owner without a suggested reply.
  if (input.aiCapReached) return { decision: "escalate", reason: "ai_cap_reached" };
  return { decision: "draft" };
}

export function policy(input: PolicyInput): PolicyDecision {
  // The owner's own words for a message Waggle handed to them (a complaint, an unclear message):
  // the owner's call, so only the hard limits apply (paying, account up, Meta's DM window).
  if (input.draft?.writtenByOwner && input.draft.approvedByOwner) {
    if (!PAYING.includes(input.tenant.subscriptionStatus)) {
      return { decision: "pause", reason: "tenant_inactive" };
    }
    if (input.account.status !== "active") return { decision: "pause", reason: "account_inactive" };
    // A WhatsApp template is what WhatsApp allows once the window has closed.
    const blocked = input.item.kind === "dm" && !input.draft.template ? dmBlocked(input) : null;
    if (blocked) return { decision: "escalate", reason: blocked };
    return { decision: "send", reason: "owner_approved" };
  }

  const pre = triage({ ...input, aiCapReached: false });
  if (pre.decision !== "draft") return pre;

  // 3. The draft says the knowledge base doesn't cover it (or there is no draft).
  if (!input.draft || input.draft.needsHuman)
    return { decision: "escalate", reason: "needs_human" };

  // 5. A DM reply must go out inside the platform's window (Meta 24 h; TikTok 48 h, 10 replies).
  const blocked = input.item.kind === "dm" ? dmBlocked(input) : null;
  if (blocked) return { decision: "escalate", reason: blocked };

  // A review's reply stays public on the Page (T42): never sent on its own, whatever the mode.
  if (input.item.kind === "review") {
    return input.draft.approvedByOwner
      ? { decision: "send", reason: "owner_approved" }
      : { decision: "approve", reason: "review_public" };
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
