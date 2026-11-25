"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { upgradeHref, type OfferReason } from "./upgrade";

/**
 * A link that opens the upgrade pop-up over the page it's on (pop-ups plan, 23 Nov: "opens on
 * the current page", never a trip to Your plan). `extra` adds what the pop-up names: the platform
 * tapped, a topic. `instant` opens it straight from the address in the browser (Next keeps
 * useSearchParams in sync) instead of a server round trip that re-renders the page first, as the
 * promo bar does (QA 25 Nov).
 */
export function UpgradeLink({
  reason,
  extra,
  className,
  instant = false,
  "aria-label": ariaLabel,
  children,
}: {
  reason: OfferReason;
  extra?: Record<string, string>;
  className?: string;
  instant?: boolean;
  "aria-label"?: string;
  children: React.ReactNode;
}) {
  const path = usePathname();
  const params = useSearchParams();
  const q = params.toString();
  const href = upgradeHref(reason, q ? `${path}?${q}` : path, extra);
  return (
    <Link
      href={href}
      scroll={false}
      aria-label={ariaLabel}
      onClick={
        instant
          ? (e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
              e.preventDefault();
              window.history.pushState(null, "", href);
            }
          : undefined
      }
      className={className}
    >
      {children}
    </Link>
  );
}
