// The first approval (first connect board, approved 20 Nov): after the organization's first
// approved reply, the moment is named in place (no toast). Pure.
//
// "Done. @sarah.k got their answer 9 days late, but they got it." Neutral wording: Waggle never
// guesses a customer's gender. "Days late" only for a comment that waited 2 days or more; a DM is
// never called late (it can only be answered inside its 24-hour window).

const DAY_MS = 24 * 60 * 60 * 1000;
/** A comment that waited at least this many days is "N days late". */
export const LATE_AFTER_DAYS = 2;

export interface FirstApproval {
  title: string;
  /** "1 of 100 free replies used this month. 19 more drafts are waiting." */
  usage: string;
  /** Shown while more drafts wait: approving fast is fine, sending is spaced out. */
  spaced: string | null;
  /** The next draft waiting, or the Inbox. */
  nextHref: string;
}

/** "@sarah.k" for a handle, a Page or person's name as it is, else "Your customer". */
export function customerHandle(author: string | null): string {
  const name = (author ?? "").trim().replace(/^@/, "");
  if (!name) return "Your customer";
  return /\s/.test(name) ? name : `@${name}`;
}

/** Whole days between the message and the approval. */
export function daysWaited(receivedAt: string, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - Date.parse(receivedAt)) / DAY_MS));
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function firstApprovalCopy(input: {
  author: string | null;
  kind: string;
  receivedAt: string;
  now: Date;
  /** Replies counted this month, this one included; null when the plan has no limit. */
  used: number | null;
  allowance: number | null;
  free: boolean;
  /** Drafts still waiting for the owner. */
  waiting: number;
  /** "Instagram": the app that should never see a burst. */
  platform: string;
  nextHref: string;
}): FirstApproval {
  const who = customerHandle(input.author);
  const days = daysWaited(input.receivedAt, input.now);
  const title =
    input.kind === "comment" && days >= LATE_AFTER_DAYS
      ? `Done. ${who} got their answer ${days} days late, but they got it.`
      : `Done. ${who} got their answer.`;
  const used =
    input.used !== null && input.allowance !== null
      ? `${Math.min(input.used, input.allowance)} of ${input.allowance} ${input.free ? "free " : ""}${
          input.allowance === 1 ? "reply" : "replies"
        } used this month. `
      : "";
  const waiting =
    input.waiting === 0
      ? "No more drafts are waiting."
      : input.waiting === 1
        ? "1 more draft is waiting."
        : `${plural(input.waiting, "more draft", "more drafts")} are waiting.`;
  return {
    title,
    usage: `${used}${waiting}`,
    spaced:
      input.waiting > 0
        ? `Approve as fast as you like: Waggle sends them spaced out, so ${input.platform} never sees a burst.`
        : null,
    nextHref: input.nextHref,
  };
}

/** The "Sending N of M…" card's words (approved 20 Nov). */
export function sendingCopy(p: { current: number; total: number }, platform: string) {
  return {
    title: `Sending ${p.current} of ${p.total}…`,
    line: `Waggle sends approved replies about every 20–30 seconds, so ${platform} never sees a burst. You can close this page.`,
  };
}
