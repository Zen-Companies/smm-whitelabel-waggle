"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { upgradeHref, type OfferReason } from "./upgrade";

/**
 * A link that opens the upgrade pop-up over the page it's on (pop-ups plan, 23 Nov: "opens on
 * the current page", never a trip to Your plan). `extra` adds what the pop-up names: the platform
 * tapped, a topic.
 */
export function UpgradeLink({
  reason,
  extra,
  className,
  children,
}: {
  reason: OfferReason;
  extra?: Record<string, string>;
  className?: string;
  children: React.ReactNode;
}) {
  const path = usePathname();
  const params = useSearchParams();
  const q = params.toString();
  return (
    <Link
      href={upgradeHref(reason, q ? `${path}?${q}` : path, extra)}
      scroll={false}
      className={className}
    >
      {children}
    </Link>
  );
}
