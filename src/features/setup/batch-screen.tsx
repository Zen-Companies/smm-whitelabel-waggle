"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { decideDraft } from "@/features/approvals";
import { sendSetupReplies } from "./actions";
import { plural, replyMeta, sendingLine } from "./copy";
import type { SetupScreen } from "./flow";
import { PRIMARY, QUIET, ScreenButton, ScreenFooter, ScreenTitle } from "./setup-frame";
import { AnswerMeter, Exchange, PagedList } from "./setup-parts";
import type { BatchReply } from "./topics";

// 3.1 "N people want to buy" and 3.2 "N quick questions" (Walter's flow, paged, approved 20 Nov):
// Waggle's replies in one batch, a page at a time; tap one to change it and send it alone; "Send N
// replies" confirms in place, approves each through the normal approval (policy, undo window,
// 25 s spacing) and opens the next screen at once while they go out.

const PAGE = 2;

export function BatchScreen({
  title,
  sub,
  replies,
  unchecked,
  platformWord,
  meter,
  top,
  next,
  back,
  index,
  count,
  spacingMs,
  canSend,
}: {
  title: string;
  sub: string;
  replies: BatchReply[];
  unchecked: Record<string, string[]>;
  /** "Instagram", for the highlight note. */
  platformWord: string;
  meter: { approved: number; total: number };
  /** The progress card, on the screen after a batch was sent. */
  top?: ReactNode;
  next: SetupScreen;
  back: SetupScreen | null;
  index: number;
  count: number;
  spacingMs: number;
  canSend: boolean;
}) {
  const router = useRouter();
  const [sentHere, setSentHere] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const isApproved = (r: BatchReply) => r.approved || sentHere.has(r.itemId);
  const waiting = replies.filter((r) => !isApproved(r));
  const approvedCount = meter.approved + sentHere.size;
  const marked = replies.some((r) => (unchecked[r.draftId] ?? []).length > 0);

  function sendAll() {
    setError(null);
    start(async () => {
      const r = await sendSetupReplies({
        pairs: waiting.map((w) => `${w.itemId}:${w.draftId}`),
        next,
      });
      if (r.error) {
        setError(r.error);
        setConfirm(false);
        return;
      }
      router.push(`/setup?screen=${next}`);
    });
  }

  const names = waiting
    .slice(0, 3)
    .map((w) => w.author ?? "a customer")
    .join(", ");
  const others = waiting.length - Math.min(3, waiting.length);

  return (
    <>
      <AnswerMeter approved={approvedCount} total={meter.total} />
      {top}
      <ScreenTitle title={title} sub={sub} />
      <PagedList
        items={replies}
        size={PAGE}
        label="Waggle’s replies"
        render={(r) => {
          const done = isApproved(r);
          return (
            <li key={r.itemId}>
              {editing === r.itemId && !done ? (
                <EditReply
                  reply={r}
                  onCancel={() => setEditing(null)}
                  onSent={() => {
                    setSentHere((s) => new Set(s).add(r.itemId));
                    setEditing(null);
                  }}
                />
              ) : (
                <Exchange
                  name={r.author ?? "A customer"}
                  meta={done ? replyMeta({ ...r, status: "sending" }) : replyMeta(r)}
                  metaTone={done ? "success" : r.hoursLeft !== null ? "danger" : "muted"}
                  question={r.text}
                  reply={r.reply}
                  marks={unchecked[r.draftId]}
                >
                  {!done && canSend && (
                    <button
                      type="button"
                      onClick={() => setEditing(r.itemId)}
                      className="text-ink-3 hover:text-ink self-end text-xs font-medium"
                    >
                      Change it
                    </button>
                  )}
                </Exchange>
              )}
            </li>
          );
        }}
      />
      {marked && (
        <p className="text-ink-3 text-xs">
          <mark className="border-honey-border rounded border bg-[#FFF4D9] px-1 text-inherit dark:bg-[#3A2E12]">
            Highlighted
          </mark>{" "}
          facts came from your {platformWord}. Sending one counts as checking it.
        </p>
      )}
      {error && (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      )}
      {confirm && waiting.length > 0 && (
        <p
          role="status"
          className="border-honey-border bg-honey-tint rounded-xl border p-3 text-sm"
        >
          <b className="font-semibold">Send {plural(waiting.length, "reply", "replies")}?</b> To{" "}
          {names}
          {others > 0 ? ` and ${others} more` : ""}. {sendingLine(waiting.length, spacingMs)}
        </p>
      )}
      <ScreenFooter
        back={back}
        index={index}
        count={count}
        extra={
          confirm ? (
            <button type="button" className={QUIET} onClick={() => setConfirm(false)}>
              Cancel
            </button>
          ) : waiting.length > 0 ? (
            <ScreenButton to={next} className={QUIET}>
              Not now
            </ScreenButton>
          ) : null
        }
        primary={
          waiting.length === 0 || !canSend ? (
            <ScreenButton to={next} className={PRIMARY}>
              Next
            </ScreenButton>
          ) : confirm ? (
            <button
              type="button"
              className={PRIMARY}
              disabled={pending}
              data-busy={pending || undefined}
              onClick={sendAll}
            >
              {pending ? "Sending…" : `Send ${waiting.length}`}
            </button>
          ) : (
            <button type="button" className={PRIMARY} onClick={() => setConfirm(true)}>
              Send {plural(waiting.length, "reply", "replies")}
            </button>
          )
        }
      />
    </>
  );
}

/** One reply changed in place and sent alone (the Inbox's approve with an edit). */
function EditReply({
  reply,
  onCancel,
  onSent,
}: {
  reply: BatchReply;
  onCancel: () => void;
  onSent: () => void;
}) {
  const [body, setBody] = useState(reply.reply);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-2 px-3 py-2.5">
      <span className="text-[12.5px]">
        <b className="font-semibold">{reply.author ?? "A customer"}</b>
      </span>
      <span className="bg-subtle max-w-[92%] self-start rounded-xl px-2.5 py-1.5 text-[13px] break-words whitespace-pre-line">
        {reply.text}
      </span>
      <label className="flex flex-col gap-1 text-xs font-medium">
        Your reply
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          className="field text-[13px] font-normal"
        />
      </label>
      {error && (
        <p role="alert" className="text-danger text-xs">
          {error}
        </p>
      )}
      <span className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className={PRIMARY}
          disabled={pending}
          data-busy={pending || undefined}
          onClick={() =>
            start(async () => {
              const fd = new FormData();
              fd.set("intent", "approve");
              fd.set("itemId", reply.itemId);
              fd.set("draftId", reply.draftId);
              fd.set("body", body);
              const r = await decideDraft({}, fd);
              if (r.error) setError(r.error);
              else onSent();
            })
          }
        >
          {pending ? "Sending…" : "Send this one"}
        </button>
        <button type="button" className={QUIET} onClick={onCancel}>
          Cancel
        </button>
      </span>
    </div>
  );
}
