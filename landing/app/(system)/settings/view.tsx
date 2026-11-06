"use client";

import { useState } from "react";
import { MAX_ACCOUNTS, PLATFORMS, connectedList, type Platform } from "../_demo/data";
import { useDemo } from "../_demo/store";
import { Icon, MODE_OPTIONS, PageHead, Pill, PlatformLogo, Segmented, Tabs, btnPrimary, btnQuiet, btnSecondary, card, field } from "../_demo/ui";

type Section = "accounts" | "replies" | "notifications" | "business";

// The homepage only promises comments and DMs in general, so the sample data claims them for these two and posting for the rest.
const MESSAGING: Platform[] = ["Instagram", "Facebook"];

export function SettingsView() {
  const { demo, update } = useDemo();
  const [section, setSection] = useState<Section>("accounts");
  const [name, setName] = useState(demo.business);
  const [savedName, setSavedName] = useState(false);
  const live = connectedList(demo);
  const full = live.length >= MAX_ACCOUNTS;
  const flip = (p: Platform) => update((d) => ({ ...d, connected: { ...d.connected, [p]: !d.connected[p] } }));
  const NOTES: { key: keyof typeof demo.notify; label: string; about: string }[] = [
    { key: "leads", label: "A new buyer", about: "Who they are and what they asked for." },
    { key: "complaints", label: "A complaint", about: "Complaints always wait for you, so you hear right away." },
    { key: "failed", label: "A post didn’t go out", about: "With what went wrong and how to fix it." },
  ];

  return (
    <>
      <PageHead title="Settings" about="Your accounts, how Waggle replies, what it tells you about, and your business details." />
      <Tabs
        label="Settings sections"
        value={section}
        onChange={setSection}
        options={[
          { id: "accounts", label: "Accounts" },
          { id: "replies", label: "Replies" },
          { id: "notifications", label: "Notifications" },
          { id: "business", label: "Business" },
        ]}
      />
      <div className="mt-5">
        {section === "accounts" && (
          <section aria-label="Connected accounts">
            <p role="status" className="mb-3 text-[15px] text-soft">
              <strong className="font-semibold text-ink">
                {live.length} of {MAX_ACCOUNTS}
              </strong>{" "}
              connected. {full ? "That’s the most on your plan. Disconnect one to add another." : "Pick the ones your business uses."}
            </p>
            <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-2">
              {PLATFORMS.map((p) => {
                const on = !!demo.connected[p];
                return (
                  <li key={p} className={`${card} flex items-center gap-3 p-4`}>
                    <PlatformLogo platform={p} />
                    <div className="min-w-0 flex-1">
                      <h2 className="flex items-center gap-1.5 font-semibold">
                        {p}
                        {on && (
                          <span className="text-accent">
                            <Icon name="check" size={16} />
                          </span>
                        )}
                      </h2>
                      <p className="text-[15px] text-soft">{!on ? "Not connected" : MESSAGING.includes(p) ? "Comments, DMs and posts are on." : "Posts are on."}</p>
                    </div>
                    {on ? (
                      <button type="button" aria-label={`Disconnect ${p}`} className={btnQuiet} onClick={() => flip(p)}>
                        Disconnect
                      </button>
                    ) : (
                      <button type="button" aria-label={`Connect ${p}`} disabled={full} className={btnSecondary} onClick={() => flip(p)}>
                        Connect
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 text-[13px] text-muted">Prototype: these buttons only change the sample data. No real account is touched.</p>
          </section>
        )}

        {section === "replies" && (
          <section aria-label="How Waggle replies" className="flex flex-col gap-4">
            <div className={`${card} flex flex-wrap items-center justify-between gap-3 p-4`}>
              <div>
                <h2 className="font-semibold">Pause all replies</h2>
                <p className="text-[15px] text-soft">Stops every reply straight away. Messages keep coming in for you to see.</p>
              </div>
              <button type="button" aria-pressed={demo.paused} className={demo.paused ? btnPrimary : btnSecondary} onClick={() => update((d) => ({ ...d, paused: !d.paused }))}>
                {demo.paused ? "Turn replies back on" : "Pause all replies"}
              </button>
            </div>
            <ul className={card}>
              {[
                { key: "questions" as const, t: "Regular questions", b: "Hours, prices, parking and anything in your Business info." },
                { key: "leads" as const, t: "Buyers", b: "Bookings, orders and quotes. Waggle says your team will confirm." },
              ].map((r) => (
                <li key={r.key} className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4">
                  <div className="min-w-[200px] flex-1">
                    <h2 className="font-semibold">{r.t}</h2>
                    <p className="text-[15px] text-soft">{r.b}</p>
                  </div>
                  <Segmented label={`Reply setting for ${r.t}`} value={demo.modes[r.key]} options={MODE_OPTIONS} onChange={(m) => update((d) => ({ ...d, modes: { ...d.modes, [r.key]: m } }))} />
                </li>
              ))}
              <li className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-[200px] flex-1">
                  <h2 className="font-semibold">Complaints</h2>
                  <p className="text-[15px] text-soft">These always come to you. This one can’t be changed.</p>
                </div>
                <Pill>Always for you</Pill>
              </li>
            </ul>
            <p className="text-[15px] text-soft">
              <strong className="font-semibold text-ink">Ask me first</strong> means you check each reply before it goes.{" "}
              <strong className="font-semibold text-ink">Auto-reply</strong> means it goes out on its own.
            </p>
          </section>
        )}

        {section === "notifications" && (
          <section aria-label="Email me when" className={card}>
            <h2 className="px-4 pt-4 font-semibold">Email me when there’s…</h2>
            <ul className="pb-1">
              {NOTES.map((n) => (
                <li key={n.key} className="border-b border-line last:border-b-0">
                  <label className="flex min-h-14 cursor-pointer items-start gap-3 p-4">
                    <input type="checkbox" className="mt-1 size-4 accent-honey" checked={demo.notify[n.key]} onChange={(e) => update((d) => ({ ...d, notify: { ...d.notify, [n.key]: e.target.checked } }))} />
                    <span>
                      <span className="font-medium">{n.label}</span>
                      <span className="block text-[15px] text-soft">{n.about}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </section>
        )}

        {section === "business" && (
          <form
            aria-label="Business details"
            className={`${card} flex flex-col gap-4 p-5`}
            onSubmit={(e) => {
              e.preventDefault();
              update((d) => ({ ...d, business: name.trim() }));
              setSavedName(true);
            }}
          >
            <div>
              <label htmlFor="biz" className="text-[15px] font-medium">
                Business name
              </label>
              <input id="biz" value={name} onChange={(e) => { setName(e.target.value); setSavedName(false); }} className={`${field} mt-1.5 max-w-md`} />
            </div>
            <p className="text-[15px] text-soft">Hours, prices and what you sell live in Business info, so Waggle can use them in replies.</p>
            <div className="flex flex-wrap items-center gap-3">
              <button type="submit" className={btnPrimary} disabled={!name.trim()}>
                Save
              </button>
              {savedName && (
                <span role="status" className="text-[15px] font-medium text-accent">
                  Saved.
                </span>
              )}
            </div>
          </form>
        )}
      </div>
    </>
  );
}
