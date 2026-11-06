"use client";

import { useEffect, useState } from "react";
import { Logo } from "./brand";
import { ThemeToggle } from "./theme-toggle";
import { APP_URL } from "../lib/site";

const LINKS = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#rules", label: "Our rules" },
  { href: "#whats-next", label: "What's next" },
  { href: "#pricing", label: "Pricing" },
];

// Phone navigation: a bottom tab bar (the Facebook / Instagram pattern), not a hamburger menu.
// The primary action sits raised in the centre, in the thumb zone (Fitts's law: big and close = easy to hit).
type Tab = { href: string; label: string; icon: React.ReactNode; primary?: boolean };
const TABS: Tab[] = [
  {
    href: "#how-it-works",
    label: "How it works",
    icon: <path d="M12 3v3M12 18v3M3 12h3M18 12h3M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" />,
  },
  { href: "#rules", label: "Rules", icon: <path d="M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6l-8-3ZM9 12l2 2 4-4" /> },
  { href: `${APP_URL}/signup`, label: "Start free", icon: <path d="M12 5v14M5 12h14" />, primary: true },
  { href: "#pricing", label: "Pricing", icon: <path d="M20 12 12 20l-8-8V4h8l8 8ZM8.5 8.5h.01" /> },
  {
    href: `${APP_URL}/login`,
    label: "Log in",
    icon: <path d="M20 21a8 8 0 0 0-16 0M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />,
  },
];

const SECTION_IDS = ["how-it-works", "rules", "whats-next", "pricing"];

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Scroll spy: light up the tab for the section in the middle of the screen
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(e.target.id);
      },
      { rootMargin: "-45% 0px -50% 0px" },
    );
    SECTION_IDS.forEach((id) => {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    });
    const top = document.getElementById("top");
    const topIo = new IntersectionObserver(([e]) => e.isIntersecting && setActive(null), { threshold: 0.4 });
    if (top) topIo.observe(top);
    return () => {
      io.disconnect();
      topIo.disconnect();
    };
  }, []);

  return (
    <>
      {/* Top app bar on phones, floating pill nav on desktop */}
      <header className="fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-4 sm:pt-4">
        <nav
          aria-label="Main"
          className={`mx-auto flex max-w-6xl items-center justify-between rounded-full px-4 py-2 transition-all duration-300 sm:px-6 ${
            scrolled ? "border border-line bg-[var(--nav-bg)] shadow-card backdrop-blur-xl" : "border border-transparent"
          }`}
        >
          <a href="#top" aria-label="Waggle home" className="flex min-h-11 items-center text-ink">
            <Logo />
          </a>

          <div className="hidden items-center gap-7 text-[0.95rem] font-medium text-soft md:flex">
            {LINKS.map((l) => (
              <a key={l.href} href={l.href} className="transition hover:text-ink">
                {l.label}
              </a>
            ))}
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <ThemeToggle />
            <a href={`${APP_URL}/login`} className="hidden h-11 items-center px-3 text-[0.95rem] font-medium text-soft transition hover:text-ink md:inline-flex">
              Log in
            </a>
            <a
              href={`${APP_URL}/signup`}
              className="hidden h-11 items-center rounded-full bg-honey px-6 text-base font-semibold text-hive shadow-[0_8px_20px_-8px_rgb(246_178_27/0.8)] transition hover:-translate-y-0.5 hover:bg-honey-glow md:inline-flex"
            >
              Start free
            </a>
          </div>
        </nav>
      </header>

      {/* Bottom tab bar, phones and small tablets only */}
      <nav
        aria-label="Sections"
        className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-[var(--nav-bg)] pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
      >
        <ul className="grid grid-cols-5">
          {TABS.map((t) => {
            const isActive = active !== null && t.href === `#${active}`;
            if (t.primary)
              return (
                <li key={t.label} className="flex justify-center">
                  <a href={t.href} className="-mt-6 flex flex-col items-center gap-1 pb-1.5 text-[0.68rem] font-semibold text-ink">
                    <span className="grid size-16 place-items-center rounded-full bg-honey text-hive shadow-[0_10px_24px_-8px_rgb(246_178_27/0.9)] ring-4 ring-bg transition active:scale-95">
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                        {t.icon}
                      </svg>
                    </span>
                    <span className="leading-none whitespace-nowrap">{t.label}</span>
                  </a>
                </li>
              );
            return (
              <li key={t.label}>
                <a
                  href={t.href}
                  aria-current={isActive ? "location" : undefined}
                  className={`relative flex min-h-14 flex-col items-center justify-center gap-1 px-1 pt-2 pb-1.5 text-[0.68rem] font-medium transition ${
                    isActive ? "text-ink" : "text-muted"
                  }`}
                >
                  {/* active indicator: the honey line Facebook draws in blue */}
                  <span
                    className={`absolute inset-x-3 top-0 h-[3px] rounded-b-full bg-honey transition-opacity ${isActive ? "opacity-100" : "opacity-0"}`}
                  />
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={isActive ? "var(--accent-text)" : "currentColor"}
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    {t.icon}
                  </svg>
                  <span className="leading-none whitespace-nowrap">{t.label}</span>
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
