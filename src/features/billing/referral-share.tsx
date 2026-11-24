"use client";

import { useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";

const noSubscribe = () => () => {};

const SHARE_TEXT =
  "I use Waggle to answer my DMs and comments. Your first month is free with my link:";

/**
 * The owner's referral link, one tap to copy or share (phones open the share sheet: Messages,
 * WhatsApp, Instagram). Feedback in place, no toasts (design.md §4).
 */
export function ReferralShare({ link }: { link: string }) {
  const [copied, setCopied] = useState<"yes" | "no" | null>(null);
  // Phones have a share sheet; computers usually don't. False on the server, so nothing jumps.
  const canShare = useSyncExternalStore(
    noSubscribe,
    () => typeof navigator.share === "function",
    () => false,
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied("yes");
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied("no");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          readOnly
          value={link}
          aria-label="Your link"
          onFocus={(e) => e.currentTarget.select()}
          className="field min-w-[220px] flex-1 font-mono text-sm"
        />
        <Button type="button" variant="primary" onClick={copy}>
          {copied === "yes" ? "Copied" : "Copy link"}
        </Button>
        {canShare && (
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              navigator.share({ title: "Waggle", text: SHARE_TEXT, url: link }).catch(() => {});
            }}
          >
            Share
          </Button>
        )}
      </div>
      {copied === "no" && (
        <p role="alert" className="text-danger text-sm">
          Couldn’t copy here. Press and hold the link to copy it.
        </p>
      )}
    </div>
  );
}
