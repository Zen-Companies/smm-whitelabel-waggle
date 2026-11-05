"use client";

import { CircleAlert } from "lucide-react";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { markHandledAction, replyPubliclyAction, type DecisionFormState } from "./actions";
import type { InboxEntry } from "./inbox-data";

/** Reasons that mean a reply was ready but couldn't go out (danger box, §4 "Couldn't send"). */
const COULD_NOT_SEND: Record<string, string> = {
  dm_window_closed: "Instagram's 24-hour reply window has closed.",
  send_rejected: "Instagram/Facebook didn't accept the reply.",
  delivery_failed: "The reply was sent but not delivered.",
  account_inactive: "The account was disconnected before the reply went out.",
  tenant_inactive: "Your subscription isn't active, so the reply wasn't sent.",
  retries_exhausted: "It couldn't be sent after 3 tries.",
};

/** T41: a comment's DM couldn't go out; the same reply can go under the comment instead. */
const DM_UNAVAILABLE: Record<string, string> = {
  private_reply_used: "This comment already got its one DM. Reply publicly instead.",
  private_reply_expired:
    "It's been more than 7 days, so it can't be answered in DM. Reply publicly instead.",
};

/** "Reply publicly" (design v3 "Reply in DM"): the draft goes back to waiting for approval. */
function ReplyPubliclyCard({ entry, text }: { entry: InboxEntry; text: string }) {
  const [state, action, pending] = useActionState<DecisionFormState, FormData>(
    replyPubliclyAction,
    {},
  );
  return (
    <form
      id={`item-${entry.itemId}`}
      action={action}
      className="border-line flex flex-wrap items-center gap-2.5 rounded-xl border px-4 py-3.5"
    >
      <CircleAlert className="text-danger size-4 shrink-0" strokeWidth={2} aria-hidden />
      <span role="status">{text}</span>
      <input type="hidden" name="itemId" value={entry.itemId} />
      <Button type="submit" variant="secondary" className="ml-auto" disabled={pending}>
        {pending ? "Moving…" : "Reply publicly"}
      </Button>
      {state.error && (
        <p role="alert" className="text-danger w-full text-sm">
          {state.error}
        </p>
      )}
    </form>
  );
}

/** Why it came to the owner, calm and short (design.md §7). */
const HELD: Record<string, string> = {
  complaint: "This looks like a complaint. It's best answered by you.",
  unclear: "Waggle couldn't tell what this is about.",
  low_confidence: "Waggle wasn't sure what this is about.",
  needs_human: "Your business info doesn't cover this question.",
  mode_off: "Replies are off for this kind of message.",
  ai_cap_reached: "You've used this month's AI allowance, so no reply was suggested.",
  dm_window_closing: "The 24-hour reply window closes within the hour.",
};

/** Reasons where Waggle wasn't sure what the message is: offer to hide it as spam. */
const UNSURE = new Set(["unclear", "low_confidence"]);

const LOOKED_LIKE: Record<string, string> = {
  faq: "a question",
  lead: "someone who wants to buy or book",
  complaint: "a complaint",
  spam: "spam",
};

/** "It looked most like a question." for an unsure message whose best guess is known. */
export function lookedLike(reason: string | null, entry: Pick<InboxEntry, "category">) {
  if (!reason || !UNSURE.has(reason) || !entry.category) return null;
  const guess = LOOKED_LIKE[entry.category];
  return guess ? `It looked most like ${guess}.` : null;
}

/** Where to answer it yourself: the post for a comment, the platform's inbox for a DM. */
export function openOnPlatformHref(
  entry: Pick<InboxEntry, "kind" | "platform" | "permalink">,
): string | null {
  if (entry.kind === "comment") return entry.permalink;
  return entry.platform === "facebook"
    ? "https://www.facebook.com/messages/"
    : "https://www.instagram.com/direct/inbox/";
}

export function heldText(reason: string | null, entry: InboxEntry): string {
  if (reason && HELD[reason]) {
    const extra =
      reason === "needs_human" && entry.draft?.needsHumanReason
        ? ` (${entry.draft.needsHumanReason})`
        : "";
    return HELD[reason] + extra;
  }
  if (entry.category === "complaint") return HELD.complaint;
  if (entry.category === "unclear") return HELD.unclear;
  return "Waggle handed this one to you.";
}

/**
 * The footer of a conversation that needs the owner (design v2): the reply that couldn't go out
 * (if any), the problem in one sentence where the send button would be, then the fix:
 * "Mark as handled" (primary) and "Copy reply".
 */
export function HeldCard({ entry, reason }: { entry: InboxEntry; reason: string | null }) {
  if (reason && DM_UNAVAILABLE[reason]) {
    return <ReplyPubliclyCard entry={entry} text={DM_UNAVAILABLE[reason]} />;
  }
  return <HeldCardBody entry={entry} reason={reason} />;
}

function HeldCardBody({ entry, reason }: { entry: InboxEntry; reason: string | null }) {
  const [state, action, pending] = useActionState<DecisionFormState, FormData>(
    markHandledAction,
    {},
  );
  const [copied, setCopied] = useState(false);
  const failed = reason ? COULD_NOT_SEND[reason] : undefined;
  const reply =
    entry.draft && !entry.draft.needsHuman ? (entry.draft.editedBody ?? entry.draft.body) : null;
  const platform = entry.platform === "facebook" ? "Facebook" : "Instagram";
  const unsure = !failed && !!reason && UNSURE.has(reason);
  const guess = lookedLike(reason, entry);
  const openHref = openOnPlatformHref(entry);

  return (
    <div id={`item-${entry.itemId}`} className="flex flex-col gap-3">
      {reply && (
        <div className="border-line-strong flex flex-col gap-2 rounded-xl border p-4">
          <p className="text-ink-2 text-sm font-medium">
            {failed ? "The reply that couldn't go out" : "Suggested reply"}
          </p>
          <p className="whitespace-pre-wrap">{reply}</p>
        </div>
      )}
      {failed ? (
        <div role="alert" className="danger-box flex flex-col gap-1">
          <p className="font-semibold">Couldn&apos;t send: {failed}</p>
          <p>
            Reply on {platform} yourself{reply ? " (copy the reply above)" : ""}, then mark it as
            handled.
          </p>
        </div>
      ) : (
        <p className="bg-subtle text-ink-2 rounded-xl px-4 py-3">
          {heldText(reason, entry)} {guess ? `${guess} ` : ""}
          {unsure
            ? `Reply on ${platform} and mark it as handled, or hide it if it's spam.`
            : `Reply on ${platform}, then mark it as handled.`}
        </p>
      )}
      <form action={action} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="itemId" value={entry.itemId} />
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Saving…" : "Mark as handled"}
        </Button>
        {unsure && (
          <Button type="submit" name="asSpam" value="1" variant="secondary" disabled={pending}>
            It&apos;s spam: hide it
          </Button>
        )}
        {reply && (
          <Button
            type="button"
            variant="secondary"
            onClick={async () => {
              await navigator.clipboard.writeText(reply);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
          >
            {copied ? "Copied" : "Copy reply"}
          </Button>
        )}
        {openHref && (
          <a
            href={openHref}
            target="_blank"
            rel="noopener noreferrer"
            className="text-ink-2 hover:bg-subtle flex min-h-11 items-center rounded-md px-3 text-sm font-medium"
          >
            Open in {platform}
          </a>
        )}
        {state.error && (
          <p role="alert" className="text-danger text-sm">
            {state.error}
          </p>
        )}
      </form>
    </div>
  );
}
