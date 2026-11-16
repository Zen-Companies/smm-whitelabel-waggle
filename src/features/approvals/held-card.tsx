"use client";

import { CircleAlert, CircleCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  markHandledAction,
  ownerReplyAction,
  replyPubliclyAction,
  type DecisionFormState,
  type OwnerReplyState,
} from "./actions";
import type { InboxEntry } from "./inbox-data";
import { REPLY_MAX } from "./limits";
import { reasonChip, URGENT_CHIPS } from "./reason-chip";
import { StateLabel } from "@/components/app/state-mark";
import { inboxRules, platformLabel } from "@/lib/social/platforms";

/** Reasons that mean a reply was ready but couldn't go out (danger box, §4 "Couldn't send"). */
const COULD_NOT_SEND: Record<string, string> = {
  dm_window_closed: "The platform's reply window has closed.",
  dm_reply_limit:
    "This chat has used all the replies the platform allows until the customer writes again.",
  send_rejected: "The platform didn't accept the reply.",
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
  dm_window_closing: "The reply window closes within the hour.",
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
  const platform = platformLabel(entry.platform);
  // A comment can be hidden only where the platform allows it (T61: not LinkedIn, Bluesky, YouTube).
  const canHide = entry.kind !== "comment" || inboxRules(entry.platform).hide;
  const unsure = !failed && !!reason && UNSURE.has(reason) && canHide;
  const guess = lookedLike(reason, entry);

  const chip = reasonChip({ ...entry, status: failed ? "failed" : "escalated" });
  // T72: the owner can answer here in their own words (not after a send failed: that needs
  // the platform itself, and not where the reply rules don't allow a reply).
  const canWrite =
    !failed &&
    (entry as { status?: string }).status !== "failed" &&
    entry.kind !== "call" &&
    !unsureSpam(reason, entry);

  return (
    <div id={`item-${entry.itemId}`} className="flex flex-col gap-3">
      {failed ? (
        // One box (Inbox polish, approved 16 Nov): what went wrong and what to do, said once.
        <div role="alert" className="danger-box flex flex-col gap-1">
          <StateLabel state="needs" className="font-semibold">
            Couldn&apos;t send
          </StateLabel>
          <p className="text-ink">
            {failedText(reason, platform, failed)}{" "}
            {reply
              ? `Copy the reply, answer ${entry.authorName ?? "them"} on ${platform}, then mark it handled.`
              : `Answer ${entry.authorName ?? "them"} on ${platform}, then mark it handled.`}
          </p>
        </div>
      ) : (
        <p className="flex flex-wrap items-center gap-2 text-[13px]">
          <StateLabel
            state={URGENT_CHIPS.has(chip) ? "needs" : "waiting"}
            className="font-semibold"
          >
            {chip}
          </StateLabel>
          <span className="text-ink-2">Waggle never answers these on its own.</span>
        </p>
      )}
      {reply && (
        <div className="border-line-strong flex flex-col gap-1.5 rounded-xl border p-4">
          <p className="text-ink-3 text-xs font-semibold">
            {failed ? "The reply that couldn't go out" : "Suggested reply"}
          </p>
          <p className="whitespace-pre-wrap">{reply}</p>
        </div>
      )}
      {!failed && (
        <p className="bg-subtle text-ink-2 rounded-xl px-4 py-3">
          {heldText(reason, entry)} {guess ? `${guess} ` : ""}
          {canWrite
            ? unsure
              ? "Write your reply below, mark it as handled, or hide it if it's spam."
              : "Write your reply below, or mark it as handled if you answered elsewhere."
            : unsure
              ? `Reply on ${platform} and mark it as handled, or hide it if it's spam.`
              : `Reply on ${platform}, then mark it as handled.`}
        </p>
      )}
      {canWrite && <OwnReply entry={entry} />}
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
        {state.error && (
          <p role="alert" className="text-danger text-sm">
            {state.error}
          </p>
        )}
      </form>
    </div>
  );
}

/** The first sentence of the "Couldn't send" box: which window closed, by name. */
function failedText(reason: string | null, platform: string, fallback: string): string {
  if (reason === "dm_window_closed") return `${platform}'s reply window closed before it went out.`;
  return fallback;
}

/** A spam-looking comment the owner should hide, not answer. */
function unsureSpam(reason: string | null, entry: InboxEntry) {
  return reason === "spam" && entry.category === "spam";
}

/**
 * "Your reply" (design "Inbox: approve in one tap", T72): the owner's own words, sent on the
 * platform as them. When the account stopped connecting, the button says so and offers Reconnect.
 */
function OwnReply({ entry }: { entry: InboxEntry }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<OwnerReplyState, FormData>(ownerReplyAction, {});
  const [text, setText] = useState("");
  const platform = platformLabel(entry.platform);
  const max = Math.min(REPLY_MAX, inboxRules(entry.platform).replyMax ?? REPLY_MAX);
  useEffect(() => {
    if (!state.sent) return;
    const t = setTimeout(() => router.refresh(), 9_000);
    return () => clearTimeout(t);
  }, [state.sent, router]);

  if (state.sent) {
    return (
      <p role="status" className="text-success flex items-center gap-2 text-sm font-semibold">
        <CircleCheck className="size-4" strokeWidth={2} aria-hidden />
        Sent. {entry.authorName ?? "They"} will see it on {platform}.
      </p>
    );
  }
  return (
    <form action={action} className="border-line-strong flex flex-col gap-2 rounded-xl border p-4">
      <input type="hidden" name="itemId" value={entry.itemId} />
      <label htmlFor={`own-${entry.itemId}`} className="text-sm font-semibold">
        Your reply
      </label>
      <textarea
        id={`own-${entry.itemId}`}
        name="body"
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={max}
        rows={3}
        className="field"
      />
      {entry.accountActive === false ? (
        <p className="text-danger flex flex-wrap items-center gap-2 text-sm">
          <CircleAlert className="size-4 shrink-0" strokeWidth={2} aria-hidden />
          <span>
            <b className="font-semibold">Can&apos;t send on {platform}.</b> {platform} stopped
            connecting.
          </span>
          <Link
            href="/settings?section=accounts"
            className="bg-honey text-ink hover:bg-honey-hover inline-flex min-h-9 items-center rounded-md px-3.5 font-semibold no-underline"
          >
            Reconnect
          </Link>
        </p>
      ) : (
        <Button
          type="submit"
          variant="primary"
          className="self-start"
          disabled={pending || !text.trim()}
        >
          {pending ? "Sending…" : `Send on ${platform}`}
        </Button>
      )}
      {state.error && (
        <p role="alert" className="text-danger text-sm">
          {state.error}
        </p>
      )}
    </form>
  );
}
