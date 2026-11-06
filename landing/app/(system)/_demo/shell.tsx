"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "../../components/brand";
import { ThemeToggle } from "../../components/theme-toggle";
import { connectedList } from "./data";
import { setupSteps, useDemo } from "./store";
import { Icon, PlatformLogoDefs } from "./ui";

type Item = { href: string; label: string; short?: string; icon: Parameters<typeof Icon>[0]["name"] };

// Grouped by the job, not by the database: what you do each day, and how you teach Waggle.
const DAILY: Item[] = [
  { href: "/today", label: "Today", icon: "today" },
  { href: "/inbox", label: "Inbox", icon: "inbox" },
  { href: "/posts", label: "Posts", icon: "posts" },
  { href: "/leads", label: "Leads", icon: "leads" },
  { href: "/analytics", label: "Analytics", icon: "analytics" },
];
const TEACH: Item[] = [
  { href: "/knowledge-base", label: "Business info", icon: "info" },
  { href: "/lab", label: "Practice replies", icon: "lab" },
];
const SETTINGS: Item = { href: "/settings", label: "Settings", icon: "settings" };
const PHONE_TABS = DAILY.slice(0, 4);
const RAISED_TAB = "/posts";
const phoneTab = "relative flex min-h-14 flex-col items-center justify-center gap-1 px-1 pt-2 pb-1.5 text-[0.68rem] font-medium transition";

// A tab's icon, plus the honey line the homepage draws above whichever tab is active.
function TabMark({ active, icon }: { active: boolean; icon: Item["icon"] }) {
  return (
    <>
      <span aria-hidden="true" className={`absolute inset-x-3 top-0 h-[3px] rounded-b-full bg-honey transition-opacity ${active ? "opacity-100" : "opacity-0"}`} />
      <span className={active ? "text-accent" : undefined}>
        <Icon name={icon} size={24} weight={2} />
      </span>
    </>
  );
}

function Row({ item, active, count, onNavigate }: { item: Item; active: boolean; count?: number; onNavigate?: () => void }) {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={`flex min-h-11 items-center gap-2.5 rounded-[12px] px-3 text-[15px] transition ${active ? "bg-cream font-semibold text-ink" : "text-soft hover:bg-cream hover:text-ink"}`}
    >
      <Icon name={item.icon} />
      <span className="flex-1">{item.label}</span>
      {!!count && (
        <span className="rounded-full bg-honey px-2 text-xs leading-5 font-semibold text-hive tabular-nums" aria-label={`${count} waiting`}>
          {count}
        </span>
      )}
    </Link>
  );
}

