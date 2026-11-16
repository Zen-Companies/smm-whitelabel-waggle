"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useRef } from "react";

/**
 * A panel that slides in from the right over the page (Posts composer, approved 16 Nov, option
 * A; Automations, Teach Waggle approved 16 Nov). Either it belongs to an address (`closeHref`:
 * open while the URL says so) or to a button (`onClose`: open while the page's state says so).
 * Close, Escape or a click outside close it. It scrolls on its own.
 */
export function SidePanel({
  label,
  closeHref,
  onClose,
  children,
}: {
  label: string;
  closeHref?: string;
  onClose?: () => void;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const panel = useRef<HTMLElement>(null);
  const close = () => {
    if (onClose) onClose();
    else if (closeHref) router.push(closeHref, { scroll: false });
  };
  // Escape reads the latest props without re-adding the listener.
  const onEscape = useEffectEvent(close);

  useEffect(() => {
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onEscape();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const backdrop = "side-panel-backdrop bg-ink/20 fixed inset-0 z-[60]";
  return (
    <>
      {closeHref && !onClose ? (
        <Link href={closeHref} scroll={false} tabIndex={-1} aria-hidden className={backdrop} />
      ) : (
        <div aria-hidden className={backdrop} onClick={close} />
      )}
      <aside
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className="side-panel bg-page fixed inset-y-0 right-0 z-[70] flex w-full max-w-[480px] flex-col shadow-[-18px_0_40px_rgba(23,20,15,0.16)] outline-none"
      >
        <div className="border-line bg-surface flex min-h-16 items-center gap-3 border-b px-5">
          <h2 className="section-title min-w-0 flex-1 truncate">{label}</h2>
          {closeHref && !onClose ? (
            <Link href={closeHref} scroll={false} className="action-link">
              Close
            </Link>
          ) : (
            <button type="button" onClick={close} className="action-link">
              Close
            </button>
          )}
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5">{children}</div>
      </aside>
    </>
  );
}
