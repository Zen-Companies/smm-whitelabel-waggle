"use client";

import Link from "next/link";
import { useState } from "react";
import type { Topic } from "../_demo/data";
import { useDemo } from "../_demo/store";
import { PageHead, Pill, Segmented, btnPrimary, card, field } from "../_demo/ui";

const EXAMPLES = ["How much is it?", "How do I order?", "Where are you located?", "Are you open today?", "Can I get a discount?"];
const NEVER = [
  "Make up prices, dates or promises. It only uses your Business info.",
  "Confirm a booking or order. It says your team will confirm.",
  "Reply to complaints or messages it isn’t sure about. Those come to you.",
  "Ask for phone numbers or addresses in public comments.",
  "Reply to a DM after Instagram’s 24-hour window.",
];
const STOP = new Set(["the", "you", "your", "are", "and", "for", "how", "what", "where", "when", "can", "get", "any", "does", "have", "with", "this", "that", "from", "is", "do", "it", "to", "of", "in", "on", "at", "my", "we", "a", "i"]);
// The everyday ways people ask about money, which never contain the word "price".
const SAME: Record<string, string> = { much: "price", cost: "price", rate: "price", rates: "price" };
const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)).map((w) => SAME[w] ?? w);

// A stand-in for the real AI: it finds the best-matching topic, and otherwise declines, which is the rule that matters.
function answer(q: string, topics: Topic[]) {
  const asked = words(q);
  let best: Topic | null = null;
  let score = 0;
  for (const t of topics) {
    const hay = words(`${t.title} ${t.body}`);
    const s = asked.filter((w) => hay.some((h) => h.startsWith(w.slice(0, 4)))).length;
    if (s > score) {
      score = s;
      best = t;
    }
  }
  return best;
}

export function LabView() {
  const { demo, update } = useDemo();
  const [kind, setKind] = useState<"comment" | "dm">("comment");
  const [q, setQ] = useState("");
  const [result, setResult] = useState<{ q: string; topic: Topic | null } | null>(null);

  function tryIt(e: React.FormEvent) {
    e.preventDefault();
    setResult({ q: q.trim(), topic: answer(q, demo.topics) });
    update((d) => ({ ...d, practiced: d.practiced + 1 }));
  }

  return (
    <>
      <PageHead title="Practice replies" about="Type what a customer might write and see what Waggle would say. Practice only: nothing is posted." />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <form onSubmit={tryIt} aria-label="Try a message" className={`${card} flex min-w-0 flex-col gap-4 self-start p-5`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Try a message</h2>
            <Segmented label="Message type" value={kind} onChange={setKind} options={[{ id: "comment", label: "A comment" }, { id: "dm", label: "A DM" }]} />
          </div>
          <div>
            <label htmlFor="try" className="text-[15px] font-medium">
              What the customer writes
            </label>
            <textarea id="try" rows={3} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type what a customer might write…" className={`${field} mt-1.5`} />
          </div>
          <div>
            <p className="text-[13px] text-muted">Or start with one of these</p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {EXAMPLES.map((x) => (
                <button key={x} type="button" onClick={() => setQ(x)} className="min-h-11 rounded-full border border-line px-3 text-sm lg:min-h-9 text-soft transition hover:border-edge hover:text-ink">
                  {x}
                </button>
              ))}
            </div>
          </div>
          <button type="submit" className={`${btnPrimary} self-start`} disabled={!q.trim()}>
            See Waggle’s reply
          </button>

          {result && (
            <div role="status" className="border-t border-line pt-4">
              <div className="ml-0 max-w-[85%] w-fit rounded-[18px] rounded-bl-[4px] bg-cream px-4 py-2.5 text-[15px]">{result.q}</div>
              {result.topic ? (
                <>
                  <div className="mt-2 ml-auto max-w-[85%] w-fit rounded-[18px] rounded-br-[4px] bg-honey px-4 py-2.5 text-[15px] text-hive">{result.topic.body}</div>
                  <p className="mt-2 text-right text-[13px] text-muted">From your “{result.topic.title}” info, as a {kind === "dm" ? "DM" : "comment"} reply.</p>
                </>
              ) : (
                <div className="mt-3 flex flex-wrap items-center gap-2 text-[15px] text-soft">
                  <Pill>Would come to you</Pill>
                  Your Business info doesn’t cover this, so Waggle wouldn’t guess.
                  <Link href="/knowledge-base" className="font-semibold text-accent underline underline-offset-2">
                    Add it
                  </Link>
                </div>
              )}
              <p className="mt-3 text-[13px] text-muted">Prototype: this picks the closest topic you wrote. The real app writes the reply with AI.</p>
            </div>
          )}
        </form>

        <section aria-labelledby="never" className={`${card} self-start p-5`}>
          <h2 id="never" className="font-semibold">
            What Waggle will never do
          </h2>
          <ul className="mt-2">
            {NEVER.map((n) => (
              <li key={n} className="border-b border-line py-2.5 text-[15px] text-soft last:border-b-0">
                {n}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
