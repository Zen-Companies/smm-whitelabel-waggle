"use client";

import { useState } from "react";
import { AUDIENCE, POST_RESULTS, REACH_30, TOPIC_USE, WAGGLE_WORK, connectedList } from "../_demo/data";
import { useDemo } from "../_demo/store";
import { Empty, PageHead, Stat, Tabs, card } from "../_demo/ui";

type Tab = "overview" | "posts" | "audience" | "waggle";
const fmt = (n: number) => n.toLocaleString("en-US");

function ReachChart() {
  const max = Math.max(...REACH_30);
  const w = 720;
  const h = 180;
  const bar = w / REACH_30.length;
  return (
    <figure>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label={`People reached per day over the last 30 days, between ${Math.min(...REACH_30)} and ${max}`} className="h-40 w-full sm:h-60">
        {REACH_30.map((v, i) => {
          const bh = (v / max) * (h - 4);
          return <rect key={i} x={i * bar + 2} y={h - bh} width={bar - 4} height={bh} rx="2" fill={i === REACH_30.length - 1 ? "var(--honey)" : "var(--honey-glow)"} />;
        })}
      </svg>
      {/* Real text, because labels inside the stretched chart shrink to nothing on a phone */}
      <figcaption className="mt-1.5 flex justify-between text-[13px] text-muted">
        <span>Oct 8</span>
        <span>Today</span>
      </figcaption>
    </figure>
  );
}

