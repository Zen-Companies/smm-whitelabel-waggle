"use client";

import { Check, Clock3 } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";
import { shortTime } from "@/components/app/time";
import { Button } from "@/components/ui/button";
import { cn } from "cn";
import {
  runRecentMessages,
  saveCorrection,
  tryMessage,
  type CorrectionState,
  type PracticeState,
  type PracticeTry,
  type RecentMessagesState,
} from "./practice-actions";
import {
  CORRECTION_CHOICES,
  FEEDBACK_NOTE,
  triesLeftText,
  type PracticeCard,
} from "./practice-copy";

// The owner's Lab, left column (T26, T36; design v2 canvas, row 4): try a message or the last real
// messages, see what would happen in plain words, keep recent tries. Practice only: nothing is posted.

function Feedback({ tried }: { tried: PracticeTry }) {
  const [state, action, pending] = useActionState<CorrectionState, FormData>(saveCorrection, {});
  const [open, setOpen] = useState(false);
  if (state.saved) {
    return (
      <p role="status" className="inline-flex items-center gap-1 text-sm">
        <Check className="text-success size-4" strokeWidth={1.75} aria-hidden />
        Saved. It&apos;s used to check your receptionist as it changes.
      </p>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-2 border-t pt-3.5">
      <input type="hidden" name="kind" value={tried.kind} />
      <input type="hidden" name="text" value={tried.text} />
      {!open ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-gray-700">Did it get this right?</span>
          {tried.card.category && (
            <Button type="submit" name="category" value={tried.card.category} disabled={pending}>
              Right
            </Button>
          )}
          <Button type="button" variant="quiet" onClick={() => setOpen(true)}>
            Not quite
          </Button>
        </div>
      ) : (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">What is this message?</legend>
          <div className="flex flex-wrap gap-2">
            {CORRECTION_CHOICES.map((c) => (
              <Button
                key={c.category}
                type="submit"
                name="category"
                value={c.category}
                disabled={pending}
              >
                {c.label}
              </Button>
            ))}
          </div>
        </fieldset>
      )}
      <span className="meta">{FEEDBACK_NOTE}</span>
      {state.error && (
        <p role="alert" className="text-danger text-sm">
          {state.error}
        </p>
      )}
    </form>
  );
}

/** What would happen, in the inbox's own shape: their message, the reply, one plain line. */
function Outcome({ card }: { card: PracticeCard }) {
  return (
    <>
      {card.looksLike && (
        <span className="text-sm">
          Looks like <span className="font-semibold">{card.looksLike}</span>
        </span>
      )}
      {card.reply && (
        <div className="flex max-w-[85%] flex-col items-end gap-1 self-end">
          <span className="meta">What I&apos;d reply</span>
          <p className="rounded-[16px_16px_4px_16px] border border-gray-200 bg-white px-3.5 py-2.5 whitespace-pre-wrap">
            {card.reply}
          </p>
          {card.basedOn && <span className="meta">Based on: {card.basedOn}</span>}
        </div>
      )}
      <p
        className={cn(
          "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl px-3.5 py-2.5 text-sm font-medium",
          card.tone === "owner" ? "bg-amber-soft text-amber-text" : "bg-gray-50",
          card.tone === "error" && "text-danger",
        )}
      >
        {card.tone === "reply" && <Clock3 className="size-4" strokeWidth={1.75} aria-hidden />}
        {card.next}
        {card.offerAddAnswer && (
          <Link href="/knowledge-base?topic=new" className="text-violet-strong">
            Add an answer
          </Link>
        )}
      </p>
      {card.leadDetails && (
        <span className="meta">Details I&apos;d save to Leads: {card.leadDetails}</span>
      )}
    </>
  );
}

function ResultCard({ tried }: { tried: PracticeTry }) {
  return (
    <article
      aria-live="polite"
      aria-label="Result"
      className="card-lifted flex flex-col gap-3.5 p-5"
    >
      <div className="flex max-w-[75%] flex-col gap-1">
        <span className="meta">{tried.kind === "dm" ? "A DM" : "A comment"}</span>
        <p className="rounded-[16px_16px_16px_4px] bg-gray-50 px-3.5 py-2.5">{tried.text}</p>
      </div>
      <Outcome card={tried.card} />
      {tried.card.tone !== "error" && <Feedback key={tried.id} tried={tried} />}
    </article>
  );
}

