"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "cn";
import { setupSendingProgress } from "./actions";
import { answerMeter, highlightParts, progressLine, type BatchProgress } from "./copy";
import { pageOf } from "./paging";

/** "‹ Page 1 of 7 ›" with "1–4 of 37": the list pages inside the screen. */
export function PagerNav({
  page,
  pages,
  from,
  to,
  total,
  onPage,
  label,
}: {
  page: number;
  pages: number;
  from: number;
  to: number;
  total: number;
  onPage: (p: number) => void;
  label: string;
}) {
  return (
    <nav
      aria-label={`${label}: pages`}
      className="text-ink-3 flex items-center justify-between gap-2 text-xs"
    >
      <span className="tabular-nums" aria-live="polite">
        {from}–{to} of {total}
      </span>
      {pages > 1 && (
        <span className="flex items-center gap-1">
          <PageButton label="Previous page" disabled={page === 0} onClick={() => onPage(page - 1)}>
            <ChevronLeft className="size-4" aria-hidden />
          </PageButton>
          <span className="tabular-nums">
            Page {page + 1} of {pages}
          </span>
          <PageButton
            label="Next page"
            disabled={page >= pages - 1}
            onClick={() => onPage(page + 1)}
          >
            <ChevronRight className="size-4" aria-hidden />
          </PageButton>
        </span>
      )}
    </nav>
  );
}

function PageButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="hover:bg-subtle inline-flex size-9 items-center justify-center rounded-lg disabled:opacity-35"
    >
      {children}
    </button>
  );
}

/** A list a page at a time, in a card. */
export function PagedList<T>({
  items,
  size,
  label,
  header,
  render,
}: {
  items: readonly T[];
  size: number;
  label: string;
  header?: ReactNode;
  render: (item: T) => ReactNode;
}) {
  const [page, setPage] = useState(0);
  const p = pageOf(items, page, size);
  return (
    <div className="flex flex-col gap-2">
      <div className="card overflow-hidden">
        {header}
        <ul aria-label={label} className="divide-line divide-y">
          {p.items.map(render)}
        </ul>
      </div>
      <PagerNav {...p} onPage={setPage} label={label} />
    </div>
  );
}

/** The customer's message (whole, never cut) and Waggle's reply, facts to check highlighted. */
export function Exchange({
  name,
  meta,
  metaTone = "danger",
  question,
  reply,
  marks = [],
  children,
}: {
  name: string;
  meta: string;
  metaTone?: "danger" | "muted" | "success";
  question: string;
  reply?: string;
  marks?: readonly string[];
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5 px-3 py-2.5">
      <span className="flex flex-wrap items-baseline justify-between gap-x-2 text-[12.5px]">
        <b className="min-w-0 font-semibold break-words">{name}</b>
        <span
          className={cn(
            "whitespace-nowrap",
            metaTone === "danger" && "text-danger",
            metaTone === "muted" && "text-ink-3",
            metaTone === "success" && "text-success",
          )}
        >
          {meta}
        </span>
      </span>
      <span className="bg-subtle max-w-[92%] self-start rounded-xl px-2.5 py-1.5 text-[13px] break-words whitespace-pre-line">
        {question}
      </span>
      {reply !== undefined && (
        <span className="bg-honey-tint max-w-[88%] self-end rounded-xl px-2.5 py-1.5 text-[13px] break-words whitespace-pre-line">
          {highlightParts(reply, marks).map((part, i) =>
            part.mark ? (
              <mark
                key={i}
                className="border-honey-border rounded border bg-[#FFF4D9] px-0.5 font-semibold text-inherit dark:bg-[#3A2E12]"
              >
                {part.text}
              </mark>
            ) : (
              <span key={i}>{part.text}</span>
            ),
          )}
        </span>
      )}
      {children}
    </div>
  );
}

/** "Can answer on its own: X of Y", sticky on top of step 3's screens. */
export function AnswerMeter({ approved, total }: { approved: number; total: number }) {
  const m = answerMeter(approved, total);
  if (m.y === 0) return null;
  return (
    <div className="card bg-surface sticky top-0 z-10 flex flex-col gap-1.5 px-3 py-2">
      <span className="flex justify-between gap-2 text-[12.5px]">
        <b className="font-semibold">
          Can answer on its own: {m.x} of {m.y}
        </b>
        <span className="text-ink-3 tabular-nums">{m.pct}%</span>
      </span>
      <span
        className="bg-line h-[5px] overflow-hidden rounded-full"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={m.y}
        aria-valuenow={m.x}
        aria-label="Replies checked and sent"
      >
        <span className="bg-honey block h-full rounded-full" style={{ width: `${m.pct}%` }} />
      </span>
    </div>
  );
}

const POLL_MS = 5_000;

/**
 * Decision 8: replies sent from setup go out in the background, 25 s apart per account; this
 * card follows their real statuses (asked every 5 seconds, no Realtime) until all are out.
 */
export function SendingCard({
  initial,
  spacingMs,
  platform,
}: {
  initial: BatchProgress;
  spacingMs: number;
  platform: string;
}) {
  const [p, setP] = useState(initial);
  useEffect(() => {
    if (p.left === 0) return;
    const id = setInterval(() => {
      void setupSendingProgress().then((next) => {
        if (next) setP(next);
      });
    }, POLL_MS);
    return () => clearInterval(id);
  }, [p.left]);
  if (p.total === 0) return null;
  const pct = Math.round((100 * p.sent) / p.total);
  return (
    <div className="card flex flex-col gap-2 p-3 text-[13px]" role="status">
      <span className="flex justify-between gap-2">
        <b className="font-semibold">
          {p.left ? `Sending ${p.total} ${p.total === 1 ? "reply" : "replies"}` : "Sent"}
        </b>
        <span className="text-ink-3 tabular-nums">
          {p.sent} of {p.total}
        </span>
      </span>
      <span className="bg-line h-[5px] overflow-hidden rounded-full">
        <span className="bg-success block h-full rounded-full" style={{ width: `${pct}%` }} />
      </span>
      <span className="text-ink-2">{progressLine(p, spacingMs, platform)}</span>
    </div>
  );
}
