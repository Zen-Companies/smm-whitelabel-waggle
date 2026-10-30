"use client";

import { useState } from "react";

/** "Copy number" → "Copied" for 2 seconds, in place (no toasts, design.md §4). */
export function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="border-banner-border bg-banner text-honey-light min-h-11 rounded-md border px-4 text-sm font-medium"
    >
      {copied ? "Copied" : label}
    </button>
  );
}
