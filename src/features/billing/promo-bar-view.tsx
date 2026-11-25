"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Fragment, useState } from "react";
import {
  BAR_COOKIE,
  BAR_COOKIE_MAX_AGE_S,
  barHiddenValue,
  type ActiveBar,
  type BarLine,
} from "./promotions";
import { promoBarHref } from "./banners";

// The moving bar above the navbar (board "Promotions in the app", 1 · Top bar, approved 24 Nov).
// Walter's website strip: black, honey label, cream text drifting slowly left. Tapping it opens
// the plan pop-up in place (an Owner on Free), or Your plan when the pop-up doesn't apply. × hides it for the rest of the viewer's day (a cookie the server
// reads, so it never flashes back in). Reduced motion: still, one line cut with ….

function Sep() {
  return (
    <span aria-hidden className="text-honey px-3.5 opacity-55">
      ⬢
    </span>
  );
}

function Lines({ label, lines }: { label: string; lines: BarLine[] }) {
  return (
    <>
      <b className="text-honey text-[11px] tracking-[2px] whitespace-nowrap uppercase">{label}</b>
      {lines.map((l, i) => (
        <Fragment key={i}>
          <Sep />
          <span className="whitespace-nowrap">
            {l.text}
            {l.honey && <span className="text-honey">{l.honey}</span>}
          </span>
        </Fragment>
      ))}
      <Sep />
    </>
  );
}

function plain(label: string, lines: BarLine[]): string {
  return [label, ...lines.map((l) => `${l.text}${l.honey ?? ""}`)].join(" · ");
}

export function PromoBarView({
  bar,
  timeZone,
  popup,
}: {
  bar: ActiveBar;
  timeZone: string;
  /** The upgrade pop-up opens for this viewer (an Owner on Free); otherwise Your plan. */
  popup: boolean;
}) {
  const [hidden, setHidden] = useState(false);
  const path = usePathname();
  const params = useSearchParams();
  if (hidden) return null;
  const q = params.toString();
  const href = promoBarHref({ link: bar.link, here: q ? `${path}?${q}` : path, popup });
  const { label, lines, phoneLines, cta, phoneCta } = bar.copy;
  const hide = () => {
    try {
      const secure = window.location.protocol === "https:" ? "; Secure" : "";
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || timeZone;
      document.cookie = `${BAR_COOKIE}=${encodeURIComponent(
        barHiddenValue(bar.promotionId, new Date(), zone),
      )}; Max-Age=${BAR_COOKIE_MAX_AGE_S}; Path=/; SameSite=Lax${secure}`;
    } catch {
      // Blocked cookies: it just shows again on the next page.
    }
    setHidden(true);
  };
  return (
    <div
      role="region"
      aria-label={label}
      className="flex items-center gap-3 bg-[#0d0b08] py-[9px] pr-2.5 pl-3.5 text-[13px] font-medium text-[#fff6e6] sm:pr-3.5"
    >
      <Link
        href={href}
        scroll={false}
        aria-label={`${plain(label, lines)}. ${cta.replace(/\s*→$/, "")}`}
        className="flex min-w-0 flex-1 items-center gap-3"
      >
        <span className="promo-fade min-w-0 flex-1 overflow-hidden">
          {/* Computer */}
          <span aria-hidden className="promo-marquee hidden motion-reduce:!hidden sm:flex">
            <Lines label={label} lines={lines} />
            <Lines label={label} lines={lines} />
          </span>
          {/* Phone: shorter lines */}
          <span aria-hidden className="promo-marquee flex motion-reduce:!hidden sm:!hidden">
            <Lines label={label} lines={phoneLines} />
            <Lines label={label} lines={phoneLines} />
          </span>
          {/* Reduced motion: still, one line */}
          <span aria-hidden className="hidden truncate motion-reduce:block">
            <b className="text-honey text-[11px] tracking-[2px] uppercase">{label}</b>
            <span className="text-honey px-2 opacity-55">⬢</span>
            <span className="max-sm:hidden">
              {lines
                .slice(0, 2)
                .map((l) => `${l.text}${l.honey ?? ""}`)
                .join(" ⬢ ")}
            </span>
            <span className="sm:hidden">
              {phoneLines.map((l) => `${l.text}${l.honey ?? ""}`).join(" ⬢ ")}
            </span>
          </span>
        </span>
        <span aria-hidden className="text-honey shrink-0 font-bold whitespace-nowrap">
          <span className="max-sm:hidden">{cta}</span>
          <span className="sm:hidden">{phoneCta}</span>
        </span>
      </Link>
      <button
        type="button"
        onClick={hide}
        aria-label="Hide for today"
        title="Hide for today"
        className="grid size-8 shrink-0 place-items-center rounded-full text-[#d9ccb0] hover:text-[#fff6e6]"
      >
        <span className="grid size-[22px] place-items-center rounded-full border border-[rgba(217,204,176,0.3)]">
          <X className="size-3" aria-hidden />
        </span>
      </button>
    </div>
  );
}
