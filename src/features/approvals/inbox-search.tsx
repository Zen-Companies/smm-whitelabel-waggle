"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

/**
 * The search box on top of the Inbox list (Inbox polish, approved 16 Nov): results follow the
 * typing, across all three tabs; "/" jumps in from anywhere on the page.
 */
export function InboxSearch({ initial }: { initial: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [prevInitial, setPrevInitial] = useState(initial);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  // Cleared from elsewhere (the "Clear search" link): empty the box too.
  if (initial !== prevInitial) {
    setPrevInitial(initial);
    if (initial === "") setValue("");
  }

  const go = (q: string) =>
    start(() => router.replace(q ? `/inbox?q=${encodeURIComponent(q)}` : "/inbox"));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      e.preventDefault();
      input.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const q = value.trim();
    if (q === initial.trim()) return;
    const t = setTimeout(() => go(q), 300);
    return () => clearTimeout(t);
    // `go` only wraps the router; re-running on its identity would re-arm the timer each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, initial]);

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        go(value.trim());
      }}
      className="border-line bg-page focus-within:border-honey focus-within:ring-honey/40 flex min-h-11 items-center gap-2.5 rounded-xl border px-3.5 focus-within:ring-3"
    >
      <Search className="text-ink-3 size-[18px] shrink-0" strokeWidth={2} aria-hidden />
      <label htmlFor="inbox-search" className="sr-only">
        Search names and messages
      </label>
      <input
        ref={input}
        id="inbox-search"
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search names and messages"
        aria-busy={pending || undefined}
        autoComplete="off"
        className="placeholder:text-ink-3 min-w-0 flex-1 bg-transparent text-[15px] outline-none [&::-webkit-search-cancel-button]:hidden"
      />
      {value ? (
        <button
          type="button"
          onClick={() => {
            setValue("");
            go("");
            input.current?.focus();
          }}
          className="text-ink-2 hover:text-ink -mr-1.5 min-h-9 rounded-md px-1.5 text-[13px] font-medium"
        >
          Clear
        </button>
      ) : (
        <kbd
          aria-hidden
          className="border-line bg-surface text-ink-3 rounded-md border px-1.5 text-xs font-semibold"
        >
          /
        </kbd>
      )}
    </form>
  );
}
