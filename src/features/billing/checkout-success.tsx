"use client";

import Link from "next/link";
import { BeeBody } from "@/components/app/bee";
import { BeeDance } from "@/components/app/bee-setup";
import { buttonVariants } from "@/components/ui/button";
import { ConversionTag } from "@/features/ad-tracking/client";
import { platformLabel } from "@/lib/social/platforms";
import { cn } from "cn";
import type { CheckoutSuccess as Confirmed } from "./popup-actions";
import type { PopupContent } from "./popup-copy";
import type { CarryOn } from "./upgrade-popup";

// After checkout (board "Promotions in the app", 4 · After checkout, approved 24 Nov): the bee
// dances once while honeycombs burst out and fade, then the plan, the free month in words (never a date, 26 Nov), what's
// unlocked (the pop-up's own ticks, from the plans), the friend's or banked month when one
// applied, and one primary button: the tapped action carried on, or Go to my Inbox. Reduced
// motion: no burst, no dance, a still bee on three filled honeycombs.

const BURST: { dx: number; dy: number; honey: boolean }[] = [
  { dx: -120, dy: -70, honey: false },
  { dx: -90, dy: -110, honey: true },
  { dx: -30, dy: -125, honey: true },
  { dx: 40, dy: -120, honey: false },
  { dx: 100, dy: -95, honey: true },
  { dx: 130, dy: -40, honey: true },
  { dx: -135, dy: -15, honey: false },
  { dx: 120, dy: 20, honey: true },
  { dx: -110, dy: 40, honey: true },
  { dx: 80, dy: 60, honey: false },
];

function Comb({ honey, size = 14 }: { honey: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12.8" aria-hidden className="shrink-0">
      <path
        d="M6 0.6l5 2.9v5.8L6 12.2 1 9.3V3.5z"
        fill={honey ? "var(--honey)" : "var(--surface)"}
        stroke={honey ? "var(--ink)" : "var(--line-strong)"}
        strokeWidth={honey ? 1 : 1.2}
      />
    </svg>
  );
}

function Celebration() {
  return (
    <div
      aria-hidden
      className="relative grid h-[120px] place-items-center bg-[radial-gradient(circle_at_50%_55%,var(--honey-tint),transparent_70%)]"
    >
      {BURST.map((b, i) => (
        <span
          key={i}
          className="promo-burst"
          style={
            {
              "--dx": `${b.dx}px`,
              "--dy": `${b.dy}px`,
              animationDelay: `${(i * 0.12).toFixed(2)}s`,
            } as React.CSSProperties
          }
        >
          <Comb honey={b.honey} />
        </span>
      ))}
      <span className="relative z-[1] motion-reduce:hidden">
        <BeeDance times={1} scale={0.45} />
      </span>
      <span className="hidden flex-col items-center gap-1 motion-reduce:flex">
        <svg width="48" height="32" viewBox="0 0 24 16">
          <BeeBody flutter={false} />
        </svg>
        <span className="flex gap-1">
          <Comb honey size={16} />
          <Comb honey size={16} />
          <Comb honey size={16} />
        </span>
      </span>
    </div>
  );
}

function SmallBee() {
  return (
    <svg width="16" height="11" viewBox="0 0 24 16" aria-hidden className="mt-1 shrink-0">
      <BeeBody flutter={false} />
    </svg>
  );
}

/** The success moment, once Stripe confirmed the checkout. */
export function CheckoutSuccess({
  content,
  confirmed,
  carryOn,
  onDone,
}: {
  content: PopupContent;
  confirmed: Confirmed;
  carryOn: CarryOn;
  onDone: () => void;
}) {
  // No date in the pop-up (Jason, 26 Nov: "never say it ends on a date"); the day of the first
  // charge stays on Your plan. With a trial, the pop-up's own words: "Your free month has started."
  const started = confirmed.freeUntil
    ? content.reminder
      ? content.success
      : "Your free trial has started."
    : null;
  const inboxClass = carryOn
    ? "text-ink hover:text-ink-2 inline-flex min-h-10 items-center justify-center text-[13px] font-semibold"
    : buttonVariants({ variant: "primary" });
  return (
    <div className="flex flex-col gap-3 sm:mt-2">
      {confirmed.tag && <ConversionTag {...confirmed.tag} />}
      <Celebration />
      <div className="flex flex-col gap-1 text-center">
        <h2
          id="upgrade-title"
          className="font-display m-0 text-[26px] leading-[1.15] font-semibold"
        >
          You’re on {content.planName}
        </h2>
        {started ? (
          <>
            <span className="text-[15px] font-semibold">
              <span className="bg-honey-tint rounded-md px-1.5 py-px">{started}</span>
            </span>
            <span className="text-ink-2 text-[12.5px]">
              Nothing to pay until it ends. Then {content.price}; cancel before it ends and you pay
              nothing.
            </span>
          </>
        ) : (
          <span className="text-ink-2 text-[12.5px]">{content.price}. Cancel any time.</span>
        )}
      </div>
      <div className="border-line flex flex-col gap-[7px] border-t pt-[11px]">
        <span className="text-ink-3 text-[10.5px] font-bold tracking-[0.6px] uppercase">
          Now unlocked
        </span>
        <ul className="m-0 flex list-none flex-col gap-[7px] p-0 text-[13px]">
          {content.ticks.map((t) => (
            <li key={t.bold} className="flex items-start gap-2">
              {t.bee ? (
                <SmallBee />
              ) : (
                <span aria-hidden className="text-success w-4 shrink-0 text-center font-extrabold">
                  ✓
                </span>
              )}
              <span>
                <b>{t.bold}</b>
                {t.rest && <span className="text-ink-2"> · {t.rest}</span>}
              </span>
            </li>
          ))}
        </ul>
      </div>
      {confirmed.lines.map((line) => (
        <p
          key={line}
          className="border-honey-border bg-honey-tint m-0 rounded-xl border px-3 py-2 text-[12.5px]"
        >
          {line}
        </p>
      ))}
      {carryOn?.kind === "connect" && (
        <form action={carryOn.action} className="flex flex-col">
          <input type="hidden" name="platform" value={carryOn.platform} />
          <input type="hidden" name="back" value={carryOn.back} />
          <button type="submit" className={buttonVariants({ variant: "primary" })}>
            Connect {platformLabel(carryOn.platform)}
          </button>
        </form>
      )}
      {carryOn?.kind === "link" && (
        <Link
          href={carryOn.href}
          onClick={onDone}
          className={buttonVariants({ variant: "primary" })}
        >
          {carryOn.label}
        </Link>
      )}
      <Link href="/inbox" onClick={onDone} className={cn(inboxClass)}>
        Go to my Inbox
      </Link>
    </div>
  );
}
