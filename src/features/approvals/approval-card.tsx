"use client";

import { CircleCheck, Clock3, Globe } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { BeeSending } from "@/components/app/bee";
import { clockTime } from "@/components/app/time";
import { WaggleTrail } from "@/components/app/waggle-trail";
import { Button } from "@/components/ui/button";
import { privateReplyClosesAt, privateReplyLeft } from "./private-reply";
import { decideDraft, undoApprovalAction, type DecisionFormState } from "./actions";
import type { InboxEntry } from "./inbox-data";
import { REPLY_MAX } from "./limits";

// Recently approved replies live outside the card: approving moves the item out of the list
// (Realtime refresh), which unmounts the card, but the Sent row must stay for the undo window.
type RecentSend = { entry: InboxEntry; at: string };
let recent: RecentSend[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
function addRecent(send: RecentSend) {
  recent = [send, ...recent.filter((r) => r.entry.itemId !== send.entry.itemId)];
  emit();
}
function removeRecent(itemId: string) {
  recent = recent.filter((r) => r.entry.itemId !== itemId);
  emit();
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const EMPTY: RecentSend[] = [];

/** The Sent rows of replies approved in the last few seconds (top of the inbox). */
export function RecentSends() {
  const sends = useSyncExternalStore(
    subscribe,
    () => recent,
    () => EMPTY,
  );
  if (sends.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {sends.map((s) => (
        <SentRow key={s.entry.itemId} entry={s.entry} at={s.at} />
      ))}
    </div>
  );
}

/** How long the Sent row offers Undo (decisions.ts UNDO_WINDOW_MS; the server allows a bit more). */
const UNDO_MS = 8_000;

/** The 24-hour DM window, next to the button it affects (design v2). */
function windowLeft(closesAt: string | null) {
  if (!closesAt) return null;
  const hours = (new Date(closesAt).getTime() - Date.now()) / 3_600_000;
  if (hours <= 0) return "Reply window closed";
  return hours < 1 ? "Under 1 h left to reply" : `${Math.floor(hours)} h left to reply`;
}

/** "Answered [name] · 2:14 PM · Undo" for 8 seconds, then it moves to Answered (§5). */
function SentRow({ entry, at }: { entry: InboxEntry; at: string }) {
  const router = useRouter();
  const [state, undo, undoing] = useActionState<DecisionFormState, FormData>(
    async (prev: DecisionFormState, fd: FormData) => {
      const result = await undoApprovalAction(prev, fd);
      if (!result.error) removeRecent(entry.itemId);
      return result;
    },
    {},
  );
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    const left = UNDO_MS - (Date.now() - new Date(at).getTime());
    const t = setTimeout(() => setExpired(true), Math.max(0, left));
    // The row itself goes a little later; the item is already in the Sent tab.
    const gone = setTimeout(
      () => {
        removeRecent(entry.itemId);
        router.refresh();
      },
      Math.max(0, left) + 4_000,
    );
    return () => {
      clearTimeout(t);
      clearTimeout(gone);
    };
  }, [at, entry.itemId, router]);

  return (
    <div className="card flex flex-wrap items-center gap-3 px-5 py-3" role="status">
      <span className="bg-success-soft text-success inline-flex size-8 items-center justify-center rounded-full">
        <CircleCheck strokeWidth={1.75} className="size-5" aria-hidden />
      </span>
      <WaggleTrail />
      <p className="flex-1">
        Answered {entry.authorName ?? "the customer"} ·{" "}
        <span className="meta">{clockTime(at)}</span>
      </p>
      {!expired && (
        <form action={undo}>
          <input type="hidden" name="itemId" value={entry.itemId} />
          <input type="hidden" name="draftId" value={entry.draft!.id} />
          <button
            type="submit"
            disabled={undoing}
            className="hover:text-ink text-ink-2 min-h-11 px-2 text-sm font-medium underline underline-offset-4"
          >
            {undoing ? "Undoing…" : "Undo"}
          </button>
        </form>
      )}
      {state.error && (
        <p role="alert" className="text-danger w-full text-sm">
          {state.error}
        </p>
      )}
    </div>
  );
}

/**
 * The suggested reply as the composer under the conversation (design v2): the draft (editable),
 * what it's based on, "Approve and send", "Edit", "Don't reply", the DM window, and A / E / J.
 */
