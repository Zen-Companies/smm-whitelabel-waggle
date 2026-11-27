"use client";

import { SlidersHorizontal, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "cn";
import {
  activeFilterCount,
  DEFAULT_FILTERS,
  filterParams,
  INBOX_FLAGS,
  INBOX_TYPES,
  toggleFilter,
  type InboxFilters,
  type InboxSort,
} from "./inbox-groups";

// Inbox by sender (approved 26 Nov, board section 3): one Filters button with how many are on.
// Desktop: a panel over the list; phone: a sheet from the bottom that also holds Sort. Nothing
// applies until "Show conversations"; the filters then live in the address.

function hrefFor(path: string, filters: InboxFilters): string {
  const q = new URLSearchParams(filterParams(filters)).toString();
  return q ? `${path}?${q}` : path;
}

function Chip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "min-h-9 rounded-full border px-3 text-[13px] font-semibold transition-colors duration-150",
        on
          ? "bg-honey-tint border-honey-border text-ink"
          : "border-line-strong text-ink-2 hover:bg-subtle bg-surface",
      )}
    >
      {children}
    </button>
  );
}

function SortControl({
  sort,
  onChange,
}: {
  sort: InboxSort;
  onChange: (sort: InboxSort) => void;
}) {
  return (
    <div className="segmented" role="group" aria-label="Sort">
      {(["priority", "newest"] as const).map((s) => (
        <button
          key={s}
          type="button"
          data-active={sort === s || undefined}
          aria-pressed={sort === s}
          onClick={() => onChange(s)}
        >
          {s === "priority" ? "Priority" : "Newest"}
        </button>
      ))}
    </div>
  );
}

export function InboxFiltersButton({
  path,
  filters,
  platforms,
  showSort,
}: {
  /** The tab's path (/inbox, /inbox/answered, /inbox/hidden). */
  path: string;
  filters: InboxFilters;
  /** Connected platforms only: [key, label]. */
  platforms: { key: string; label: string }[];
  /** Sort applies to For you only. */
  showSort: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(filters);
  const count = activeFilterCount(filters);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const show = () => {
    setOpen(false);
    router.push(hrefFor(path, draft));
  };

  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          setDraft(filters);
          setOpen((o) => !o);
        }}
        className="border-line-strong hover:bg-subtle inline-flex min-h-9 items-center gap-1.5 rounded-xl border px-3 text-[13px] font-semibold"
      >
        <SlidersHorizontal className="size-4" strokeWidth={1.75} aria-hidden />
        Filters
        {count > 0 && (
          <span className="bg-honey text-ink rounded-full px-1.5 text-xs tabular-nums">{count}</span>
        )}
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-label="Close filters"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 bg-black/30 lg:hidden"
          />
          <div
            role="dialog"
            aria-label="Filters"
            className={cn(
              "overlay z-50 flex flex-col gap-4 p-4",
              // Phone: a sheet from the bottom. Desktop: a panel over the list.
              "fixed inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-b-none pb-6",
              "lg:absolute lg:inset-x-2 lg:top-full lg:bottom-auto lg:mt-1 lg:max-h-[70vh] lg:rounded-b-[12px] lg:pb-4",
            )}
          >
            <div className="flex items-center gap-2">
              <p className="font-semibold">Filters</p>
              <button
                type="button"
                className="text-ink-2 hover:text-ink ml-auto text-[13px] font-semibold"
                onClick={() => setDraft({ ...DEFAULT_FILTERS, sort: draft.sort })}
              >
                Clear all
              </button>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setOpen(false)}
                className="hover:bg-subtle rounded-lg p-1.5"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
            {showSort && (
              <fieldset className="flex flex-col gap-2 lg:hidden">
                <legend className="label pb-2">Sort</legend>
                <SortControl sort={draft.sort} onChange={(sort) => setDraft({ ...draft, sort })} />
              </fieldset>
            )}
            {platforms.length > 1 && (
              <fieldset className="flex flex-col gap-2">
                <legend className="label pb-2">Platform</legend>
                <div className="flex flex-wrap gap-2">
                  {platforms.map((p) => (
                    <Chip
                      key={p.key}
                      on={draft.platforms.includes(p.key)}
                      onClick={() => setDraft(toggleFilter(draft, "platforms", p.key))}
                    >
                      {p.label}
                    </Chip>
                  ))}
                </div>
              </fieldset>
            )}
            <fieldset className="flex flex-col gap-2">
              <legend className="label pb-2">Type</legend>
              <div className="flex flex-wrap gap-2">
                {INBOX_TYPES.map((t) => (
                  <Chip
                    key={t.key}
                    on={draft.types.includes(t.key)}
                    onClick={() => setDraft(toggleFilter(draft, "types", t.key))}
                  >
                    {t.label}
                  </Chip>
                ))}
              </div>
            </fieldset>
            <fieldset className="flex flex-col gap-2">
              <legend className="label pb-2">Status</legend>
              <div className="flex flex-wrap gap-2">
                {INBOX_FLAGS.map((f) => (
                  <Chip
                    key={f.key}
                    on={draft.flags.includes(f.key)}
                    onClick={() => setDraft(toggleFilter(draft, "flags", f.key))}
                  >
                    {f.label}
                  </Chip>
                ))}
              </div>
            </fieldset>
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                className="mt-1 size-4 accent-[var(--ink)]"
                checked={draft.customersOnly}
                onChange={(e) => setDraft({ ...draft, customersOnly: e.target.checked })}
              />
              <span className="flex flex-col">
                <span className="text-sm font-semibold">From customers only</span>
                <span className="text-ink-3 text-[13px]">
                  Hides newsletters, no-reply and automated senders. On for email.
                </span>
              </span>
            </label>
            <Button type="button" onClick={show} className="min-h-11 w-full">
              Show conversations
            </Button>
          </div>
        </>
      )}
    </>
  );
}

/** Sort on the bar (desktop); on a phone it lives in the filters sheet. */
export function InboxSortBar({ path, filters }: { path: string; filters: InboxFilters }) {
  const router = useRouter();
  return (
    <div className="hidden items-center gap-2 text-[13px] lg:flex">
      <span className="text-ink-3">Sort</span>
      <SortControl
        sort={filters.sort}
        onChange={(sort) => router.push(hrefFor(path, { ...filters, sort }))}
      />
    </div>
  );
}
