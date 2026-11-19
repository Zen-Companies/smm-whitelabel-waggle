"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

/**
 * Before Connect inside Instagram's or Facebook's own browser (board edge case #1, approved
 * 20 Nov), where signing in with Meta often stops halfway: open Waggle in the real browser.
 * "Try here anyway" shows the Connect buttons in place.
 */
export function InAppGate({ app, children }: { app: string; children: ReactNode }) {
  const [anyway, setAnyway] = useState(false);
  const [copied, setCopied] = useState<"yes" | "no" | null>(null);
  if (anyway) return <>{children}</>;
  return (
    <div className="border-honey-border bg-honey-tint rounded-xl border p-5">
      <h2 className="section-title">Open Waggle in your browser to connect</h2>
      <p className="text-ink-2 mt-1 text-sm">
        You’re inside {app}’s browser, where signing in with Meta often stops halfway. It takes 10
        seconds:
      </p>
      <ol className="text-ink-2 mt-2 list-decimal space-y-1 pl-5 text-sm">
        <li>Tap ••• at the top right.</li>
        <li>Tap Open in browser.</li>
        <li>Tap Connect there.</li>
      </ol>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="primary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(window.location.href);
              setCopied("yes");
              setTimeout(() => setCopied(null), 2000);
            } catch {
              setCopied("no");
            }
          }}
        >
          {copied === "yes" ? "Copied" : "Copy link"}
        </Button>
        <button type="button" onClick={() => setAnyway(true)} className="action-link">
          Try here anyway
        </button>
      </div>
      {copied === "no" && (
        <p role="alert" className="text-danger mt-2 text-sm">
          Couldn’t copy here. Use ••• → Open in browser instead.
        </p>
      )}
    </div>
  );
}
