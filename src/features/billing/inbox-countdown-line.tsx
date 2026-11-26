"use client";

import { Clock } from "lucide-react";
import Link from "next/link";
import { cn } from "cn";
import { countdownOf, endOfLocalDay, inboxCountdown, type OpenDm } from "./dm-countdown";
import { useMinute } from "./use-minute";

/**
 * The DM countdown above the Inbox list (Playbook round 2, 26 Nov): "2 DMs close today. Worker
 * Bee would answer them now. Try Solo free" on Free (opens the Try Solo pop-up), "2 DMs close
 * today · 3 h left on the first" otherwise. Worked out on screen each minute; hidden when none.
 */
export function InboxCountdownLine({
  dms,
  offer,
}: {
  dms: OpenDm[];
  /** Free and can upgrade: the way to Worker Bee. */
  offer: { href: string; label: string } | null;
}) {
  const now = useMinute();
  const c = now ? countdownOf(dms, now, endOfLocalDay(now)) : null;
  if (!c) return null;
  return (
    <p
      className={cn(
        "m-0 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-lg border px-3 py-2 text-[13px]",
        c.urgent ? "border-danger-border bg-danger-soft text-danger" : "border-honey bg-honey-tint",
      )}
    >
      <Clock className="size-3.5 shrink-0" aria-hidden />
      <span>{inboxCountdown(c, !!offer)}</span>
      {offer && (
        <Link href={offer.href} className="font-semibold underline">
          {offer.label}
        </Link>
      )}
    </p>
  );
}
