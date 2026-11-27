"use client";

import { ArrowDownWideNarrow, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { cn } from "cn";
import { LIST_SORTS, type ListSort } from "./list-sort";

// The List view's sort (Posts Round 5): chips in the list's header on a computer; on a phone, a
// Sort button opens a sheet from the bottom with the same choices. Each is a link (the sort lives
// in the address).

function SortChip({ on, href, children }: { on: boolean; href: string; children: string }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={on ? "true" : undefined}
      className={cn(
        "inline-flex min-h-9 items-center rounded-full border px-3 text-[13px] font-semibold",
        on
          ? "bg-honey-tint border-honey-border text-ink"
          : "border-line-strong bg-surface text-ink-2 hover:bg-subtle",
      )}
    >
      {children}
    </Link>
  );
}

export function ListSortBar({ sort, hrefs }: { sort: ListSort; hrefs: Record<ListSort, string> }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  const current = LIST_SORTS.find((s) => s.key === sort)?.label ?? "Newest";
  return (
    <>
      <nav aria-label="Sort posts" className="hidden flex-wrap items-center gap-1.5 md:flex">
        <span className="text-ink-3 text-[13px]">Sort</span>
        {LIST_SORTS.map((s) => (
          <SortChip key={s.key} on={sort === s.key} href={hrefs[s.key]}>
            {s.label}
          </SortChip>
        ))}
      </nav>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="border-line-strong bg-surface hover:bg-subtle inline-flex min-h-10 items-center gap-1.5 self-start rounded-xl border px-3 text-[13px] font-semibold md:hidden"
      >
        <ArrowDownWideNarrow className="size-4" strokeWidth={1.75} aria-hidden />
        Sort · {current}
      </button>
      {open && (
        <div className="md:hidden">
          <button
            type="button"
            aria-label="Close sort"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 bg-black/30"
          />
          <div
            role="dialog"
            aria-label="Sort posts"
            className="overlay fixed inset-x-0 bottom-0 z-50 flex flex-col gap-3 rounded-b-none p-4 pb-6"
          >
            <div className="flex items-center gap-2">
              <p className="font-semibold">Sort</p>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setOpen(false)}
                className="hover:bg-subtle ml-auto rounded-lg p-1.5"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {LIST_SORTS.map((s) => (
                <SortChip key={s.key} on={sort === s.key} href={hrefs[s.key]}>
                  {s.label}
                </SortChip>
              ))}
            </div>
            <p className="meta">
              Most reached and Most engagement put posted posts with numbers first.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
