"use client";

import { AnswerCombs } from "@/components/app/bee-setup";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
// The server action file directly: the approvals index also exports server-only code, which a
// client component must not pull in.
import { decideDraft, ownerReplyAction } from "@/features/approvals/actions";
import { answerWaitingMessage, goToSetupScreen, skipWaitingMessages } from "./actions";
import { plural } from "./copy";
import type { SetupScreen } from "./flow";
import type { WaitingMessage } from "./setup-data";
import { PRIMARY, QUIET, ScreenButton, ScreenFooter, ScreenTitle } from "./setup-frame";
import { AnswerMeter } from "./setup-parts";

// 3.3 "N customers need you" (Walter's flow, paged, approved 20 Nov; board "Setup, start to
// finish", 23 Nov): one at a time, complaints first. Where Waggle tried but lacked the facts, the
// owner types them; they're saved as business info and Waggle writes the reply, saved as a draft
// (Send it here, or later from the Inbox). Where Waggle wrote nothing (a complaint, unclear, out
// of AI replies), the owner writes the reply. "Answer later in Inbox" leaves it there.

type Outcome =
  | { kind: "reply"; draftId: string; body: string; sent?: boolean }
  | { kind: "queued" }
  | { kind: "still" }
  | { kind: "sent" }
  | { kind: "skipped" };

