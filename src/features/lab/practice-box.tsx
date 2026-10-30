"use client";

import { Check, MessageCircleQuestion } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "cn";
import {
  saveCorrection,
  tryMessage,
  type CorrectionState,
  type PracticeState,
  type PracticeTry,
} from "./practice-actions";
import { CORRECTION_CHOICES, triesLeftText } from "./practice-copy";

// "Try a message" (T26): what the receptionist would do with a message, in plain words, before
// the owner lets it reply on its own. Practice only: nothing is posted.

const SAMPLES = [
  "What time do you open on Sunday?",
  "How much is it?",
  "Can I book for this Saturday?",
  "My order still hasn't arrived.",
  "Follow for follow? 🔥",
];

function Feedback({ tried }: { tried: PracticeTry }) {
  const [state, action, pending] = useActionState<CorrectionState, FormData>(saveCorrection, {});
  const [open, setOpen] = useState(false);
  if (state.saved) {
    return (
      <p role="status" className="inline-flex items-center gap-1 text-sm">
        <Check className="text-success size-4" strokeWidth={1.75} aria-hidden />
        Thanks. This helps your receptionist learn your business.
      </p>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-3">
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
      {state.error && (
        <p role="alert" className="text-danger text-sm">
          {state.error}
        </p>
      )}
    </form>
  );
}

function ResultCard({ tried }: { tried: PracticeTry }) {
  const { card } = tried;
  return (
    <div className="card flex flex-col gap-4 p-5" aria-live="polite">
      <div className="flex flex-col gap-1">
        <span className="meta">{tried.kind === "dm" ? "DM" : "Comment"}</span>
        <p className="font-semibold">“{tried.text}”</p>
      </div>
      {card.looksLike && (
        <p className="text-sm">
          Looks like: <span className="font-semibold">{card.looksLike}</span>
        </p>
      )}
      {card.reply && (
        <div className="flex flex-col gap-1">
          <span className="text-sm text-gray-700">I&apos;d reply:</span>
          <p className="bg-lavender rounded-md p-3 text-sm whitespace-pre-wrap">{card.reply}</p>
          {card.usedInfo.length > 0 && (
            <span className="meta">Used your info: {card.usedInfo.join(", ")}</span>
          )}
        </div>
      )}
      <p
        className={cn(
          "text-sm font-medium",
          card.tone === "error" && "text-danger",
          card.tone === "owner" && "text-amber-text",
        )}
      >
        {card.next}
      </p>
      {card.offerAddAnswer && (
        <Link
          href="/knowledge-base?topic=new"
          className={cn(buttonVariants({ variant: "secondary" }), "self-start")}
        >
          Add an answer
        </Link>
      )}
      {card.tone !== "error" && <Feedback key={tried.text} tried={tried} />}
    </div>
  );
}

export function PracticeBox({ triesLeft: initialLeft }: { triesLeft: number }) {
  const [state, action, pending] = useActionState<PracticeState, FormData>(tryMessage, {});
  const [kind, setKind] = useState<"comment" | "dm">("comment");
  const [text, setText] = useState("");
  const left = state.triesLeft ?? initialLeft;

  return (
    <section className="flex flex-col gap-4" aria-labelledby="practice-heading">
      <div>
        <h2 id="practice-heading" className="section-title flex items-center gap-2">
          <MessageCircleQuestion strokeWidth={1.75} className="size-5" aria-hidden />
          Try a message
        </h2>
        <p className="text-gray-700">
          See what your receptionist would do before it replies to real customers. Practice only:
          nothing is posted.
        </p>
      </div>
      <form action={action} className="card flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="segmented" role="radiogroup" aria-label="Kind of message">
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
          <span className="meta">{triesLeftText(left)}</span>
        </div>
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
        <div className="flex flex-wrap gap-2" aria-label="Examples">
          {SAMPLES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setText(s)}
              className="rounded-full border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              {s}
            </button>
          ))}
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
      {state.tried && !pending && <ResultCard tried={state.tried} />}
    </section>
  );
}
