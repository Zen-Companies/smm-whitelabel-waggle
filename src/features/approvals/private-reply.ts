// T41: answering a comment in the commenter's DMs (Zernio private reply, Instagram/Facebook).
// Pure rules here; the send step and the approval card use them.

export type ReplyVia = "public" | "dm";

/** Meta allows one private reply per comment, within 7 days of the comment. */
export const PRIVATE_REPLY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Where Waggle suggests answering. A comment from someone who wants to buy or book (a lead) is
 * answered in DM, so prices and order details stay out of public view. Everything else, and every
 * DM, is answered where it was written.
 */
export function defaultReplyVia(kind: "comment" | "dm", category: string | null): ReplyVia {
  return kind === "comment" && category === "lead" ? "dm" : "public";
}

/** When a comment can no longer be answered in DM. */
export function privateReplyClosesAt(receivedAt: string | Date): Date {
  return new Date(new Date(receivedAt).getTime() + PRIVATE_REPLY_WINDOW_MS);
}

/** "6 days left to reply in DM", next to the button it affects (design v3, T41). */
export function privateReplyLeft(receivedAt: string, now = new Date()): string {
  const ms = privateReplyClosesAt(receivedAt).getTime() - now.getTime();
  if (ms <= 0) return "Too late to reply in DM";
  const days = Math.floor(ms / 86_400_000);
  if (days >= 1)
    return days === 1 ? "1 day left to reply in DM" : `${days} days left to reply in DM`;
  const hours = Math.floor(ms / 3_600_000);
  return hours < 1 ? "Under 1 h left to reply in DM" : `${hours} h left to reply in DM`;
}
