"use client";

import { ThumbsDown, ThumbsUp, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { BeeBody } from "@/components/app/bee";
import { Button } from "@/components/ui/button";
import { cn } from "cn";
import { addRatingReason, markNudge, ratePage, sendFeedback, type SendState } from "./actions";
import {
  FEEDBACK_TYPES,
  FOLLOW_UP,
  NUDGES,
  pageInfo,
  TYPE_LABEL,
  type FeedbackType,
  type NudgeKey,
} from "./pages";
import type { EarlierNote } from "./server";

const ago = (iso: string, now: number) => {
  const min = Math.round((now - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
};

/** How long a page is open before its nudge may slide up. */
const NUDGE_DELAY_MS = 20_000;

/**
 * Help & feedback (design v3 "Beta access and feedback"): a Feedback button with the bee on every
 * page, a page-aware panel made for many notes (one box, optional type with one open question,
 * stays open after Send), a one-tap page rating, and a nudge after a first.
 */
export function FeedbackWidget({
  orgId,
  tenantId,
  earlier: initialEarlier,
  nudges,
}: {
  orgId: string | null;
  tenantId: string | null;
  earlier: EarlierNote[];
  nudges: NudgeKey[];
}) {
  const pathname = usePathname();
  const info = pageInfo(pathname);
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<FeedbackType | null>(null);
  const [state, action, pending] = useActionState<SendState, FormData>(sendFeedback, {});
  const earlier = state.earlier ?? initialEarlier;
  const [rating, setRating] = useState<{
    page: string;
    value: "good" | "not_good";
    id?: string;
  } | null>(null);
  const [reasonSent, setReasonSent] = useState(false);
  const [, startRating] = useTransition();
  const [nudge, setNudge] = useState<NudgeKey | null>(null);
  const [flyKey, setFlyKey] = useState(0);
  const form = useRef<HTMLFormElement>(null);
  const [now, setNow] = useState(() => Date.now());

  // Sent: the box empties and stays open for the next note.
  useEffect(() => {
    if (state.sentAt) form.current?.reset();
  }, [state.sentAt]);

  // A nudge for this page, after a while, never while someone is typing.
  const pageNudge = nudges.find((k) => NUDGES[k].page === info.page) ?? null;
  useEffect(() => {
    if (!pageNudge || open) return;
    const timer = window.setTimeout(() => {
      const el = document.activeElement;
      const busy =
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        el?.getAttribute("contenteditable") === "true";
      if (busy) return;
      setNudge(pageNudge);
      void markNudge(pageNudge, "shown");
    }, NUDGE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [pageNudge, open]);
  useEffect(() => {
    if (!nudge) return;
    const timer = window.setTimeout(() => setNudge(null), 12_000);
    return () => window.clearTimeout(timer);
  }, [nudge]);

  const rate = (value: "good" | "not_good") => {
    const fd = new FormData();
    fd.set("rating", value);
    fd.set("path", pathname);
    if (orgId) fd.set("orgId", orgId);
    if (tenantId) fd.set("tenantId", tenantId);
    setRating({ page: info.page, value });
    setReasonSent(false);
    startRating(async () => {
      const r = await ratePage(fd);
      if (r.id) setRating({ page: info.page, value, id: r.id });
    });
  };
  const rated = rating?.page === info.page ? rating : null;
  const followUp = type ? FOLLOW_UP[type] : null;
  const prompt =
    nudge && open
      ? NUDGES[nudge].line
      : state.sentAt
        ? `Anything else on ${info.name}?`
        : info.prompt;

  return (
    <div className="fixed right-4 bottom-4 z-50 flex flex-col items-end gap-3 md:right-6 md:bottom-6">
      {nudge && !open && (
        <div
          role="status"
          className="feedback-pop border-line bg-surface flex w-[290px] max-w-[calc(100vw-32px)] flex-col gap-2 rounded-xl border p-4 shadow-[0_12px_28px_rgba(24,24,27,0.12)]"
        >
          <b className="font-semibold">{NUDGES[nudge].title}</b>
          <span className="text-ink-2 text-sm">{NUDGES[nudge].line}</span>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="primary"
              onClick={() => {
                void markNudge(nudge, "opened");
                setOpen(true);
              }}
            >
              Tell us
            </Button>
            <Button
              type="button"
              variant="quiet"
              onClick={() => {
                void markNudge(nudge, "dismissed");
                setNudge(null);
              }}
            >
              Not now
            </Button>
          </div>
        </div>
      )}

      {open && (
        <section
          aria-labelledby="feedback-title"
          className="border-line bg-surface flex max-h-[calc(100dvh-96px)] w-[400px] max-w-[calc(100vw-32px)] flex-col gap-3 overflow-y-auto rounded-2xl border p-5 shadow-[0_16px_40px_rgba(24,24,27,0.14)]"
        >
          <div className="flex items-center justify-between">
            <h2 id="feedback-title" className="text-base font-semibold">
              Feedback on {info.name}
            </h2>
            <button
              type="button"
              aria-label="Close feedback"
              onClick={() => {
                setOpen(false);
                setNudge(null);
              }}
              className="text-ink-2 hover:bg-subtle inline-flex size-8 items-center justify-center rounded-md"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="text-ink-2 text-sm">How&apos;s this page?</span>
              {(["good", "not_good"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-label={v === "good" ? "Good" : "Not good"}
                  aria-pressed={rated?.value === v}
                  onClick={() => rate(v)}
                  className={cn(
                    "inline-flex size-9 items-center justify-center rounded-full border transition-colors",
                    rated?.value === v
                      ? "border-ink bg-honey-tint"
                      : "border-line-strong hover:bg-subtle",
                  )}
                >
                  {v === "good" ? (
                    <ThumbsUp className="size-4" aria-hidden />
                  ) : (
                    <ThumbsDown className="size-4" aria-hidden />
                  )}
                </button>
              ))}
            </div>
            {rated && !reasonSent && (
              <form
                className="flex gap-2"
                action={async (fd) => {
                  if (!rated.id) return;
                  fd.set("id", rated.id);
                  const r = await addRatingReason(fd);
                  if (r.ok) setReasonSent(true);
                }}
              >
                <input
                  name="reason"
                  aria-label={
                    rated.value === "good" ? "What made it good?" : "What made it not good?"
                  }
                  placeholder={
                    rated.value === "good"
                      ? "Optional: what made it good?"
                      : "Optional: what made it not good?"
                  }
                  maxLength={500}
                  className="field min-h-9 py-1 text-sm"
                />
                <Button type="submit" variant="secondary">
                  Add
                </Button>
              </form>
            )}
            {rated && reasonSent && <span className="text-success text-xs">Thanks, noted.</span>}
          </div>

          {state.sentAt && (
            <p
              role="status"
              className="bg-success-soft text-success flex items-center gap-2 rounded-lg px-3 py-2 text-sm"
            >
              <svg width="24" height="16" viewBox="0 0 24 16" aria-hidden>
                <BeeBody />
              </svg>
              Sent. The team will see it today.
            </p>
          )}

          <form
            ref={form}
            action={(fd) => {
              // The type picked is part of this note; the next one starts without it.
              setType(null);
              action(fd);
            }}
            className="flex flex-col gap-3"
          >
            <input type="hidden" name="path" value={pathname} />
            {orgId && <input type="hidden" name="orgId" value={orgId} />}
            {tenantId && <input type="hidden" name="tenantId" value={tenantId} />}
            {type && <input type="hidden" name="type" value={type} />}
            <textarea
              name="message"
              rows={3}
              required
              maxLength={4000}
              aria-label="Your feedback"
              placeholder={prompt}
              className="field min-h-[84px] resize-y py-2.5"
            />
            <div
              className="flex flex-wrap items-center gap-1.5"
              role="group"
              aria-label="Type (optional)"
            >
              <span className="text-ink-3 text-xs">Optional:</span>
              {FEEDBACK_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  aria-pressed={type === t}
                  onClick={() => setType(type === t ? null : t)}
                  className={cn(
                    "min-h-8 rounded-full border px-3 text-xs",
                    type === t
                      ? "border-ink text-ink border-[1.5px] font-semibold"
                      : "border-line-strong text-ink-2",
                  )}
                >
                  {TYPE_LABEL[t]}
                </button>
              ))}
            </div>
            {followUp && (
              <label className="flex flex-col gap-1.5 text-sm font-semibold">
                {followUp}
                <textarea
                  name="followUp"
                  rows={2}
                  maxLength={2000}
                  className="field min-h-14 resize-y py-2 font-normal"
                />
              </label>
            )}
            {state.error && (
              <p role="alert" className="text-danger text-sm">
                {state.error}
              </p>
            )}
            <div className="flex items-center justify-between gap-2">
              <label className="text-ink-2 flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  name="contactOk"
                  defaultChecked
                  className="accent-[var(--ink)]"
                />
                OK to email me
              </label>
              <Button type="submit" variant="primary" disabled={pending}>
                {pending ? "Sending…" : "Send"}
              </Button>
            </div>
          </form>

          {earlier.length > 0 && (
            <div className="flex flex-col">
              <span className="text-ink-3 text-xs font-semibold">Earlier from you</span>
              <ul className="flex flex-col">
                {earlier.map((e) => (
                  <li
                    key={e.id}
                    className="border-line flex justify-between gap-2 border-t py-1.5 text-sm"
                  >
                    <span className="min-w-0 truncate">{e.line}</span>
                    <span className="text-ink-3 whitespace-nowrap">{ago(e.at, now)}</span>
                  </li>
                ))}
              </ul>
              <Link href="/requests" className="text-sm">
                See all your requests
              </Link>
            </div>
          )}
          <span className="text-ink-3 text-xs">
            We see the page you&apos;re on and your organization, never your messages.
          </span>
        </section>
      )}

      <div className="relative" onMouseEnter={() => setFlyKey((k) => k + 1)}>
        <span key={flyKey} aria-hidden className="feedback-bee">
          <svg width="24" height="16" viewBox="0 0 24 16">
            <BeeBody />
          </svg>
        </span>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => {
            setNow(Date.now());
            setOpen((o) => !o);
          }}
          className="bg-ink text-surface relative min-h-11 rounded-full px-5 text-sm font-semibold shadow-[0_8px_20px_rgba(24,24,27,0.2)]"
        >
          Feedback
        </button>
      </div>
    </div>
  );
}