export function ApprovalCard({ entry, nextHref }: { entry: InboxEntry; nextHref: string | null }) {
  const router = useRouter();
  const draft = entry.draft!;
  const [state, action, pending] = useActionState<DecisionFormState, FormData>(decideDraft, {});
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(draft.editedBody ?? draft.body);
  const formRef = useRef<HTMLFormElement>(null);
  const approveRef = useRef<HTMLButtonElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const [intent, setIntent] = useState<"approve" | "reject" | null>(null);
  // T41: a comment can be answered under it or in the commenter's DMs (Waggle's pick first).
  const [via, setVia] = useState<"public" | "dm">(draft.replyVia);
  // The clock is read once, when the card opens (render must stay pure).
  const [openedAt] = useState(() => new Date());
  const dmLeft = entry.kind === "comment" ? privateReplyLeft(entry.receivedAt, openedAt) : null;
  const dmClosed =
    entry.kind === "comment" &&
    openedAt.getTime() >= privateReplyClosesAt(entry.receivedAt).getTime();

  useEffect(() => {
    if (editing) textRef.current?.focus();
  }, [editing]);

  // A approve · E edit · J next. Not while typing, and not with modifier keys.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target;
      if (
        target instanceof Element &&
        target.closest("input, textarea, select, [contenteditable=true]")
      ) {
        return;
      }
      const key = e.key.toLowerCase();
      if (key === "a" && !pending) {
        e.preventDefault();
        formRef.current?.requestSubmit(approveRef.current);
      } else if (key === "e") {
        e.preventDefault();
        setEditing(true);
      } else if (key === "j" && nextHref) {
        e.preventDefault();
        router.push(nextHref);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nextHref, pending, router]);

  useEffect(() => {
    if (state.rejected) router.refresh();
  }, [state.rejected, router]);
  useEffect(() => {
    if (state.approved) {
      addRecent({
        entry: { ...entry, draft: { ...draft, editedBody: text } },
        at: state.approved.at,
      });
      router.refresh();
    }
    // Only when an approval lands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.approved]);

  if (state.approved) return null;
  const left =
    entry.kind === "comment" ? (via === "dm" ? dmLeft : null) : windowLeft(entry.dmWindowClosesAt);
  const platform = entry.platform === "facebook" ? "Facebook" : "Instagram";
  const sending = pending && intent === "approve";

  return (
    <form
      ref={formRef}
      id={`item-${entry.itemId}`}
      aria-label="Suggested reply"
      action={(fd) => {
        setIntent(fd.get("intent") === "reject" ? "reject" : "approve");
        return action(fd);
      }}
      className="border-line-strong flex flex-col gap-3 rounded-xl border p-4"
    >
      <input type="hidden" name="itemId" value={entry.itemId} />
      <input type="hidden" name="draftId" value={draft.id} />
      {entry.kind === "comment" && (
        <fieldset className="flex flex-col gap-2">
          <legend className="meta mb-2">Where should this reply go?</legend>
          <span
            className="segmented self-start"
            role="radiogroup"
            aria-label="Where should this reply go?"
          >
            {(
              [
                ["public", "Reply publicly"],
                ["dm", "Reply in DM"],
              ] as const
            ).map(([value, label]) => (
              <label key={value} data-active={via === value || undefined}>
                <input
                  type="radio"
                  name="replyVia"
                  value={value}
                  checked={via === value}
                  disabled={pending || (value === "dm" && dmClosed)}
                  onChange={() => setVia(value)}
                  className="sr-only"
                />
                {label}
              </label>
            ))}
          </span>
          <span className="meta">
            {via === "dm"
              ? `${draft.replyVia === "dm" ? "Waggle picked DM because this asks to buy or book. " : ""}${
                  entry.authorName ?? "They"
                } gets it as a message from you on ${platform}. You can send one DM per comment.`
              : dmClosed
                ? "Everyone who sees the post can read it. It's too late to reply in DM."
                : "Everyone who sees the post can read it."}
          </span>
        </fieldset>
      )}
      {entry.kind === "review" && (
        <p className="text-ink-2 flex items-start gap-2 text-[13px]">
          <Globe className="mt-0.5 size-3.5 shrink-0" strokeWidth={2} aria-hidden />
          Public reply on your {platform} Page. Anyone who visits the Page will see it, so Waggle
          never sends these on its own.
        </p>
      )}
      <label htmlFor={`reply-${entry.itemId}`} className="meta">
        {draft.facts.length
          ? `Waggle's reply, from ${draft.facts.join(", ")}`
          : "Waggle's reply, written without business info"}
      </label>
      {editing ? (
        <textarea
          ref={textRef}
          id={`reply-${entry.itemId}`}
          name="body"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setEditing(false);
          }}
          maxLength={REPLY_MAX}
          rows={4}
          className="field"
        />
      ) : (
        <>
          <p id={`reply-${entry.itemId}`} className="text-[15px] whitespace-pre-wrap">
            {text}
          </p>
          <input type="hidden" name="body" value={text} />
        </>
      )}
      {state.error && (
        <p role="alert" className="danger-box">
          {state.error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          ref={approveRef}
          type="submit"
          name="intent"
          value="approve"
          variant="primary"
          disabled={pending}
          data-busy={sending || undefined}
        >
          {sending ? (
            <>
              <BeeSending />
              Sending
            </>
          ) : entry.kind === "review" ? (
            "Post reply"
          ) : via === "dm" && entry.kind === "comment" ? (
            "Send in DM"
          ) : (
            "Approve and send"
          )}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => setEditing((v) => !v)}
          disabled={pending}
        >
          {editing ? "Done editing" : "Edit"}
        </Button>
        <Button
          type="submit"
          name="intent"
          value="reject"
          variant="quiet"
          disabled={pending}
          formNoValidate
        >
          Don&apos;t reply
        </Button>
        <span className="meta ml-auto flex items-center gap-2">
          {left && (
            <span className="inline-flex items-center gap-1.5">
              <Clock3 className="size-4" strokeWidth={1.75} aria-hidden />
              {left}
            </span>
          )}
          <span className="hidden items-center gap-1 lg:inline-flex" aria-hidden>
            <span className="kbd">A</span>
            <span className="kbd">E</span>
            {nextHref && <span className="kbd">J</span>}
          </span>
        </span>
      </div>
    </form>
  );
}
