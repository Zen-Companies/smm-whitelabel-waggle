"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { InboxItem, ItemStatus } from "../_demo/data";
import { useDemo } from "../_demo/store";
import { Empty, Icon, NextStep, PageHead, PlatformTag, Tabs, btnPrimary, btnQuiet, card, field, thumbDock } from "../_demo/ui";

const UNDO_SECONDS = 8;

export function InboxView() {
  const { demo, update, selected, select } = useDemo();
  // The open tab lives in the address, so Today can link straight to Ignored and Back works.
  const params = useSearchParams();
  const router = useRouter();
  const asked = params.get("tab");
  const tab: ItemStatus = asked === "answered" || asked === "ignored" ? asked : "foryou";
  const setTab = (t: ItemStatus) => router.replace(t === "foryou" ? "/inbox" : `/inbox?tab=${t}`, { scroll: false });
  const [undoing, setUndoing] = useState<{ id: string; text: string } | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<(() => void) | null>(null);
  const openId = useRef(selected);
  useEffect(() => {
    openId.current = selected;
  }, [selected]);
  // Leaving the screen mid-countdown still sends the reply: it was never undone.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      pending.current?.();
    },
    [],
  );

  const setStatus = (id: string, status: ItemStatus, extra?: (i: InboxItem) => Partial<InboxItem>) =>
    update((d) => ({ ...d, items: d.items.map((i) => (i.id === id ? { ...i, status, ...extra?.(i) } : i)) }));

  const count = (s: ItemStatus) => demo.items.filter((i) => i.status === s).length;
  const list = demo.items.filter((i) => i.status === tab);
  // A row opened from Today may sit in another tab, so the open item is looked up across all of them.
  const open = demo.items.find((i) => i.id === selected) ?? null;
  const shown = open ?? list[0] ?? null;

  function send(item: InboxItem, text: string) {
    // Only one Undo shows at a time, so an earlier reply still counting down goes out now.
    if (timer.current) clearTimeout(timer.current);
    pending.current?.();
    pending.current = () => {
      pending.current = null;
      setStatus(item.id, "answered", (i) => ({ thread: [...i.thread, { from: "business", text, at: "Just now" }] }));
      if (openId.current === item.id) select(null);
    };
    setUndoing({ id: item.id, text });
    timer.current = setTimeout(() => {
      pending.current?.();
      setUndoing(null);
    }, UNDO_SECONDS * 1000);
  }
  function undo() {
    if (timer.current) clearTimeout(timer.current);
    pending.current = null;
    if (undoing) setEdits((e) => ({ ...e, [undoing.id]: undoing.text }));
    setUndoing(null);
  }

  if (!demo.items.length) {
    return (
      <>
        <PageHead title="Inbox" about="Every comment and DM in one place. Waggle sorts them and writes replies from your Business info." />
        <Empty title="Nothing here yet" body="Comments and messages start arriving as soon as an account is connected." href="/settings" cta="Connect an account" />
      </>
    );
  }

  return (
    <>
      <PageHead title="Inbox" about="Every comment and DM in one place. Waggle sorts them and writes replies from your Business info." />
      <Tabs
        label="Inbox views"
        className={open ? "max-md:hidden" : ""}
        value={tab}
        onChange={(t) => {
          setTab(t);
          select(null);
        }}
        options={[
          { id: "foryou", label: "For you", count: count("foryou") },
          { id: "answered", label: "Answered", count: count("answered") },
          { id: "ignored", label: "Ignored", count: count("ignored") },
        ]}
      />
      <div className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-6 md:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        {/* Phones show one pane at a time: the list, or the conversation you opened */}
        <ul className={`${card} self-start overflow-hidden ${open ? "hidden md:block" : ""}`}>
          {list.length === 0 && <li className="p-4 text-[15px] text-soft">Nothing here. Go run the shop.</li>}
          {list.map((i) => {
            const isOpen = shown?.id === i.id;
            return (
              <li key={i.id} className="border-b border-line last:border-b-0">
                <button type="button" onClick={() => select(i.id)} aria-current={isOpen ? "true" : undefined} className={`block w-full p-4 text-left transition hover:bg-cream ${isOpen ? "md:bg-cream" : ""}`}>
                  <span className="flex items-baseline gap-2">
                    {i.status === "foryou" && <span aria-hidden="true" className="size-1.5 shrink-0 self-center rounded-full bg-honey" />}
                    <span className={i.status === "foryou" ? "font-semibold" : ""}>{i.who}</span>
                    <span className="ml-auto text-[13px] whitespace-nowrap text-muted tabular-nums">{i.at}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-[15px] text-soft">{i.thread[0].text}</span>
                  <span className="mt-1.5 block">
                    {i.status === "foryou" ? <NextStep category={i.category} draft={!!i.draft} /> : <span className="text-[13px] text-muted">{i.status === "answered" ? "Answered" : i.ignoredWhy}</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        {shown ? (
          <section aria-label={`Conversation with ${shown.who}`} className={`min-w-0 ${open ? "" : "hidden md:block"}`}>
            <div className="flex flex-wrap items-baseline gap-x-2">
              <h2 className="text-lg font-semibold">{shown.who}</h2>
              <PlatformTag platform={shown.platform} kind={shown.kind} />
            </div>
            <div className="mt-3 flex flex-col gap-2">
              {shown.thread.map((m, n) => (
                <div key={n} className={`max-w-[85%] rounded-[18px] px-4 py-2.5 text-[15px] ${m.from === "customer" ? "self-start rounded-bl-[4px] bg-cream" : "self-end rounded-br-[4px] bg-honey text-hive"}`}>
                  {m.text}
                  <div className={`mt-0.5 text-xs tabular-nums ${m.from === "customer" ? "text-muted" : "opacity-70"}`}>{m.at}</div>
                </div>
              ))}
            </div>
            {shown.status === "foryou" &&
              (undoing?.id === shown.id ? (
                <SentRow key={undoing.id} who={shown.who} onUndo={undo} onBack={() => select(null)} />
              ) : (
                <Composer key={shown.id} item={shown} initial={edits[shown.id]} topicsHref="/knowledge-base" onBack={() => select(null)} onSend={(t) => send(shown, t)} onSkip={() => { setStatus(shown.id, "ignored", () => ({ ignoredWhy: "You chose not to reply" })); select(null); }} />
              ))}
            {shown.status !== "foryou" && (
              <div className={`flex md:hidden ${thumbDock}`}>
                <BackButton onBack={() => select(null)} />
              </div>
            )}
            {shown.status === "answered" && shown.source && <p className="mt-3 text-[13px] text-muted">Answered from your “{shown.source}” info.</p>}
            {shown.status === "ignored" && (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-[15px] text-soft">
                {shown.ignoredWhy}.
                <button type="button" className={btnQuiet} onClick={() => { setStatus(shown.id, "foryou"); setTab("foryou"); }}>
                  Move to For you
                </button>
              </div>
            )}
          </section>
        ) : null}
      </div>
    </>
  );
}

function Composer({ item, initial, topicsHref, onBack, onSend, onSkip }: { item: InboxItem; initial?: string; topicsHref: string; onBack: () => void; onSend: (text: string) => void; onSkip: () => void }) {
  const [text, setText] = useState(initial ?? item.draft ?? "");
  const label = item.draft
    ? `Waggle’s reply, from “${item.source}”. Change anything you like.`
    : item.category === "complaint"
      ? "Complaints always come to you. Waggle won’t answer this one on its own."
      : "This isn’t in your Business info yet, so Waggle didn’t guess.";
  return (
    <div className={`${card} mt-4 p-4`}>
      <label htmlFor="reply" className="text-[15px] font-medium">
        {label}
      </label>
      <textarea id="reply" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Write your reply…" className={`${field} mt-2`} />
      {item.category === "unknown" && (
        <Link href={topicsHref} className="mt-1 inline-flex min-h-11 items-center text-[15px] font-medium text-accent underline underline-offset-2">
          Add to Business info
        </Link>
      )}
      <div className={`mt-3 flex items-center gap-1 ${thumbDock}`}>
        <BackButton onBack={onBack} />
        <button type="button" className={`${btnQuiet} lg:-ml-3`} onClick={onSkip}>
          Don’t reply
        </button>
        <button type="button" className={`${btnPrimary} ml-auto`} disabled={!text.trim()} onClick={() => onSend(text.trim())}>
          Send reply
        </button>
      </div>
    </div>
  );
}

function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <button type="button" aria-label="Back to Inbox" onClick={onBack} className="grid size-11 shrink-0 place-items-center rounded-full text-soft hover:text-ink md:hidden">
      <Icon name="back" size={22} />
    </button>
  );
}

function SentRow({ who, onUndo, onBack }: { who: string; onUndo: () => void; onBack: () => void }) {
  const [left, setLeft] = useState(UNDO_SECONDS);
  useEffect(() => {
    const t = setInterval(() => setLeft((n) => Math.max(0, n - 1)), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div role="status" className={`${card} mt-4 flex items-center gap-2 p-4 ${thumbDock}`}>
      <BackButton onBack={onBack} />
      <span className="flex min-w-0 flex-1 items-center gap-2 truncate text-[15px] font-medium">
        <Icon name="check" /> Sending to {who}…
      </span>
      <button type="button" onClick={onUndo} className="min-h-11 px-2 text-[15px] font-semibold underline underline-offset-2 tabular-nums">
        Undo ({left}s)
      </button>
    </div>
  );
}
