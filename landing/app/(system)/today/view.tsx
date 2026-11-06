"use client";

import Link from "next/link";
import { PLATFORMS, REACH_30, TODAY, connectedList } from "../_demo/data";
import { setupSteps, useDemo } from "../_demo/store";
import { Icon, NextStep, PageHead, Pill, PlatformLogo, PlatformTag, btnPrimary, btnSecondary, card, thumbDock } from "../_demo/ui";

const chip = "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-line px-4 text-[15px] font-medium text-soft transition hover:border-edge hover:text-ink";
const longDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

// The first screen after login. It answers one question: what needs me right now?
export function TodayView() {
  const { demo, select } = useDemo();
  const need = demo.items.filter((i) => i.status === "foryou");
  const answered = demo.items.filter((i) => i.status === "answered").length;
  const ignored = demo.items.filter((i) => i.status === "ignored").length;
  const steps = setupSteps(demo);
  const firstOpen = steps.findIndex((s) => !s.done);
  const failed = demo.posts.filter((p) => p.status === "failed");
  const next = demo.posts.filter((p) => p.status === "scheduled" && p.date >= TODAY).sort((a, b) => a.date.localeCompare(b.date))[0];
  const newLeads = demo.leads.filter((l) => l.status === "new");
  const waiting = need.length + failed.length;
  const spam = demo.items.filter((i) => i.status === "ignored" && i.ignoredWhy?.startsWith("Spam")).length;
  const ignoredDetail = ignored === 0 ? "Nothing today" : [spam && `${spam} spam`, ignored - spam && `${ignored - spam} no reply needed`].filter(Boolean).join(", ");
  const connected = connectedList(demo).length > 0;
  const reached = REACH_30.reduce((a, b) => a + b, 0);
  const title = firstOpen >= 0 ? "Let’s get Waggle ready" : waiting ? `${waiting} ${waiting === 1 ? "thing needs" : "things need"} you` : "Nothing needs you";

  return (
    <>
      <PageHead
        title={title}
        about={firstOpen >= 0 ? "A few steps, then Waggle starts answering your customers. Nothing goes out without you." : `Today Waggle answered ${answered} and ignored ${ignored}. Here’s what’s left for you.`}
        action={
          firstOpen < 0 && need.length > 0 ? (
            <Link href="/inbox" className={`${btnPrimary} max-lg:hidden`}>
              Open Inbox
            </Link>
          ) : undefined
        }
      />

      {/* On a phone these sit in the thumb bar, because the digest is a long scroll past everything waiting */}
      {firstOpen < 0 && answered + ignored > 0 && (
        <div className={`flex gap-2 overflow-x-auto lg:hidden ${thumbDock}`}>
          <Link href="/inbox?tab=answered" onClick={() => select(null)} className={chip}>
            Answered <span className="font-semibold tabular-nums">{answered}</span>
          </Link>
          <Link href="/inbox?tab=ignored" onClick={() => select(null)} className={chip}>
            Ignored and spam <span className="font-semibold tabular-nums">{ignored}</span>
          </Link>
        </div>
      )}

      {firstOpen >= 0 && (
        <section aria-label="Setup steps" className={`${card} mb-6`}>
          <ol>
            {steps.map((s, i) => (
              <li key={s.t} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line p-4 last:border-b-0 sm:p-5">
                <span className={`grid size-8 shrink-0 place-items-center rounded-full text-sm font-semibold ${s.done ? "bg-honey text-hive" : i === firstOpen ? "bg-ink text-bg" : "border border-edge text-soft"}`}>
                  {s.done ? <Icon name="check" size={16} /> : i + 1}
                </span>
                <div className="min-w-[200px] flex-1">
                  <h2 className={`font-semibold ${s.done ? "text-muted" : ""}`}>{s.t}</h2>
                  <p className="text-[15px] text-soft">{s.done ? "Done." : s.b}</p>
                </div>
                {s.platforms && !s.done && (
                  <ul aria-label="Platforms you can connect" className="flex w-full flex-wrap gap-2 sm:order-last sm:pl-12">
                    {PLATFORMS.map((p) => (
                      <li key={p}>
                        <Link href={s.href} title={p} aria-label={`Connect ${p}`} className="block rounded-xl transition hover:-translate-y-0.5">
                          <PlatformLogo platform={p} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
                {!s.done && (
                  <Link href={s.href} className={i === firstOpen ? btnPrimary : btnSecondary}>
                    {s.cta}
                  </Link>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section aria-labelledby="need-you">
          <h2 id="need-you" className="mb-2 text-lg font-semibold">
            Waiting for you
          </h2>
          {waiting ? (
            <ul className={`${card} overflow-hidden`}>
              {need.map((i) => (
                <li key={i.id} className="border-b border-line last:border-b-0">
                  <Link href="/inbox" onClick={() => select(i.id)} className="block p-4 transition hover:bg-cream">
                    <div className="flex items-baseline gap-2">
                      <span aria-hidden="true" className="size-1.5 shrink-0 self-center rounded-full bg-honey" />
                      <span className="font-semibold">{i.who}</span>
                      <PlatformTag platform={i.platform} kind={i.kind} />
                      <span className="ml-auto text-[13px] whitespace-nowrap text-muted tabular-nums">{i.at}</span>
                    </div>
                    <p className="mt-1 truncate text-[15px] text-soft">{i.thread[0].text}</p>
                    <div className="mt-2">
                      <NextStep category={i.category} draft={!!i.draft} />
                    </div>
                  </Link>
                </li>
              ))}
              {failed.map((p) => (
                <li key={p.id} className="border-b border-line last:border-b-0">
                  <Link href="/posts" className="block p-4 transition hover:bg-cream">
                    <div className="flex items-baseline gap-2">
                      <span aria-hidden="true" className="size-1.5 shrink-0 self-center rounded-full bg-honey" />
                      <span className="font-semibold">A post didn’t go out</span>
                      <span className="text-[13px] text-muted">{p.platforms.join(" and ")}</span>
                    </div>
                    <p className="mt-1 truncate text-[15px] text-soft">{p.text}</p>
                    <div className="mt-2">
                      <Pill tone="alert">Post · try it again</Pill>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className={`${card} p-5 text-[15px] text-soft`}>{firstOpen >= 0 ? "Messages show up here once an account is connected." : "Nothing needs you. Go run the shop."}</p>
          )}
        </section>

        <div className="flex flex-col gap-6">
          <section aria-labelledby="handled" className="max-lg:hidden">
            <h2 id="handled" className="mb-2 text-lg font-semibold">
              Waggle handled
            </h2>
            <ul className={`${card} overflow-hidden`}>
              <GlanceRow href="/inbox?tab=answered" onClick={() => select(null)} label="Answered" value={answered} detail="From your Business info" />
              <GlanceRow href="/inbox?tab=ignored" onClick={() => select(null)} label="Ignored and spam" value={ignored} detail={ignoredDetail} />
            </ul>
          </section>
          <section aria-labelledby="glance">
            <h2 id="glance" className="mb-2 text-lg font-semibold">
              At a glance
            </h2>
            <ul className={`${card} overflow-hidden`}>
              <GlanceRow href="/leads" label="New buyers" value={newLeads.length} detail={newLeads.length ? newLeads.map((l) => l.name).join(", ") : "None yet"} />
              <GlanceRow href="/posts" label="Next post" detail={next ? `${longDate(next.date)}, ${next.time}` : "Nothing scheduled yet"} />
              {demo.unanswered.length > 0 && <GlanceRow href="/knowledge-base" label="Questions your info missed" value={demo.unanswered.length} detail="Add the answers once" />}
              {connected && <GlanceRow href="/analytics" label="People reached" value={reached.toLocaleString("en-US")} detail="Last 30 days" />}
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}

// One quiet line of the digest: a label, the number, a few words, and the whole row opens the detail.
function GlanceRow({ href, label, value, detail, onClick }: { href: string; label: string; value?: string | number; detail: string; onClick?: () => void }) {
  return (
    <li className="border-b border-line last:border-b-0">
      <Link href={href} onClick={onClick} className="flex min-h-14 items-center gap-3 p-4 transition hover:bg-cream">
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{label}</span>
          <span className="block text-[13px] text-soft">{detail}</span>
        </span>
        {value !== undefined && <span className="text-lg font-semibold tabular-nums">{value}</span>}
        <span aria-hidden="true" className="rotate-180 text-muted">
          <Icon name="back" size={16} />
        </span>
      </Link>
    </li>
  );
}
