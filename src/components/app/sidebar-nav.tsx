"use client";

import { BookOpen, Inbox, Megaphone, Receipt, Settings, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";

const ITEMS = [
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/posts", label: "Posts", icon: Megaphone },
  { href: "/leads", label: "Leads", icon: UserRound },
  { href: "/knowledge-base", label: "Business info", icon: BookOpen },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

/** Sidebar nav (docs/design.md §8). Active = lavender + violet-strong; 12px radius, 44px tall. */
export function SidebarNav({ showCosts, inboxCount }: { showCosts: boolean; inboxCount: number }) {
  const pathname = usePathname();
  const items = showCosts
    ? [...ITEMS, { href: "/admin/costs", label: "Costs", icon: Receipt } as const]
    : ITEMS;
  return (
    <nav aria-label="Main" className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
      {items.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-11 shrink-0 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors duration-150",
              active
                ? "bg-lavender text-violet-strong"
                : "hover:text-ink text-gray-700 hover:bg-gray-50",
            )}
          >
            <Icon strokeWidth={1.75} className="size-[18px]" aria-hidden />
            <span>{label}</span>
            {href === "/inbox" && inboxCount > 0 && (
              <span className="meta ml-auto tabular-nums" aria-label={`${inboxCount} waiting`}>
                {inboxCount}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
