"use client";

import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

/**
 * New post and Edit post as one big window (Posts Round 3, approved 25 Nov): centred over the
 * dimmed calendar on a computer, the whole screen on a phone. × or Escape closes it, asking
 * "Discard changes?" in place first when something was typed. Focus stays inside while it's
 * open and goes back where it was after.
 */
export function ComposeModal({
  title,
  subtitle,
  closeHref,
  dirty,
  holdEscape = false,
  children,
}: {
  title: string;
  subtitle?: string;
  closeHref: string;
  /** Something was typed or picked: closing asks first. */
  dirty: boolean;
  /** A sheet on top (crop, picker) takes Escape. */
  holdEscape?: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const box = useRef<HTMLDivElement>(null);
  const [asking, setAsking] = useState(false);
  const keep = useRef<HTMLButtonElement>(null);
  const close = () => router.push(closeHref, { scroll: false });
  const tryClose = () => (dirty ? setAsking(true) : close());
  const onEscape = useEffectEvent(() => {
    if (holdEscape) return;
    if (asking) setAsking(false);
    else tryClose();
  });

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // The first field, so typing can start right away.
    (box.current?.querySelector<HTMLElement>("textarea") ?? box.current)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) onEscape();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      if (before?.isConnected) before.focus();
    };
  }, []);

  useEffect(() => {
    if (asking) keep.current?.focus();
  }, [asking]);

  return (
    <>
      <div
        aria-hidden
        className="side-panel-backdrop bg-ink/35 fixed inset-0 z-[60]"
        onClick={tryClose}
      />
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-labelledby="compose-title"
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key !== "Tab" || !box.current) return;
          // Keep keyboard focus inside the window.
          const items = [...box.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
            (el) => el.offsetParent !== null || el === document.activeElement,
          );
          if (!items.length) return;
          const first = items[0];
          const last = items[items.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }}
        className="compose-modal bg-page fixed inset-0 z-[70] flex flex-col overflow-hidden shadow-[0_12px_32px_rgba(23,20,15,0.14)] outline-none sm:inset-4 sm:rounded-[18px] lg:inset-x-[max(24px,calc((100vw-1240px)/2))] lg:inset-y-6"
      >
        <header className="border-line bg-surface flex min-h-16 shrink-0 items-center gap-3 border-b px-5">
          <div className="flex min-w-0 flex-1 flex-col">
            <h2 id="compose-title" className="section-title truncate">
              {title}
            </h2>
            {subtitle && <span className="meta truncate">{subtitle}</span>}
          </div>
          <button
            type="button"
            onClick={tryClose}
            aria-label="Close"
            className="hover:bg-subtle flex size-11 items-center justify-center rounded-md"
          >
            <X className="size-5" strokeWidth={1.75} aria-hidden />
          </button>
        </header>
        {asking && (
          <div
            role="alertdialog"
            aria-labelledby="discard-title"
            className="border-honey-border bg-honey-tint flex shrink-0 flex-wrap items-center gap-3 border-b px-5 py-3 text-sm"
          >
            <span className="min-w-[200px] flex-1">
              <b id="discard-title" className="font-semibold">
                Discard changes?
              </b>{" "}
              What you typed and picked here is lost.
            </span>
            <Button type="button" variant="primary" onClick={close}>
              Discard
            </Button>
            <Button ref={keep} type="button" variant="quiet" onClick={() => setAsking(false)}>
              Keep editing
            </Button>
          </div>
        )}
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </div>
    </>
  );
}