function BrandRow() {
  const { demo } = useDemo();
  const live = connectedList(demo);
  const label = demo.paused ? "Replies paused" : live.length > 2 ? `Live on ${live.length} platforms` : live.length ? `Live on ${live.join(" and ")}` : "Not connected yet";
  return (
    <div className="px-3">
      <div className="truncate text-[15px] font-semibold">{demo.business}</div>
      <div className="flex items-center gap-1.5 text-[13px] text-muted">
        <span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${live.length && !demo.paused ? "bg-honey" : "bg-edge"}`} />
        <span className="truncate">{label}</span>
      </div>
    </div>
  );
}

function DemoSwitch() {
  const { scenario, setScenario } = useDemo();
  return (
    <div className="rounded-[12px] bg-cream p-3">
      <label htmlFor="demo-scenario" className="text-[13px] font-semibold">
        Prototype, sample data
      </label>
      <select
        id="demo-scenario"
        value={scenario}
        onChange={(e) => setScenario(e.target.value as typeof scenario)}
        className="mt-1.5 min-h-11 w-full rounded-lg border border-edge bg-surface px-2 text-sm text-ink max-lg:text-base lg:min-h-9"
      >
        <option value="busy">Show a busy shop</option>
        <option value="fresh">Show a new account</option>
      </select>
    </div>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { demo } = useDemo();
  const [sheet, setSheet] = useState(false);
  const counts: Record<string, number> = {
    "/inbox": demo.items.filter((i) => i.status === "foryou").length,
    "/leads": demo.leads.filter((l) => l.status === "new").length,
  };
  const on = (href: string) => path === href;
  const moreActive = !PHONE_TABS.some((t) => on(t.href));
  const close = () => setSheet(false);
  const stepsLeft = setupSteps(demo).filter((s) => !s.done).length;
  useEffect(() => {
    if (!sheet) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSheet(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sheet]);

  const nav = (onNavigate?: () => void) => (
    <>
      <p className="px-3 pt-2 pb-1 text-[13px] text-muted">Every day</p>
      {DAILY.map((i) => (
        <Row key={i.href} item={i} active={on(i.href)} count={counts[i.href]} onNavigate={onNavigate} />
      ))}
      <p className="px-3 pt-5 pb-1 text-[13px] text-muted">Teach Waggle</p>
      {TEACH.map((i) => (
        <Row key={i.href} item={i} active={on(i.href)} onNavigate={onNavigate} />
      ))}
    </>
  );

  return (
    <div className="system min-h-dvh lg:grid lg:grid-cols-[256px_minmax(0,1fr)]">
      <PlatformLogoDefs />
      <a href="#screen" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:rounded-full focus:bg-honey focus:px-4 focus:py-2 focus:text-hive">
        Skip to content
      </a>

      {/* Desktop: a labelled sidebar on the page's own ground */}
      <aside className="sticky top-0 hidden h-dvh flex-col gap-4 overflow-y-auto border-r border-line p-3 lg:flex">
        <Link href="/today" aria-label="Waggle, go to Today" className="flex min-h-14 items-center px-3 text-ink">
          <Logo />
        </Link>
        <BrandRow />
        <nav aria-label="Main">{nav()}</nav>
        <div className="mt-auto flex flex-col gap-2">
          <DemoSwitch />
          <Row item={SETTINGS} active={on("/settings")} />
          <div className="flex items-center justify-between">
            <Link href="/" className="flex min-h-11 items-center gap-2.5 rounded-[12px] px-3 text-[15px] text-soft transition hover:text-ink">
              <Icon name="out" />
              Sign out
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </aside>

      {/* Phones and tablets: a top bar with the business's name, four tabs and More */}
      <header className="sticky top-0 z-40 flex h-16 items-center justify-between gap-3 border-b border-line bg-bg px-4 lg:hidden">
        <Link href="/today" aria-label="Waggle, go to Today" className="flex min-h-11 items-center text-ink">
          <Logo />
        </Link>
        <span className="truncate text-sm font-semibold">{demo.business}</span>
      </header>

      <div className="min-w-0 pb-48 lg:pb-0">
        {demo.paused && (
          <div className="bg-honey px-4 py-2.5 text-[15px] font-medium text-hive md:px-8">
            All replies are paused. Nothing goes out until you turn them back on.{" "}
            <Link href="/settings" className="font-semibold underline underline-offset-2">
              Open Replies
            </Link>
          </div>
        )}
        {stepsLeft > 0 && !on("/today") && (
          <div className="border-b border-line bg-cream px-4 py-2.5 text-[15px] md:px-8">
            {stepsLeft} setup {stepsLeft === 1 ? "step" : "steps"} left before Waggle can answer.{" "}
            <Link href="/today" className="font-semibold text-accent underline underline-offset-2">
              See what’s next
            </Link>
          </div>
        )}
        <main id="screen" className="mx-auto w-full max-w-[1120px] px-4 py-6 md:px-8 md:py-8">
          {children}
        </main>
      </div>

      {/* Same bar as the homepage's phone navigation, with the middle tab raised in the thumb zone */}
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-[45] border-t border-line bg-[var(--nav-bg)] pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
        <ul className="grid grid-cols-5">
          {PHONE_TABS.map((t) =>
            t.href === RAISED_TAB ? (
              <li key={t.href} className="flex justify-center">
                <Link href={t.href} onClick={close} aria-current={on(t.href) ? "page" : undefined} className="-mt-6 flex flex-col items-center gap-1 pb-1.5 text-[0.68rem] font-semibold text-ink">
                  <span className="grid size-16 place-items-center rounded-full bg-honey text-hive shadow-[0_10px_24px_-8px_rgb(246_178_27/0.9)] ring-4 ring-bg transition active:scale-95">
                    <Icon name={t.icon} size={28} weight={2} />
                  </span>
                  <span className="leading-none whitespace-nowrap">{t.label}</span>
                </Link>
              </li>
            ) : (
              <li key={t.href}>
                <Link href={t.href} onClick={close} aria-current={on(t.href) ? "page" : undefined} className={`${phoneTab} ${on(t.href) ? "text-ink" : "text-muted"}`}>
                  <TabMark active={on(t.href)} icon={t.icon} />
                  <span className="leading-none whitespace-nowrap">{t.label}</span>
                  {!!counts[t.href] && (
                    <span className="absolute top-1 left-1/2 ml-1.5 rounded-full bg-honey px-1.5 text-[11px] leading-4 font-semibold text-hive tabular-nums">{counts[t.href]}</span>
                  )}
                </Link>
              </li>
            ),
          )}
          <li>
            <button type="button" onClick={() => setSheet((s) => !s)} aria-expanded={sheet} className={`${phoneTab} w-full ${moreActive || sheet ? "text-ink" : "text-muted"}`}>
              <TabMark active={moreActive || sheet} icon="more" />
              <span className="leading-none whitespace-nowrap">More</span>
            </button>
          </li>
        </ul>
      </nav>

      {/* More rises from the bottom, with the tab bar still showing, so tapping More again closes it */}
      {sheet && (
        <>
          <button type="button" aria-label="Close menu" onClick={close} className="fixed inset-0 z-[41] bg-black/50 lg:hidden" />
          <div role="dialog" aria-label="More screens" className="fixed inset-x-0 bottom-[var(--tabbar)] z-[42] flex max-h-[calc(100dvh-var(--tabbar)-3rem)] flex-col gap-3 overflow-y-auto rounded-t-[20px] border-t border-line bg-bg p-3 pb-8 lg:hidden">
            <BrandRow />
            <DemoSwitch />
            <div className="flex items-center justify-between">
              <Link href="/" className="flex min-h-11 items-center gap-2.5 px-3 text-[15px] text-soft">
                <Icon name="out" />
                Sign out
              </Link>
              <ThemeToggle />
            </div>
            <nav aria-label="More screens" className="border-t border-line pt-2">
              {[...TEACH, ...DAILY.filter((i) => !PHONE_TABS.some((t) => t.href === i.href)), SETTINGS].map((i) => (
                <Row key={i.href} item={i} active={on(i.href)} onNavigate={close} />
              ))}
            </nav>
          </div>
        </>
      )}
    </div>
  );
}