function RecentTries({
  tries,
  onTryAgain,
}: {
  tries: PracticeTry[];
  onTryAgain: (t: PracticeTry) => void;
}) {
  if (tries.length === 0) return null;
  return (
    <section aria-labelledby="recent-tries" className="card flex flex-col gap-1 p-5">
      <h2 id="recent-tries" className="font-semibold">
        Your recent tries
      </h2>
      <p className="meta">Try one again after you add business info to see the difference.</p>
      <ul className="flex flex-col divide-y">
        {tries.map((t) => (
          <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
            <span className="flex min-w-0 flex-[1_1_240px] flex-col">
              <span className="truncate text-sm font-medium">&ldquo;{t.text}&rdquo;</span>
              <span className="meta">
                {t.kind === "dm" ? "DM" : "Comment"} · {shortTime(t.at)}
              </span>
            </span>
            <span
              className={cn(
                "text-sm",
                t.card.tone === "owner" ? "text-amber-text font-medium" : "text-gray-700",
              )}
            >
              {t.card.offerAddAnswer ? "Your info doesn't answer it" : t.card.next.split(":")[0]}
            </span>
            {t.card.offerAddAnswer ? (
              <Link
                href="/knowledge-base?topic=new"
                className="text-violet-strong flex min-h-11 items-center text-sm font-medium"
              >
                Add an answer
              </Link>
            ) : (
              <Button variant="quiet" onClick={() => onTryAgain(t)}>
                Try again
              </Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function RecentMessages({ triesLeft }: { triesLeft: number }) {
  const [state, action, pending] = useActionState<RecentMessagesState, FormData>(
    runRecentMessages,
    {},
  );
  const left = state.triesLeft ?? triesLeft;
  const replies = state.results?.filter((r) => r.card.reply).length ?? 0;
  return (
    <div className="flex flex-col gap-4">
      <form
        action={action}
        className="flex flex-wrap items-center gap-3 rounded-xl bg-gray-50 px-4 py-3.5"
      >
        <span className="flex-[1_1_280px] text-sm">
          What would your receptionist say today to the last messages you got? Uses one try per
          message.
        </span>
        <Button
          type="submit"
          variant="primary"
          disabled={pending || left <= 0}
          data-busy={pending || undefined}
        >
          {pending ? "Trying…" : `Run my last ${Math.min(5, left) || 5} messages`}
        </Button>
      </form>
      {state.error && (
        <p role="alert" className="text-danger text-sm">
          {state.error}
        </p>
      )}
      {state.results && !pending && (
        <>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <span className="font-semibold">Last {state.results.length} messages</span>
            <span className="meta">
              {replies} would get a reply · {state.results.length - replies} would come to you
            </span>
          </div>
          <ul className="flex flex-col divide-y">
            {state.results.map((r) => (
              <li
                key={r.itemId}
                className="grid gap-4 py-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]"
              >
                <div className="flex flex-col gap-1.5">
                  <span className="flex flex-col">
                    <span className="font-semibold">{r.who}</span>
                    <span className="meta">
                      {r.kind === "dm" ? "DM" : "Comment"} · {shortTime(r.receivedAt)}
                    </span>
                  </span>
                  <p className="rounded-[16px_16px_16px_4px] bg-gray-50 px-3.5 py-2.5 text-sm">
                    {r.text}
                  </p>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Outcome card={r.card} />
                  <span className="meta">{r.then}</span>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export function PracticeBox({
  triesLeft: initialLeft,
  examples,
  examplesFromTopics,
  recentTries,
}: {
  triesLeft: number;
  examples: string[];
  examplesFromTopics: boolean;
  recentTries: PracticeTry[];
}) {
  const [state, action, pending] = useActionState<PracticeState, FormData>(tryMessage, {});
  const [view, setView] = useState<"type" | "recent">("type");
  const [kind, setKind] = useState<"comment" | "dm">("comment");
  const [text, setText] = useState("");
  const left = state.triesLeft ?? initialLeft;
  const tries = state.tried
    ? [state.tried, ...recentTries.filter((t) => t.id !== state.tried!.id)].slice(0, 5)
    : recentTries;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <section aria-labelledby="practice-heading" className="card flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="practice-heading" className="section-title">
            Try a message
          </h2>
          <span className="meta">{triesLeftText(left)}</span>
        </div>
        <div role="tablist" aria-label="How to try" className="segmented self-start">
          {(
            [
              ["type", "Type a message"],
              ["recent", "Your recent messages"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={view === key}
              data-active={view === key || undefined}
              onClick={() => setView(key)}
            >
              {label}
            </button>
          ))}
        </div>

        {view === "type" ? (
          <form action={action} className="flex flex-col gap-4">
            <span className="segmented self-start" role="radiogroup" aria-label="Kind of message">
              {(["comment", "dm"] as const).map((k) => (
                <label key={k} data-active={kind === k || undefined}>
                  <input
                    type="radio"
                    name="kind"
                    value={k}
                    checked={kind === k}
                    onChange={() => setKind(k)}
                    className="sr-only"
                  />
                  {k === "dm" ? "A DM" : "A comment"}
                </label>
              ))}
            </span>
            <label htmlFor="practice-text" className="sr-only">
              Customer message
            </label>
            <textarea
              id="practice-text"
              name="text"
              rows={2}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Type what a customer might write…"
              className="field"
            />
            <div className="flex flex-col gap-2">
              <span className="meta">
                {examplesFromTopics
                  ? "From your business info"
                  : "Examples to start with (add business info for your own)"}
              </span>
              <div className="flex flex-wrap gap-2">
                {examples.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setText(s)}
                    className="min-h-9 rounded-full border border-gray-200 px-3.5 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="submit"
                variant="primary"
                disabled={pending || left <= 0 || !text.trim()}
                data-busy={pending || undefined}
              >
                {pending ? "Trying…" : "Try it"}
              </Button>
              {state.error && (
                <span role="alert" className="text-danger text-sm">
                  {state.error}
                </span>
              )}
            </div>
          </form>
        ) : (
          <RecentMessages triesLeft={left} />
        )}
      </section>

      {view === "type" && state.tried && !pending && <ResultCard tried={state.tried} />}
      {view === "type" && (
        <RecentTries
          tries={tries}
          onTryAgain={(t) => {
            setKind(t.kind);
            setText(t.text);
            document.getElementById("practice-text")?.focus();
          }}
        />
      )}
    </div>
  );
}