export function AnalyticsView() {
  const { demo } = useDemo();
  const [tab, setTab] = useState<Tab>("overview");
  const about = "How your posts did and what Waggle handled, over the last 30 days. Sample numbers.";
  if (connectedList(demo).length === 0) {
    return (
      <>
        <PageHead title="Analytics" about={about} />
        <Empty title="No numbers yet" body="Connect an account and your first numbers show up by tomorrow." href="/settings" cta="Connect an account" />
      </>
    );
  }
  const reached = REACH_30.reduce((a, b) => a + b, 0);
  const comments = POST_RESULTS.reduce((a, p) => a + p.comments, 0);
  const top = POST_RESULTS.reduce((a, b) => (b.reached > a.reached ? b : a));
  const gained = AUDIENCE.gained.Instagram + AUDIENCE.gained.Facebook;
  const followers = AUDIENCE.followers.Instagram + AUDIENCE.followers.Facebook;
  const topMax = Math.max(...TOPIC_USE.map((t) => t.times));

  return (
    <>
      <PageHead title="Analytics" about={about} />
      <Tabs
        label="Analytics sections"
        value={tab}
        onChange={setTab}
        options={[
          { id: "overview", label: "Overview" },
          { id: "posts", label: "Posts" },
          { id: "audience", label: "Audience" },
          { id: "waggle", label: "Waggle’s work" },
        ]}
      />
      <div className="mt-5">
        {tab === "overview" && (
          <div className="flex flex-col gap-6">
            <section aria-label="Totals" className={`${card} grid grid-cols-2 gap-5 p-5 md:grid-cols-4`}>
              <Stat label="People reached" value={fmt(reached)} />
              <Stat label="New followers" value={fmt(gained)} />
              <Stat label="Answered by Waggle" value={fmt(WAGGLE_WORK.answered)} />
              <Stat label="Buyers found" value={fmt(WAGGLE_WORK.buyers)} />
            </section>
            <section className={`${card} p-5`}>
              <h2 className="font-semibold">People reached each day</h2>
              <p className="mb-3 text-[15px] text-soft">
                Your biggest post was “{top.title}”, reaching {fmt(top.reached)} people.
              </p>
              <ReachChart />
            </section>
          </div>
        )}
        {tab === "posts" && (
          <section className={card}>
            <ul className="sm:hidden">
              {POST_RESULTS.map((p) => (
                <li key={p.title} className="border-b border-line p-4 last:border-b-0">
                  <div className="font-medium">{p.title}</div>
                  <div className="text-[13px] text-muted">{p.when}</div>
                  <div className="mt-1 text-[15px] text-soft tabular-nums">
                    {fmt(p.reached)} reached · {p.comments} comments · {p.buyers} {p.buyers === 1 ? "buyer" : "buyers"}
                  </div>
                </li>
              ))}
            </ul>
            <table className="hidden w-full text-left text-[15px] sm:table">
              <caption className="sr-only">How each post did in its first 14 days</caption>
              <thead className="text-[13px] text-muted">
                <tr className="border-b border-line">
                  <th scope="col" className="p-4 font-normal">Post</th>
                  <th scope="col" className="p-4 text-right font-normal">Reached</th>
                  <th scope="col" className="p-4 text-right font-normal">Comments</th>
                  <th scope="col" className="p-4 text-right font-normal">Buyers</th>
                </tr>
              </thead>
              <tbody>
                {POST_RESULTS.map((p) => (
                  <tr key={p.title} className="border-b border-line last:border-b-0">
                    <td className="p-4">
                      {p.title}
                      <div className="text-[13px] text-muted">{p.when}</div>
                    </td>
                    <td className="p-4 text-right tabular-nums">{fmt(p.reached)}</td>
                    <td className="p-4 text-right tabular-nums">{p.comments}</td>
                    <td className="p-4 text-right tabular-nums">{p.buyers}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="border-t border-line p-4 text-[13px] text-muted">
              Counted over each post’s first 14 days. {comments} comments in all.
            </p>
          </section>
        )}
        {tab === "audience" && (
          <div className="grid grid-cols-[minmax(0,1fr)] gap-6 md:grid-cols-2">
            <section className={`${card} grid grid-cols-2 gap-5 self-start p-5`}>
              <h2 className="col-span-2 font-semibold">{fmt(followers)} followers</h2>
              <Stat label="Instagram" value={fmt(AUDIENCE.followers.Instagram)} note={`+${AUDIENCE.gained.Instagram} this month`} />
              <Stat label="Facebook" value={fmt(AUDIENCE.followers.Facebook)} note={`+${AUDIENCE.gained.Facebook} this month`} />
              <p className="col-span-2 text-[15px] text-soft">
                <span className="font-semibold text-ink">Best times to post:</span> {AUDIENCE.best}.
              </p>
            </section>
            <section className={`${card} p-5`}>
              <h2 className="font-semibold">Top cities</h2>
              <ul className="mt-2">
                {AUDIENCE.cities.map((c) => (
                  <li key={c.city} className="flex justify-between border-b border-line py-2.5 text-[15px] last:border-b-0">
                    {c.city}
                    <span className="text-soft tabular-nums">{c.share}%</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        )}
        {tab === "waggle" && (
          <div className="flex flex-col gap-6">
            <section aria-label="What Waggle handled" className={`${card} grid grid-cols-2 gap-5 p-5 md:grid-cols-4`}>
              <Stat label="Answered" value={WAGGLE_WORK.answered} />
              <Stat label="Handed to you" value={WAGGLE_WORK.handedToYou} />
              <Stat label="Ignored as spam or noise" value={WAGGLE_WORK.ignored} />
              <Stat label="Buyers found" value={WAGGLE_WORK.buyers} />
            </section>
            <section className={`${card} p-5`}>
              <h2 className="font-semibold">Business info Waggle answered from</h2>
              <ul className="mt-3 flex flex-col gap-3">
                {TOPIC_USE.map((t) => (
                  <li key={t.topic} className="grid grid-cols-[minmax(0,130px)_minmax(0,1fr)_32px] items-center gap-3 text-[15px] sm:grid-cols-[170px_minmax(0,1fr)_32px]">
                    <span className="truncate">{t.topic}</span>
                    <span aria-hidden="true" className="h-2 rounded-full bg-cream">
                      <span className="block h-2 rounded-full bg-honey" style={{ width: `${(t.times / topMax) * 100}%` }} />
                    </span>
                    <span className="text-right text-soft tabular-nums">{t.times}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        )}
      </div>
    </>
  );
}
