"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";

type AnswerState = { error?: string; saved?: string; savedAt?: number };

/**
 * "Customers asked things you haven't answered yet" (design "3 · Teach Waggle"): one question at
 * a time, a short answer, Save. Each answer becomes one of the owner's answers.
 */
export function QuestionAnswers({
  questions,
  answer,
  canEdit,
}: {
  questions: { text: string; times: number }[];
  answer: (prev: AnswerState, fd: FormData) => Promise<AnswerState>;
  canEdit: boolean;
}) {
  const [done, setDone] = useState<ReadonlySet<string>>(new Set());
  const [skipped, setSkipped] = useState<ReadonlySet<string>>(new Set());
  const [state, action, pending] = useActionState(async (prev: AnswerState, fd: FormData) => {
    const r = await answer(prev, fd);
    if (r.saved) setDone((s) => new Set(s).add(r.saved!));
    return r;
  }, {});
  const left = questions.filter((q) => !done.has(q.text));
  const queue = [
    ...left.filter((q) => !skipped.has(q.text)),
    ...left.filter((q) => skipped.has(q.text)),
  ];
  const current = queue[0];

  return (
    <section className="card flex flex-col gap-4 p-6" id="questions" aria-labelledby="q-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="q-title" className="section-title">
            Customers asked things you haven&apos;t answered yet
          </h2>
          <p className="text-ink-3 mt-1 text-sm">
            Write a short answer once. Next time Waggle can reply for you.
          </p>
        </div>
        {left.length > 0 && (
          <span className="bg-honey-tint text-honey-text rounded-full px-2.5 py-0.5 text-xs font-semibold">
            {left.length} to go
          </span>
        )}
      </div>
      {state.saved && (
        <p role="status" className="text-success text-sm font-semibold">
          Saved. Waggle will use this next time.
        </p>
      )}
      {!current ? (
        <p className="text-ink-2 text-sm">
          {questions.length
            ? "All answered. New questions show up here when customers ask them."
            : "None right now. When a customer asks something your answers don't cover, it shows up here."}
        </p>
      ) : (
        <form key={current.text} action={action} className="flex flex-col gap-3">
          <input type="hidden" name="question" value={current.text} />
          <div className="bg-subtle rounded-xl px-4 py-3">
            <p className="text-[15px]">&ldquo;{current.text}&rdquo;</p>
            <p className="text-ink-3 mt-1 text-[13px]">
              {current.times > 1 ? `Asked ${current.times} times` : "Asked once"}
            </p>
          </div>
          {canEdit ? (
            <>
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                Your answer
                <textarea
                  name="answer"
                  rows={3}
                  required
                  placeholder="Write it the way you'd say it to a customer."
                  className="field font-normal"
                />
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="submit" variant="primary" disabled={pending}>
                  {pending ? "Saving…" : "Save"}
                </Button>
                {queue.length > 1 && (
                  <Button
                    type="button"
                    variant="quiet"
                    onClick={() => setSkipped((s) => new Set(s).add(current.text))}
                  >
                    Skip
                  </Button>
                )}
              </div>
            </>
          ) : (
            <p className="text-ink-3 text-sm">Ask an owner or admin to answer it.</p>
          )}
          {state.error && (
            <p role="alert" className="text-danger text-sm">
              {state.error}
            </p>
          )}
        </form>
      )}
    </section>
  );
}
