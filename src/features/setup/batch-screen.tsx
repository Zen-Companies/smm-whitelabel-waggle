"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { cn } from "cn";
import { BeeDance } from "@/components/app/bee-setup";
// The server action file directly: the approvals index also exports server-only code, which a
// client component must not pull in.
import { decideDraft } from "@/features/approvals/actions";
import { sendSetupReplies } from "./actions";
import { plural, replyMeta, sendingLine } from "./copy";
import type { SetupScreen } from "./flow";
import { PRIMARY, QUIET, ScreenButton, ScreenFooter, ScreenTitle } from "./setup-frame";
import { AnswerMeter, Exchange, PagedList } from "./setup-parts";
import type { BatchReply } from "./topics";
import { useHoldWayOut } from "./way-out";

// 3.1 "N people want to buy" and 3.2 "N quick questions" (Walter's flow, paged, approved 20 Nov;
// board "Setup, start to finish", 23 Nov): Waggle's replies in one batch, a page at a time, each
// ticked; untick any you'd rather not send, tap one to change it and send it alone. "Send N
// replies" shows "Sending N replies…" in place with Undo for 8 seconds, then approves each through
// the normal approval (policy, undo window, 25 s spacing) and opens the next screen while they go.
// While Undo shows, Back and Finish later are hidden; if the screen goes anyway (the browser's
// back), the queued replies are sent at once rather than dropped.

const PAGE = 2;
/** Undo after Send, before anything leaves (design.md §5). */
const UNDO_MS = 8_000;

function Tick({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-[18px] shrink-0 items-center justify-center rounded-[5px] text-[11px]",
        on ? "bg-ink text-surface" : "border-line-strong border-[1.5px]",
      )}
    >
      {on ? "✓" : ""}
    </span>
  );
}

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
  const [unticked, setUnticked] = useState<Set<string>>(new Set());
  /** After Send: the pairs waiting out the undo seconds. */
  const [queued, setQueued] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  /** The pairs still waiting out Undo: sent at once if the screen goes before the timer. */
  const unsent = useRef<{ pairs: string[]; next: SetupScreen } | null>(null);
  useHoldWayOut(!!queued);

  const isApproved = (r: BatchReply) => r.approved || sentHere.has(r.itemId);
  const waiting = replies.filter((r) => !isApproved(r));
  const ticked = waiting.filter((r) => !unticked.has(r.itemId));
  const approvedCount = meter.approved + sentHere.size;
  const marked = replies.some((r) => (unchecked[r.draftId] ?? []).length > 0);

  // Undo had its seconds: now they go.
  useEffect(() => {
    if (!queued) return;
    unsent.current = { pairs: queued, next };
    const t = setTimeout(() => {
      unsent.current = null;
      start(async () => {
        const r = await sendSetupReplies({ pairs: queued, next });
        if (r.error) {
          setError(r.error);
          setQueued(null);
          return;
        }
        router.push(`/setup?screen=${next}`);
      });
    }, UNDO_MS);
    return () => clearTimeout(t);
  }, [queued, next, router]);

  // Left during Undo (not by Undo, which clears it first): send now instead of dropping them.
  useEffect(
    () => () => {
      const left = unsent.current;
      unsent.current = null;
      if (left) void sendSetupReplies(left);
    },
    [],
  );

  const undo = () => {
    unsent.current = null;
    setQueued(null);
  };

  const toggle = (id: string) =>
    setUnticked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

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
          const pick = !done && canSend && editing !== r.itemId;
          return (
            <li key={r.itemId} className={cn(pick && "flex items-start gap-1 pl-3")}>
              {pick && (
                <label className="flex min-h-11 cursor-pointer items-start pt-2.5">
                  <input
                    type="checkbox"
                    checked={!unticked.has(r.itemId)}
                    onChange={() => toggle(r.itemId)}
                    disabled={!!queued}
                    className="sr-only"
                    aria-label={`Send the reply to ${r.author ?? "this customer"}`}
                  />
                  <Tick on={!unticked.has(r.itemId)} />
                </label>
              )}
              <div className="min-w-0 flex-1">
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
                    dm={r.kind === "dm"}
                    meta={done ? replyMeta({ ...r, status: "sending" }) : replyMeta(r)}
                    metaTone={done ? "success" : r.hoursLeft !== null ? "danger" : "muted"}
                    question={r.text}
                    reply={r.reply}
                    marks={unchecked[r.draftId]}
                  >
                    {!done && canSend && !queued && (
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
              </div>
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
      {queued && (
        <div role="status" className="card flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5">
          <BeeDance times="loop" scale={0.2} />
          <span className="min-w-[200px] flex-1 text-[13px]">
            <b className="font-semibold">Sending {plural(queued.length, "reply", "replies")}…</b>
            <br />
            <span className="text-ink-2">{sendingLine(queued.length, spacingMs)}</span>
          </span>
          {!pending && (
            <button type="button" className={QUIET} onClick={undo}>
              Undo
            </button>
          )}
        </div>
      )}
      <ScreenFooter
        back={queued ? null : back}
        index={index}
        count={count}
        extra={
          queued ? null : waiting.length > 0 && canSend && ticked.length === 0 ? (
            <>
              <span className="text-ink-3 text-[12.5px]">Tick at least one to send</span>
              <button
                type="button"
                disabled
                className="border-line-strong text-ink-3 inline-flex min-h-11 items-center rounded-xl border px-4 text-sm font-semibold"
              >
                Send
              </button>
            </>
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
          ) : queued ? (
            <button type="button" className={PRIMARY} disabled data-busy>
              Sending…
            </button>
          ) : ticked.length === 0 ? (
            <ScreenButton to={next} className={PRIMARY}>
              Skip
            </ScreenButton>
          ) : (
            <button
              type="button"
              className={PRIMARY}
              onClick={() => {
                setError(null);
                setEditing(null);
                setQueued(ticked.map((w) => `${w.itemId}:${w.draftId}`));
              }}
            >
              Send {plural(ticked.length, "reply", "replies")}
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
