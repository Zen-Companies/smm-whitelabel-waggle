"use client";

import { useRef, useState } from "react";
import { TODAY, connectedList, type Platform, type Post } from "../_demo/data";
import { useDemo } from "../_demo/store";
import { Icon, PageHead, Pill, PlatformLogo, Segmented, btnPrimary, btnQuiet, card, fab, field, sheetFooter, sheetForm, thumbDock } from "../_demo/ui";

const WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const iso = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const nice = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
const STATUS: Record<Post["status"], string> = { published: "Published", scheduled: "Scheduled", failed: "Didn’t go out" };

export function PostsView() {
  const { demo, update } = useDemo();
  const [view, setView] = useState<"month" | "list">("month");
  const [month, setMonth] = useState({ y: 2026, m: 10 });
  const [text, setText] = useState("");
  const [skipped, setSkipped] = useState<Platform[]>([]);
  const [when, setWhen] = useState<"now" | "later">("later");
  const [date, setDate] = useState(TODAY);
  const [time, setTime] = useState("09:00");
  const [done, setDone] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [photo, setPhoto] = useState<{ url: string; name: string } | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const failed = demo.posts.find((p) => p.status === "failed");

  const live = connectedList(demo);
  const usable = live.filter((p) => !skipped.includes(p));
  const first = new Date(month.y, month.m, 1);
  const label = first.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const blanks = first.getDay();
  const days = new Date(month.y, month.m + 1, 0).getDate();
  const move = (by: number) => setMonth((c) => { const d = new Date(c.y, c.m + by, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  const sorted = [...demo.posts].sort((a, b) => a.date.localeCompare(b.date));
  const toTime = (t: string) => new Date(`2026-01-01T${t}`).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

  function plan(day: string) {
    setDate(day);
    setWhen("later");
    setDone(null);
    openComposer();
  }
  function openComposer() {
    setComposing(true);
    requestAnimationFrame(() => box.current?.focus());
  }
  function submit(e: React.FormEvent) {
    e.preventDefault();
    const now = when === "now";
    const post: Post = { id: crypto.randomUUID(), date: now ? TODAY : date, time: now ? "Just now" : toTime(time), text: text.trim(), platforms: usable, status: now ? "published" : "scheduled" };
    update((d) => ({ ...d, posts: [...d.posts, post] }));
    setText("");
    setPhoto(null);
    setComposing(false);
    setDone(now ? "Posted (sample only, nothing really went out)." : `Scheduled for ${nice(date)} (sample only).`);
  }

  return (
    <>
      <PageHead title="Posts" about="Plan what goes out and when. Waggle publishes it and tells you if a post didn’t go out." />
      <button type="button" className={`${fab} bottom-[calc(var(--tabbar)+92px)]`} onClick={openComposer}>
        <Icon name="plus" /> New post
      </button>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section aria-label="Your posts" className="min-w-0">
          {done && (
            <p role="status" className="mb-3 text-[15px] font-medium text-accent">
              {done}
            </p>
          )}
          {failed && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-[18px] bg-ink p-4 text-bg">
              <p className="min-w-0 flex-1 basis-[220px] text-[15px]">“{failed.text}” didn’t go out on {failed.platforms.join(" and ")}.</p>
              <button type="button" className="min-h-11 rounded-full bg-bg px-4 text-[15px] font-semibold text-ink" onClick={() => update((d) => ({ ...d, posts: d.posts.map((p) => (p.status === "failed" ? { ...p, status: "published" } : p)) }))}>
                Try again
              </button>
            </div>
          )}
          <div className={`mb-3 flex items-center gap-1.5 lg:gap-2 ${thumbDock}`}>
            <button type="button" aria-label="Previous month" onClick={() => move(-1)} className="grid size-11 place-items-center rounded-full border border-line hover:border-edge">
              <Icon name="back" />
            </button>
            <button type="button" aria-label="Next month" onClick={() => move(1)} className="grid size-11 rotate-180 place-items-center rounded-full border border-line hover:border-edge">
              <Icon name="back" />
            </button>
            <h2 className="mr-auto ml-1 min-w-0 truncate font-semibold max-lg:text-[15px]">{label}</h2>
            <Segmented label="Calendar view" value={view} onChange={setView} options={[{ id: "month", label: "Month" }, { id: "list", label: "List" }]} />
          </div>

          {view === "month" ? (
            <div className={`${card} overflow-hidden`}>
              <div className="grid grid-cols-7 border-b border-line text-[13px] text-muted">
                {WEEK.map((d) => (
                  <span key={d} className="px-1.5 py-2 sm:px-2.5">
                    {d}
                  </span>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {Array.from({ length: blanks }, (_, i) => (
                  <span key={`b${i}`} className="border-r border-b border-line bg-surface-2" />
                ))}
                {Array.from({ length: days }, (_, i) => i + 1).map((d) => {
                  const day = iso(month.y, month.m, d);
                  const here = demo.posts.filter((p) => p.date === day);
                  return (
                    <button key={d} type="button" disabled={day < TODAY} onClick={() => plan(day)} aria-label={day < TODAY ? `${nice(day)}${here.length ? `, ${here.length} ${here.length === 1 ? "post" : "posts"}` : ""}` : `Plan a post for ${nice(day)}${here.length ? `, ${here.length} planned` : ""}`} className="flex min-h-[68px] min-w-0 flex-col gap-1 border-r border-b border-line p-1.5 text-left align-top transition not-disabled:hover:bg-cream sm:min-h-[92px] sm:p-2.5">
                      <span className={`text-[13px] tabular-nums ${day === TODAY ? "grid size-6 place-items-center rounded-full bg-honey font-semibold text-hive" : "text-muted"}`}>{d}</span>
                      {here.map((p) => (
                        <span key={p.id} className={`hidden truncate rounded-md px-1.5 py-0.5 text-xs sm:block ${p.status === "failed" ? "bg-ink text-bg" : p.status === "scheduled" ? "bg-honey-soft font-medium text-ink" : "bg-cream text-soft"}`}>
                          {p.text}
                        </span>
                      ))}
                      {here.length > 0 && <span aria-hidden="true" className={`size-1.5 rounded-full sm:hidden ${here.some((p) => p.status === "failed") ? "bg-ink" : here.some((p) => p.status === "scheduled") ? "bg-honey" : "bg-cream ring-1 ring-edge"}`} />}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <PostList posts={sorted} />
          )}
          {view === "month" && (
            <>
              <ul aria-label="What the colours mean" className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted">
                <li className="flex items-center gap-1.5"><span aria-hidden="true" className="size-2.5 rounded-sm bg-cream ring-1 ring-edge" />Published</li>
                <li className="flex items-center gap-1.5"><span aria-hidden="true" className="size-2.5 rounded-sm bg-honey" />Scheduled</li>
                <li className="flex items-center gap-1.5"><span aria-hidden="true" className="size-2.5 rounded-sm bg-ink" />Didn’t go out</li>
              </ul>
              {/* Calendar cells only fit dots on a phone, so the month's posts are listed underneath */}
              <div className="mt-3 sm:hidden">
                <PostList posts={sorted.filter((p) => p.date.startsWith(iso(month.y, month.m, 1).slice(0, 7)))} />
              </div>
            </>
          )}
        </section>

        <form onSubmit={submit} onKeyDown={(e) => e.key === "Escape" && setComposing(false)} aria-label="New post" className={`${card} flex flex-col gap-4 self-start p-5 ${sheetForm(composing)}`}>
          <h2 className="text-lg font-semibold">New post</h2>
          <div>
            <label htmlFor="post-text" className="text-[15px] font-medium">
              What do you want to share?
            </label>
            <textarea id="post-text" ref={box} rows={4} maxLength={2200} value={text} onChange={(e) => { setText(e.target.value); setDone(null); }} placeholder="New on the menu: ube cheese pandesal, every morning from 7." className={`${field} mt-1.5`} />
          </div>
          <div>
            <label htmlFor="post-photo" className="text-[15px] font-medium">
              Photo <span className="font-normal text-muted">JPG or PNG, up to 5MB</span>
            </label>
            <input
              id="post-photo"
              type="file"
              accept="image/jpeg,image/png"
              className="mt-1.5 block min-h-11 w-full text-[13px] text-soft file:mr-3 file:min-h-11 file:cursor-pointer file:rounded-full file:border file:border-edge file:bg-transparent file:px-4 file:text-[15px] file:font-medium file:text-ink"
              onChange={(e) => {
                const f = e.target.files?.[0];
                setPhoto(f ? { url: URL.createObjectURL(f), name: f.name } : null);
              }}
            />
            {photo && (
              // A local preview of the picked file, which next/image can't optimise
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photo.url} alt={`Preview of ${photo.name}`} className="mt-2 max-h-40 rounded-xl border border-line" />
            )}
          </div>
          <fieldset>
            <legend className="text-[15px] font-medium">Post to</legend>
            {live.length > 0 ? (
              <div className="mt-1.5 flex flex-wrap gap-x-4">
                {live.map((p) => (
                  <label key={p} className="flex min-h-11 items-center gap-2 text-[15px]">
                    <input type="checkbox" className="size-4 accent-honey" checked={!skipped.includes(p)} onChange={(e) => setSkipped((s) => (e.target.checked ? s.filter((x) => x !== p) : [...s, p]))} />
                    <PlatformLogo platform={p} small />
                    {p}
                  </label>
                ))}
              </div>
            ) : (
              <p className="mt-1 text-[15px] text-soft">Connect an account in Settings first.</p>
            )}
          </fieldset>
          <div>
            <p id="when-label" className="mb-1.5 text-[15px] font-medium">
              When
            </p>
            <Segmented label="When to post" value={when} onChange={setWhen} options={[{ id: "now", label: "Now" }, { id: "later", label: "Schedule" }]} />
            {when === "later" && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <label className="text-[13px] text-muted">
                  Day
                  <input type="date" required value={date} min={TODAY} onChange={(e) => setDate(e.target.value)} className={`${field} mt-1`} />
                </label>
                <label className="text-[13px] text-muted">
                  Time
                  <input type="time" required value={time} onChange={(e) => setTime(e.target.value)} className={`${field} mt-1`} />
                </label>
              </div>
            )}
          </div>
          <div className={sheetFooter}>
            <button type="button" className={`${btnQuiet} lg:hidden`} onClick={() => setComposing(false)}>
              Cancel
            </button>
            <button type="submit" className={`${btnPrimary} flex-1`} disabled={!text.trim() || usable.length === 0}>
              {when === "now" ? "Post now" : "Schedule post"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

function PostList({ posts }: { posts: Post[] }) {
  return (
    <ul className={card}>
      {posts.length === 0 && <li className="p-4 text-[15px] text-soft">No posts here yet. Write your first one in New post.</li>}
      {posts.map((p) => (
        <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line p-4 last:border-b-0">
          <div className="min-w-[200px] flex-1">
            <p className="text-[15px]">{p.text}</p>
            <p className="mt-0.5 text-[13px] text-muted">
              {nice(p.date)}, {p.time} · {p.platforms.join(" and ")}
            </p>
          </div>
          <Pill tone={p.status === "failed" ? "alert" : "plain"}>{STATUS[p.status]}</Pill>
        </li>
      ))}
    </ul>
  );
}