export function WaitingScreen({
  messages,
  meter,
  top,
  next,
  back,
  index,
  count,
}: {
  messages: WaitingMessage[];
  meter: { approved: number; total: number };
  top?: ReactNode;
  next: SetupScreen;
  back: SetupScreen | null;
  index: number;
  count: number;
}) {
  const router = useRouter();
  const [at, setAt] = useState(0);
  const [facts, setFacts] = useState<Record<string, string>>({});
  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [skippingAll, startSkipAll] = useTransition();

  const m = messages[Math.min(at, messages.length - 1)];
  const outcome = m ? outcomes[m.itemId] : undefined;
  const open = messages.filter((x) => !outcomes[x.itemId]);
  const set = (id: string, o: Outcome) => setOutcomes((s) => ({ ...s, [id]: o }));
  const goNext = () => {
    setError(null);
    if (at < messages.length - 1) setAt(at + 1);
  };

  return (
    <>
      <AnswerMeter approved={meter.approved} total={meter.total} />
      {top}
      <ScreenTitle
        title={`${plural(messages.length, "customer needs", "customers need")} you`}
        sub="Waggle didn’t have the answer."
      />
      {/* One cell fills, and the bee hops to it, for each customer answered (approved 21 Nov). */}
      <AnswerCombs
        done={
          messages.filter((x) => ["reply", "sent"].includes(outcomes[x.itemId]?.kind ?? "")).length
        }
        of={messages.length}
      />
      {m && (
        <div className="card flex flex-col gap-2.5 p-3">
          <span className="flex items-center justify-between gap-2 text-[12.5px]">
            <span className="min-w-0 break-words">
              <b className="font-semibold">{m.author}</b>{" "}
              <span className={m.category === "complaint" ? "text-danger" : "text-ink-3"}>
                · {m.kind === "dm" ? "DM" : "comment"}
                {m.category === "complaint" ? " · complaint" : ""}
              </span>
            </span>
            <span className="text-ink-3 flex items-center gap-1 tabular-nums">
              {at + 1} of {messages.length}
              <button
                type="button"
                aria-label="Previous customer"
                disabled={at === 0}
                onClick={() => setAt(at - 1)}
                className="hover:bg-subtle inline-flex size-8 items-center justify-center rounded-lg disabled:opacity-35"
              >
                <ChevronLeft className="size-4" aria-hidden />
              </button>
              <button
                type="button"
                aria-label="Next customer"
                disabled={at >= messages.length - 1}
                onClick={() => setAt(at + 1)}
                className="hover:bg-subtle inline-flex size-8 items-center justify-center rounded-lg disabled:opacity-35"
              >
                <ChevronRight className="size-4" aria-hidden />
              </button>
            </span>
          </span>
          <span className="bg-subtle max-w-[92%] self-start rounded-xl px-2.5 py-1.5 text-[13px] break-words whitespace-pre-line">
            {m.text}
          </span>

          {outcome?.kind === "reply" ? (
            <>
              <span className="bg-honey-tint max-w-[88%] self-end rounded-xl px-2.5 py-1.5 text-[13px] break-words whitespace-pre-line">
                {outcome.body}
              </span>
              <span className="text-ink-3 text-xs">
                Saved to your business info.{" "}
                {outcome.sent ? "Sent." : "The reply waits in your Inbox until you send it."}
              </span>
              {!outcome.sent && (
                <span className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    className={PRIMARY}
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        const fd = new FormData();
                        fd.set("intent", "approve");
                        fd.set("itemId", m.itemId);
                        fd.set("draftId", outcome.draftId);
                        const r = await decideDraft({}, fd);
                        if (r.error) setError(r.error);
                        else {
                          set(m.itemId, { ...outcome, sent: true });
                          goNext();
                        }
                      })
                    }
                  >
                    {pending ? "Sending…" : "Send it"}
                  </button>
                  <button type="button" className={QUIET} onClick={goNext}>
                    Next customer
                  </button>
                </span>
              )}
            </>
          ) : outcome?.kind === "queued" ? (
            <p className="text-ink-2 text-sm" role="status">
              Saved. Waggle is writing the reply; it’ll be in your Inbox in a minute.
            </p>
          ) : outcome?.kind === "still" ? (
            <p className="text-ink-2 text-sm" role="status">
              Saved. Waggle still needs more to go on, so this one stays in your Inbox for you.
            </p>
          ) : outcome?.kind === "sent" ? (
            <p className="text-ink-2 text-sm" role="status">
              Sent. {m.author} will see your reply in a moment.
            </p>
          ) : outcome?.kind === "skipped" ? (
            <p className="text-ink-2 text-sm" role="status">
              It stays in your Inbox for you to answer.
            </p>
          ) : (
            <>
              <label className="sr-only" htmlFor={`facts-${m.itemId}`}>
                {m.ownReply ? "Your reply" : "What’s the answer? Just the facts."}
              </label>
              <textarea
                id={`facts-${m.itemId}`}
                rows={2}
                value={facts[m.itemId] ?? ""}
                onChange={(e) => setFacts((f) => ({ ...f, [m.itemId]: e.target.value }))}
                placeholder={
                  m.ownReply ? "Write your reply…" : "What’s the answer? Just the facts."
                }
                className="field border-honey text-[13px]"
              />
              {!m.ownReply && (
                <span className="text-ink-3 text-xs">
                  Tell Waggle the facts and it writes the reply.
                </span>
              )}
              <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                <button
                  type="button"
                  className={QUIET}
                  onClick={() => {
                    set(m.itemId, { kind: "skipped" });
                    void skipWaitingMessages({ itemIds: [m.itemId] });
                    goNext();
                  }}
                >
                  Answer later in Inbox
                </button>
                {m.ownReply ? (
                  <button
                    type="button"
                    disabled={pending || !(facts[m.itemId] ?? "").trim()}
                    data-busy={pending || undefined}
                    className={PRIMARY}
                    onClick={() =>
                      start(async () => {
                        setError(null);
                        const fd = new FormData();
                        fd.set("itemId", m.itemId);
                        fd.set("body", facts[m.itemId] ?? "");
                        const r = await ownerReplyAction({}, fd);
                        if (r.error) setError(r.error);
                        else {
                          set(m.itemId, { kind: "sent" });
                          goNext();
                        }
                      })
                    }
                  >
                    {pending ? "Sending…" : "Send reply"}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={pending || !(facts[m.itemId] ?? "").trim()}
                    data-busy={pending || undefined}
                    className="bg-ink text-surface hover:bg-ink-2 inline-flex min-h-10 items-center rounded-xl px-3.5 text-sm font-semibold disabled:opacity-60"
                    onClick={() =>
                      start(async () => {
                        setError(null);
                        const r = await answerWaitingMessage({
                          itemId: m.itemId,
                          facts: facts[m.itemId] ?? "",
                        });
                        if (r.error) setError(r.error);
                        else if (r.reply) set(m.itemId, { kind: "reply", ...r.reply });
                        else if (r.queued) set(m.itemId, { kind: "queued" });
                        else set(m.itemId, { kind: "still" });
                      })
                    }
                  >
                    {pending ? "Writing…" : "Write the reply"}
                  </button>
                )}
              </span>
            </>
          )}
          {error && (
            <p role="alert" className="text-danger text-sm">
              {error}
            </p>
          )}
        </div>
      )}
      <ScreenFooter
        back={back}
        index={index}
        count={count}
        extra={
          open.length > 0 ? (
            <button
              type="button"
              className={QUIET}
              disabled={skippingAll}
              onClick={() =>
                startSkipAll(async () => {
                  await skipWaitingMessages({ itemIds: open.map((x) => x.itemId) });
                  const fd = new FormData();
                  fd.set("screen", next);
                  await goToSetupScreen(fd);
                  router.refresh();
                })
              }
            >
              Skip all {open.length}
            </button>
          ) : null
        }
        primary={
          <ScreenButton to={next} className={PRIMARY}>
            Next
          </ScreenButton>
        }
      />
    </>
  );
}
