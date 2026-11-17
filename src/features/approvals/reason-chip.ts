// Why a message came to the owner, as a chip (design "Inbox: approve in one tap", T71/T72): one
// short label on held messages (Today and the Inbox), and the tag over a reply waiting for
// approval with the reason it waited.

/** The chip on a message only the owner can answer: why it came to them, in plain words. */
export type ReasonChip =
  | "Upset customer"
  | "Couldn't send"
  | "Missed call"
  | "Voicemail"
  | "Not in your answers"
  | "Sent a photo"
  | "Not sure what they want"
  | "Wants to buy or book"
  | "For you";

export function reasonChip(entry: {
  status: string;
  kind: string;
  text: string;
  category: string | null;
  reviewRating?: number | null;
  reviewRecommends?: boolean | null;
  call?: { voicemail: boolean } | null;
  draft: { needsHuman: boolean } | null;
}): ReasonChip {
  if (entry.status === "failed") return "Couldn't send";
  if (entry.kind === "call") return entry.call?.voicemail ? "Voicemail" : "Missed call";
  const badReview =
    entry.kind === "review" &&
    ((entry.reviewRating != null && entry.reviewRating <= 2) || entry.reviewRecommends === false);
  if (entry.category === "complaint" || badReview) return "Upset customer";
  if (entry.draft?.needsHuman) return "Not in your answers";
  if (!entry.text.trim()) return "Sent a photo";
  if (entry.category === "unclear") return "Not sure what they want";
  if (entry.category === "lead") return "Wants to buy or book";
  return "For you";
}

/** Chips that are bad news get the danger tone; the rest stay calm. */
export const URGENT_CHIPS: ReadonlySet<string> = new Set(["Upset customer", "Couldn't send"]);

/**
 * Over a reply waiting for approval: what kind of message it is, and why it waited ("New lead ·
 * You asked to check these first."). Replies wait because the owner chose to check that kind.
 */
export function draftReason(entry: {
  kind: string;
  category: string | null;
  reviewRating?: number | null;
  reviewRecommends?: boolean | null;
}): { tag: string; why: string; urgent: boolean } {
  if (entry.kind === "review") {
    const bad =
      (entry.reviewRating != null && entry.reviewRating <= 2) || entry.reviewRecommends === false;
    return {
      tag: bad ? "Unhappy review" : "Review",
      why: "Replies to reviews are public, so you always check them first.",
      urgent: bad,
    };
  }
  const tag =
    entry.category === "lead"
      ? "New lead"
      : entry.category === "complaint"
        ? "Upset customer"
        : entry.category === "faq"
          ? "Question"
          : entry.category === "unclear"
            ? "Not sure"
            : "Reply ready";
  return {
    tag,
    why: "You asked to check these first.",
    urgent: entry.category === "complaint",
  };
}
