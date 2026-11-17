"use client";

import { useSyncExternalStore } from "react";
import { cn } from "cn";
import { parseThemePref, resolveTheme, THEME_KEY, type ThemePref } from "./theme";

const OPTIONS: { id: ThemePref; label: string }[] = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "system", label: "Match device" },
];

function read(): ThemePref {
  try {
    return parseThemePref(localStorage.getItem(THEME_KEY));
  } catch {
    return "light";
  }
}

const listeners = new Set<() => void>();
function subscribe(fn: () => void) {
  listeners.add(fn);
  window.addEventListener("storage", fn);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("storage", fn);
  };
}

function choose(pref: ThemePref) {
  try {
    localStorage.setItem(THEME_KEY, pref);
  } catch {
    // Storage blocked: the choice still applies to this page.
  }
  const deviceDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.dataset.theme = resolveTheme(pref, deviceDark);
  listeners.forEach((fn) => fn());
}

/** Light / Dark / Match device (design.md §1 rule 9), remembered on this device. */
export function ThemeChoice({ className }: { className?: string }) {
  const pref = useSyncExternalStore(subscribe, read, () => "light" as ThemePref);
  return (
    <div
      role="radiogroup"
      aria-label="Appearance"
      className={cn("bg-subtle inline-flex gap-1 rounded-xl p-1", className)}
    >
      {OPTIONS.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={pref === o.id}
          onClick={() => choose(o.id)}
          className={cn(
            "min-h-9 flex-1 rounded-[10px] px-3 text-sm whitespace-nowrap transition-colors duration-150",
            pref === o.id ? "bg-surface text-ink font-semibold shadow-sm" : "text-ink-2 hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
