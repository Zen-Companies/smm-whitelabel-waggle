"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";
import { isActive, NAV_ITEMS } from "./nav-items";

/**
 * The top bar's tabs (design.md §4): active = ink fill with white text. A honey count on Inbox
 * while replies wait for the owner's OK. Desktop only; phones use the bottom tabs.
 */
export function TopNav({ inboxCount }: { inboxCount: number }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex items-center gap-0.5">
      {NAV_ITEMS.map((item) => {
        const active = isActive(item, pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-11 shrink-0 items-center gap-1.5 rounded-[10px] px-3.5 text-[15px] font-medium transition-colors duration-150",
              active ? "bg-ink text-page" : "text-ink-2 hover:bg-subtle hover:text-ink",
            )}
          >
            {item.label}
            {item.href === "/inbox" && inboxCount > 0 && (
              <span
                className="bg-honey rounded-full px-2 text-xs font-semibold text-[#17140f]"
                aria-label={`${inboxCount} waiting for your OK`}
              >
                {inboxCount}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
