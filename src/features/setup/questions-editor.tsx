"use client";

import { Pencil, Plus, X } from "lucide-react";
import { useRef, useState } from "react";
import { BeeHoneycomb } from "@/components/app/bee-setup";
import { aboutLine, combineItemAnswers, type QuestionSeed } from "./first-connect";
import { QUESTION_MAX, SETUP_QUESTIONS_MAX } from "./starter";

type Item = {
  id: number;
  question: string;
  answer: string;
  mine: boolean;
  /** The chip on a question the owner hasn't changed: "14 people asked", "Common for cafés". */
  tag: string;
  /** From their own customers. */
  asked: boolean;
  /** What an ambiguous question was about (first connect, 20 Nov): one answer field each. */
  items: { item: string; count: number }[];
  unsure: number;
  itemAnswers: Record<string, string>;
  /** "Or write one price list for everything". */
  oneList: boolean;
};

const fromSeed = (s: QuestionSeed, id: number): Item => ({
  id,
  question: s.question,
  answer: "",
  mine: false,
  tag: s.tag,
  asked: s.asked !== null,
  items: s.items,
  unsure: s.unsure,
  itemAnswers: {},
  oneList: false,
});

/** Pure: the answer an item saves (per-item answers become one price list). */
function answerOf(i: Item): string {
  if (!i.items.length || i.oneList) return i.answer;
  return combineItemAnswers(
    i.items.map((x) => ({ item: x.item, answer: i.itemAnswers[x.item] ?? "" })),
  );
}

/**
 * Step 3's questions (approved 17 Nov): suggested for the kind of business, each one editable
 * (click the question), removable, and more to add from "More people ask" or "Write your own".
 * With first connect (approved 20 Nov) they are the customers' own, with how many asked; an
 * ambiguous one gets an answer per item it was about. The honeycomb beside them fills a cell per
 * answer written.
 */
export function QuestionsEditor({ seeds, more }: { seeds: QuestionSeed[]; more: string[] }) {
  const next = useRef(seeds.length);
  const [items, setItems] = useState<Item[]>(() => seeds.map(fromSeed));
  const [focus, setFocus] = useState<number | null>(null);
  const answered = items.filter((i) => i.question.trim() && answerOf(i).trim()).length;
  const taken = new Set(items.map((i) => i.question.trim().toLowerCase()));
  const extra = more.filter((q) => !taken.has(q.toLowerCase()));
  const full = items.length >= SETUP_QUESTIONS_MAX;

  const update = (id: number, patch: Partial<Item>) =>
    setItems((all) => all.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  const add = (question: string) => {
    const id = next.current++;
    setItems((all) => [
      ...all,
      {
        ...fromSeed({ question, asked: null, items: [], unsure: 0, tag: "Suggested" }, id),
        mine: !question,
      },
    ]);
    setFocus(id);
  };

  return (
    <div className="grid items-start gap-5 md:grid-cols-[1fr_150px]">
      <div className="flex flex-col gap-3">
        {items.map((item, n) => (
          <div key={item.id} className="card flex flex-col gap-2.5 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex min-w-[220px] flex-1 items-center gap-2">
                <span className="sr-only">Question {n + 1}</span>
                <input
                  name="q"
                  value={item.question}
                  maxLength={QUESTION_MAX}
                  autoFocus={focus === item.id && !item.question}
                  placeholder="Write the question a customer asks"
                  onChange={(e) => update(item.id, { question: e.target.value, mine: true })}
                  className="border-line-strong focus:border-ink placeholder:text-ink-4 min-w-0 flex-1 border-0 border-b border-dashed bg-transparent pb-0.5 text-[15px] font-semibold outline-none"
                />
                <Pencil className="text-ink-3 size-3.5 shrink-0" strokeWidth={2} aria-hidden />
              </label>
              <span
                className={
                  item.mine || item.asked
                    ? "bg-honey-tint text-honey-text rounded-full px-2 py-0.5 text-[11px] font-semibold"
                    : "bg-subtle text-ink-2 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                }
              >
                {item.mine ? "Your question" : item.tag}
              </span>
              {items.length > 1 && (
                <button
                  type="button"
                  onClick={() => setItems((all) => all.filter((i) => i.id !== item.id))}
                  aria-label={`Remove “${item.question || "this question"}”`}
                  className="text-ink-3 hover:bg-subtle hover:text-ink inline-flex size-8 items-center justify-center rounded-md"
                >
                  <X className="size-4" strokeWidth={2} aria-hidden />
                </button>
              )}
            </div>
            {item.items.length > 0 && (
              <p className="text-ink-3 text-sm">{aboutLine(item.items, item.unsure)}</p>
            )}
            {item.items.length > 0 && !item.oneList ? (
              <>
                <input type="hidden" name="a" value={answerOf(item)} />
                {item.items.map((x) => (
                  <label key={x.item} className="flex flex-col gap-1 text-sm font-medium">
                    {x.item}
                    <input
                      value={item.itemAnswers[x.item] ?? ""}
                      onChange={(e) =>
                        update(item.id, {
                          itemAnswers: { ...item.itemAnswers, [x.item]: e.target.value },
                        })
                      }
                      placeholder="Your answer, the way you'd say it"
                      className="field font-normal"
                    />
                  </label>
                ))}
                <button
                  type="button"
                  onClick={() => update(item.id, { oneList: true, answer: answerOf(item) })}
                  className="action-link self-start text-sm"
                >
                  Or write one price list for everything
                </button>
              </>
            ) : (
              <textarea
                name="a"
                rows={item.oneList ? 4 : 2}
                value={item.answer}
                autoFocus={focus === item.id && !!item.question}
                onChange={(e) => update(item.id, { answer: e.target.value })}
                aria-label={`Answer to “${item.question || `question ${n + 1}`}”`}
                placeholder={
                  item.oneList
                    ? "One line per item, the way you'd say it"
                    : "Your answer, the way you'd say it"
                }
                className="field font-normal"
              />
            )}
          </div>
        ))}
        {!full && (
          <div className="flex flex-wrap items-center gap-2">
            {extra.length > 0 && <span className="text-ink-3 text-sm">More people ask:</span>}
            {extra.slice(0, 4).map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => add(q)}
                className="border-line-strong hover:border-ink bg-surface inline-flex min-h-9 items-center gap-1 rounded-full border border-dashed px-3 text-sm"
              >
                <Plus className="size-3.5" strokeWidth={2} aria-hidden />
                {q}
              </button>
            ))}
            <button
              type="button"
              onClick={() => add("")}
              className="border-line-strong hover:border-ink bg-surface inline-flex min-h-9 items-center gap-1 rounded-full border border-dashed px-3 text-sm"
            >
              <Plus className="size-3.5" strokeWidth={2} aria-hidden />
              Write your own
            </button>
          </div>
        )}
      </div>
      <aside className="card hidden flex-col items-center gap-2 p-4 text-center md:flex">
        <BeeHoneycomb filled={answered} />
        <b className="text-sm font-semibold">Waggle&apos;s honeycomb</b>
        <span className="text-ink-2 text-xs" aria-live="polite">
          {answered >= 3
            ? "Full. Waggle knows your top answers."
            : `Each answer fills a cell. ${answered} of 3 so far.`}
        </span>
      </aside>
    </div>
  );
}
