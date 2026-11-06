"use client";

import { useRef, useState } from "react";
import { useDemo } from "../_demo/store";
import { Icon, PageHead, btnPrimary, btnQuiet, card, fab, field, sheetFooter, sheetForm } from "../_demo/ui";

export function InfoView() {
  const { demo, update } = useDemo();
  const [editing, setEditing] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  function start(id: string | null, t = "", b = "") {
    setEditing(id);
    setTitle(t);
    setBody(b);
    setSaved(null);
    setSheet(true);
    requestAnimationFrame(() => titleRef.current?.focus());
  }
  function save(e: React.FormEvent) {
    e.preventDefault();
    const t = title.trim();
    update((d) => ({
      ...d,
      topics: editing ? d.topics.map((x) => (x.id === editing ? { ...x, title: t, body: body.trim() } : x)) : [...d.topics, { id: crypto.randomUUID(), title: t, body: body.trim() }],
      unanswered: d.unanswered.filter((u) => u.q !== title),
    }));
    setSaved(editing ? `“${t}” updated.` : `“${t}” added. Waggle can answer from it now.`);
    setEditing(null);
    setTitle("");
    setBody("");
    setSheet(false);
  }
  function close() {
    start(null);
    setSheet(false);
  }

  return (
    <>
      <PageHead title="Business info" about="The only facts Waggle uses in replies. If it isn’t here, it asks you instead of guessing." />
      <button type="button" className={`${fab} bottom-[calc(var(--tabbar)+12px)]`} onClick={() => start(null)}>
        <Icon name="plus" /> Add topic
      </button>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-6">
          {saved && (
            <p role="status" className="text-[15px] font-medium text-accent">
              {saved}
            </p>
          )}
          {demo.unanswered.length > 0 && (
            <section aria-labelledby="gaps" className="rounded-[18px] border border-honey bg-honey-soft p-4">
              <h2 id="gaps" className="font-semibold">
                Customers asked, and your info didn’t say
              </h2>
              <ul className="mt-2">
                {demo.unanswered.map((u) => (
                  <li key={u.q} className="flex flex-wrap items-center justify-between gap-x-3 py-1">
                    <span className="text-[15px]">
                      {u.q} <span className="text-[13px] text-muted">Asked {u.times} times</span>
                    </span>
                    <button type="button" className="min-h-11 text-[15px] font-semibold text-accent underline underline-offset-2" onClick={() => start(null, u.q)}>
                      Add the answer
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section aria-labelledby="topics">
            <h2 id="topics" className="mb-2 text-lg font-semibold">
              Your topics <span className="text-[15px] font-normal text-muted tabular-nums">{demo.topics.length}</span>
            </h2>
            {demo.topics.length ? (
              <ul className={card}>
                {demo.topics.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 border-b border-line p-4 last:border-b-0">
                    <div className="min-w-[200px] flex-1">
                      <h3 className="font-semibold">{t.title}</h3>
                      <p className="mt-0.5 text-[15px] text-soft">{t.body}</p>
                    </div>
                    <div className="flex">
                      <button type="button" aria-label={`Edit ${t.title}`} className={btnQuiet} onClick={() => start(t.id, t.title, t.body)}>
                        Edit
                      </button>
                      <button type="button" aria-label={`Delete ${t.title}`} className={btnQuiet} onClick={() => update((d) => ({ ...d, topics: d.topics.filter((x) => x.id !== t.id) }))}>
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={`${card} p-5 text-[15px] text-soft`}>No topics yet. Start with the basics: hours, location, prices and what you offer.</p>
            )}
          </section>
        </div>

        <form onSubmit={save} aria-label={editing ? "Edit topic" : "New topic"} onKeyDown={(e) => e.key === "Escape" && close()} className={`${card} flex flex-col gap-4 self-start p-5 lg:sticky lg:top-6 ${sheetForm(sheet)}`}>
          <h2 className="text-lg font-semibold">{editing ? "Edit topic" : "New topic"}</h2>
          <div>
            <label htmlFor="topic" className="text-[15px] font-medium">
              Topic
            </label>
            <input id="topic" ref={titleRef} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Opening hours" className={`${field} mt-1.5`} />
          </div>
          <div>
            <label htmlFor="answer" className="text-[15px] font-medium">
              What customers should be told
            </label>
            <textarea id="answer" rows={5} value={body} onChange={(e) => setBody(e.target.value)} placeholder="e.g. Mon to Fri 7am to 9pm, weekends 8am to 10pm." className={`${field} mt-1.5`} />
          </div>
          <div className={sheetFooter}>
            <button type="button" className={`${btnQuiet} ${editing || title || body ? "" : "lg:hidden"} lg:order-last`} onClick={close}>
              Cancel
            </button>
            <button type="submit" className={`${btnPrimary} max-lg:flex-1`} disabled={!title.trim() || !body.trim()}>
              {editing ? "Save changes" : "Add topic"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
