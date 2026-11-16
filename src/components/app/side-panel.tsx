"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * A panel that slides in from the right over the page (Posts composer, approved 16 Nov, option
 * A). It belongs to an address: open while the page's URL says so, closed by Close, Escape or a
 * click outside, all of which go to `closeHref`. It scrolls on its own.
 */
export function SidePanel({
  label,
  closeHref,
  children,
}: {
  label: string;
  closeHref: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const panel = useRef<HTMLElement>(null);

  useEffect(() => {
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") router.push(closeHref, { scroll: false });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeHref, router]);

  return (
    <>
      <Link
        href={closeHref}
        scroll={false}
        tabIndex={-1}
        aria-hidden
        className="side-panel-backdrop bg-ink/20 fixed inset-0 z-[60]"
      />
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
          <Link href={closeHref} scroll={false} className="action-link">
            Close
          </Link>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5">{children}</div>
      </aside>
    </>
  );
}
