import type { Category } from "@/lib/classifier/types";
import type { PreviewResult } from "./engine";

// The owner's practice card in plain words (T26, docs/design.md principle 5: outcomes, not
// machinery). No scores, models or policy reason codes reach the owner.

export const PRACTICE_DAILY_LIMIT = 20;

/** What a message "looks like" to the owner. */
export const LOOKS_LIKE: Record<Category, string> = {
  faq: "a question",
  lead: "someone who wants to buy or book",
  complaint: "a complaint",
  spam: "spam",
  unclear: "something I'm not sure about",
};

/** The owner's own words for "Not quite": what the message really is. */
export const CORRECTION_CHOICES: { category: Category; label: string }[] = [
  { category: "faq", label: "A question" },
  { category: "lead", label: "Someone who wants to buy or book" },
  { category: "complaint", label: "A complaint" },
  { category: "spam", label: "Spam" },
  { category: "unclear", label: "Something else" },
];

const MODE_NAMES = { faq: "questions", lead: "people who want to buy or book" } as const;

export interface PracticeCard {
  looksLike: string | null;
  category: Category | null;
  /** The reply it would send or suggest; null when it wouldn't reply. */
  reply: string | null;
  /** The best-matching Business info topic only (T36 item 8): never a topic the reply didn't use. */
  basedOn: string | null;
  /** For someone who wants to buy or book: what would be saved to Leads. */
  leadDetails: string | null;
  /** What happens next, one sentence. */
  next: string;
  /** "Add an answer" when the business info doesn't cover the question. */
  offerAddAnswer: boolean;
  tone: "reply" | "owner" | "quiet" | "error";
}

export function practiceCard(result: PreviewResult): PracticeCard {
  const category = result.classification?.category ?? null;
  const base = {
    looksLike: category ? LOOKS_LIKE[category] : null,
    category,
    reply: null,
    basedOn: null as string | null,
    leadDetails: null as string | null,
    offerAddAnswer: false,
  };
  if (result.error || !result.triage) {
    return {
      ...base,
      next: "Something went wrong trying this. Try again in a minute.",
      tone: "error",
    };
  }

  const decision = result.policy ?? result.triage;
  const reason = "reason" in decision ? decision.reason : undefined;
  const topic = category === "faq" || category === "lead" ? MODE_NAMES[category] : "these";
  const basedOn = result.facts?.[0]?.title ?? null;
  const lead = result.draft?.lead;
  const leadDetails =
    category === "lead" && lead
      ? [lead.name, lead.contact, lead.request].filter(Boolean).join(" · ") || null
      : null;

  switch (decision.decision) {
    case "send":
      return {
        ...base,
        reply: result.draft?.reply ?? null,
        basedOn,
        leadDetails,
        next: `I'd send this on my own: your setting for ${topic} is Auto-reply.`,
        tone: "reply",
      };
    case "approve":
      return {
        ...base,
        reply: result.draft?.reply ?? null,
        basedOn,
        leadDetails,
        next:
          reason === "replies_paused"
            ? "I'd ask you first: you've paused all replies."
            : `I'd ask you first: your setting for ${topic} is Ask me first.`,
        tone: "reply",
      };
    case "ignore":
      return {
        ...base,
        next: "I'd leave it alone. Spam doesn't show in your inbox.",
        tone: "quiet",
      };
    case "pause":
      return {
        ...base,
        next:
          reason === "account_inactive"
            ? "Your Instagram or Facebook account is disconnected, so I'd wait until it's back."
            : "Your plan is paused, so I'd wait.",
        tone: "quiet",
      };
    case "escalate":
      switch (reason) {
        case "complaint":
          return {
            ...base,
            next: "Complaints always come to you. I never reply to these on my own.",
            tone: "owner",
          };
        case "needs_human":
          return {
            ...base,
            basedOn,
            leadDetails,
            next: "I'd pass this to you: your business info doesn't answer it.",
            offerAddAnswer: true,
            tone: "owner",
          };
        case "mode_off":
          return {
            ...base,
            next: `Replies for ${topic} are off, so I'd pass it to you.`,
            tone: "owner",
          };
        case "ai_cap_reached":
          return {
            ...base,
            next: "You've used this month's AI allowance, so I'd pass it to you without a suggested reply.",
            tone: "owner",
          };
        default:
          return {
            ...base,
            next: "I'm not sure what this is, so I'd pass it to you.",
            tone: "owner",
          };
      }
    default:
      // "draft" without a policy result: drafting didn't run.
      return {
        ...base,
        next: "Something went wrong trying this. Try again in a minute.",
        tone: "error",
      };
  }
}

export function triesLeftText(left: number): string {
  if (left <= 0) return "No tries left today. More tomorrow.";
  return left === 1 ? "1 try left today" : `${left} tries left today`;
}

/** What "Right / Not quite" does, said plainly (T36 item 6). */
export const FEEDBACK_NOTE =
  "Your answers are saved to check Waggle as it changes. They don't change its replies on their own.";

/** "Your recent messages" (T36 item 3): what happened to a real message back then, in plain words. */
export function thenText(
  status: string,
  draft: { decidedByOwner: boolean; edited: boolean } | null,
): string {
  switch (status) {
    case "sent":
    case "sending":
      if (!draft) return "Then: a reply was sent";
      if (!draft.decidedByOwner) return "Then: sent on its own";
      return draft.edited ? "Then: you edited the reply" : "Then: you approved the suggested reply";
    case "awaiting_approval":
      return "Then: waiting for your OK";
    case "escalated":
    case "failed":
    case "handled":
      return "Then: it came to you";
    case "rejected":
      return "Then: you chose not to reply";
    case "ignored":
      return "Then: hidden as spam";
    case "paused":
      return "Then: waiting while replies were paused";
    default:
      return "Then: still being sorted";
  }
}
