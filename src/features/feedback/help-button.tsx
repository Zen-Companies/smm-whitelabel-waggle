"use client";

import { OPEN_FEEDBACK_EVENT } from "./widget";

/** "Need help?" that opens the Help & feedback panel where you are, instead of another page. */
export function HelpButton({ className, children }: { className?: string; children: string }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_FEEDBACK_EVENT))}
      className={className}
    >
      {children}
    </button>
  );
}
