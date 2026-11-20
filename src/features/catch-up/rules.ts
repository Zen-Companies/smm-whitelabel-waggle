import type { ProviderComment, ProviderMessage } from "@/lib/social/types";

// First-connect catch-up (Free plan, decided 19 Nov): when an account is connected for the first
// time, Waggle pulls what it missed. Pure rules here; the job is in job.ts.

const DAY_MS = 24 * 60 * 60 * 1000;

/** Comments from the last 30 days get a draft. */
export const CATCH_UP_COMMENTS_MS = 30 * DAY_MS;
/**
 * Posts are listed by when they were created (Zernio's `since`), so a recent comment on an older
 * post needs a longer post window. Comments themselves are still held to 30 days.
 */
export const CATCH_UP_POSTS_MS = 90 * DAY_MS;
/** Unanswered DMs from the last 30 days are shown (counted as missed when too old to answer). */
export const CATCH_UP_DMS_MS = 30 * DAY_MS;
/** Instagram and Facebook let a business answer within 24 hours of the customer's last message. */
export const DM_REPLY_WINDOW_MS = DAY_MS;
/** Zernio's replay of Meta history can finish after the first listing: sweep the DMs again. */
export const DM_RESWEEP_AFTER_MS = 15 * 60 * 1000;

/** Platforms whose past DMs Zernio replays at connect (docs.zernio.com/messages/list-inbox-conversations). */
export const CATCH_UP_DM_PLATFORMS = ["instagram", "facebook"] as const;
export const pullsPastDms = (platform: string): boolean =>
  (CATCH_UP_DM_PLATFORMS as readonly string[]).includes(platform);

export type CatchUpStage = "comments" | "dms" | "dms_again" | "done";

/** The windows are anchored to when the account was connected, so a resumed run uses the same ones. */
export function catchUpWindows(startedAt: Date): {
  postsSince: Date;
  commentsSince: Date;
  dmsSince: Date;
} {
  const t = startedAt.getTime();
  return {
    postsSince: new Date(t - CATCH_UP_POSTS_MS),
    commentsSince: new Date(t - CATCH_UP_COMMENTS_MS),
    dmsSince: new Date(t - CATCH_UP_DMS_MS),
  };
}

/** The stage a new catch-up starts at, or null when the platform has nothing to pull. */
export function firstStage(input: { comments: boolean; dms: boolean }): CatchUpStage | null {
  if (input.comments) return "comments";
  if (input.dms) return "dms";
  return null;
}

/** What comes after a finished stage. */
export function nextStage(stage: CatchUpStage, dms: boolean): CatchUpStage {
  if (stage === "comments") return dms ? "dms" : "done";
  if (stage === "dms") return "dms_again";
  return "done";
}

/** A customer's comment from the window that nobody answered yet (not ours, no reply of ours). */
export function commentToDraft(c: ProviderComment, since: Date): boolean {
  if (c.fromOwner || c.ownerReplied) return false;
  if (!c.createdAt) return false;
  const at = Date.parse(c.createdAt);
  return Number.isFinite(at) && at >= since.getTime();
}

/**
 * Splits one DM conversation's messages into what Waggle drafts and what it only shows.
 *
 * Only the customer's messages after the business's last reply count ("unanswered"); if the
 * business replied last, nothing counts. When the newest of them is within the 24-hour reply
 * window, the ones inside the window are drafted (as webhooks would have delivered them).
 * Otherwise the conversation can't be answered here: its unanswered messages from the last 30
 * days are "missed" (shown, never drafted or sent).
 */
export function sortConversation(
  messages: ProviderMessage[],
  now: Date,
  since: Date,
): { draft: ProviderMessage[]; missed: ProviderMessage[] } {
  const newestFirst = messages
    .filter((m) => Number.isFinite(Date.parse(m.createdAt)))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const unanswered: ProviderMessage[] = [];
  for (const m of newestFirst) {
    if (m.direction !== "incoming") break;
    unanswered.push(m);
  }
  const inWindow = unanswered.filter((m) => Date.parse(m.createdAt) >= since.getTime());
  if (inWindow.length === 0) return { draft: [], missed: [] };

  const replyFrom = now.getTime() - DM_REPLY_WINDOW_MS;
  if (Date.parse(inWindow[0].createdAt) >= replyFrom) {
    return { draft: inWindow.filter((m) => Date.parse(m.createdAt) >= replyFrom), missed: [] };
  }
  return { draft: [], missed: inWindow };
}

/**
 * A pulled DM has no Zernio message id (the list endpoint gives Meta's id, which webhooks carry as
 * `platformMessageId`), but inbound_items needs one: a prefixed key that can't collide with
 * Zernio's ids. The dedupe that matters is on platform_message_id.
 */
export const pulledDmKey = (platformMessageId: string): string => `pulled:${platformMessageId}`;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** How an account is named on the card: "@harbourbean", or a Page's name as it is. */
export function accountHandle(username: string | null, fallback: string): string {
  const name = (username ?? "").trim().replace(/^@/, "");
  if (!name) return fallback;
  return /\s/.test(name) ? name : `@${name}`;
}

/** Today's card words (design approved 19 Nov). */
export function catchUpCopy(input: {
  handle: string;
  finished: boolean;
  comments: number;
  dms: number;
  missed: number;
  pullsDms: boolean;
}): {
  title: string;
  lines: string[];
  missedTitle: string | null;
  missedLink: string | null;
} {
  const { comments, dms, missed } = input;
  if (!input.finished) {
    return {
      title: `Waggle is catching up on ${input.handle}`,
      lines: [
        input.pullsDms
          ? "Reading the last 30 days of comments and DMs. Drafts show up in the Inbox as they’re ready."
          : "Reading the last 30 days of comments. Drafts show up in the Inbox as they’re ready.",
      ],
      missedTitle: null,
      missedLink: null,
    };
  }
  const lines = [
    comments > 0
      ? `${plural(comments, "comment", "comments")} from the last 30 days, drafts ready`
      : "No unanswered comments from the last 30 days",
  ];
  if (input.pullsDms) {
    lines.push(
      dms > 0
        ? `${plural(dms, "DM", "DMs")} from the last 24 hours, drafts ready`
        : "No unanswered DMs from the last 24 hours",
    );
  }
  return {
    title: `Waggle caught up on ${input.handle}`,
    lines,
    missedTitle:
      missed > 0
        ? `You missed ${plural(missed, "customer message", "customer messages")} this month`
        : null,
    missedLink:
      missed > 0 ? (missed === 1 ? "See the message" : `See the ${missed} messages`) : null,
  };
}

/** A missed message's age on the read-only list: "26h ago", "3d ago". */
export function messageAge(iso: string, now: Date): string {
  const h = Math.max(0, Math.floor((now.getTime() - Date.parse(iso)) / 3_600_000));
  if (h < 48) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
