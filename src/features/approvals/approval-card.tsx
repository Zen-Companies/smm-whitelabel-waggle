"use client";

import { CircleCheck, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Avatar } from "@/components/app/avatar";
import { CategoryLabel } from "@/components/app/category-label";
import { clockTime, platformName, shortTime } from "@/components/app/time";
import { Button } from "@/components/ui/button";
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

function windowNote(closesAt: string | null) {
  if (!closesAt) return null;
  const hours = (new Date(closesAt).getTime() - Date.now()) / 3_600_000;
  if (hours <= 0) return "Instagram's 24-hour reply window has closed.";
  return hours < 1
    ? "The 24-hour reply window closes in under an hour."
    : `The 24-hour reply window closes in about ${Math.floor(hours)} h.`;
}

export function MessageHeader({ entry }: { entry: InboxEntry }) {
  return (
    <div className="flex items-start gap-3">
      <Avatar />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{entry.authorName ?? "A customer"}</p>
        <p className="meta">
          {platformName(entry.platform)} {entry.kind === "dm" ? "DM" : "comment"} ·{" "}
          <time dateTime={entry.receivedAt}>{shortTime(entry.receivedAt)}</time>
        </p>
      </div>
      <CategoryLabel category={entry.category} />
    </div>
  );
}

/** "Sent to [name] · 2:14 PM · Undo" for 8 seconds, then the item leaves the queue (§4). */
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
    <div className="card animate-settle flex flex-wrap items-center gap-3 px-5 py-3" role="status">
      <span className="bg-success-soft text-success inline-flex size-8 items-center justify-center rounded-full">
        <CircleCheck strokeWidth={1.75} className="size-5" aria-hidden />
      </span>
      <p className="flex-1">
        Sent to {entry.authorName ?? "the customer"} · <span className="meta">{clockTime(at)}</span>
      </p>
      {!expired && (
        <form action={undo}>
          <input type="hidden" name="itemId" value={entry.itemId} />
          <input type="hidden" name="draftId" value={entry.draft!.id} />
          <button
            type="submit"
            disabled={undoing}
            className="hover:text-ink min-h-11 px-2 text-sm font-medium text-gray-700 underline underline-offset-4"
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
 * The approval card (docs/design.md §3): customer message, the draft in a gray-50 box (editable),
 * "Approve and send" pill, "Edit", "Don't reply", and keyboard shortcuts A / E / J.
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
  const note = windowNote(entry.dmWindowClosesAt);
  const sending = pending && intent === "approve";

  return (
    <article
      id={`item-${entry.itemId}`}
      className="card-lifted flex flex-col gap-4 p-5 md:p-6"
      aria-label={`Reply to ${entry.authorName ?? "a customer"}`}
    >
      <MessageHeader entry={entry} />
      <p className="whitespace-pre-wrap">{entry.text || "(no text)"}</p>

      <form
        ref={formRef}
        action={(fd) => {
          setIntent(fd.get("intent") === "reject" ? "reject" : "approve");
          return action(fd);
        }}
        className="flex flex-col gap-3"
      >
        <input type="hidden" name="itemId" value={entry.itemId} />
        <input type="hidden" name="draftId" value={draft.id} />
        <div className="flex flex-col gap-2 rounded-md bg-gray-50 p-4">
          <label htmlFor={`reply-${entry.itemId}`} className="meta">
            Suggested reply
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
              <p id={`reply-${entry.itemId}`} className="whitespace-pre-wrap">
                {text}
              </p>
              <input type="hidden" name="body" value={text} />
            </>
          )}
        </div>
        <p className="meta">
          {draft.facts.length
            ? `Based on your business info: ${draft.facts.join(", ")}`
            : "Written without business info."}
          {note && <span className="block">{note}</span>}
        </p>
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
                <LoaderCircle className="animate-spin" strokeWidth={1.75} aria-hidden />
                Sending
              </>
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
          <p className="meta ml-auto hidden items-center gap-2 lg:flex" aria-hidden>
            <span className="kbd">A</span> approve <span className="kbd">E</span> edit
            {nextHref && (
              <>
                <span className="kbd">J</span> next
              </>
            )}
          </p>
        </div>
      </form>
    </article>
  );
}
