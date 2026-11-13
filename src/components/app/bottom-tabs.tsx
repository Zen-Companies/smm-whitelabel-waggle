"use client";

import { BookOpen, Inbox, MoreHorizontal, Users, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";
import { BOTTOM_TABS, isActive } from "./nav-items";

const ICONS: Record<string, LucideIcon> = {
  Inbox,
  Contacts: Users,
  Teach: BookOpen,
  More: MoreHorizontal,
};

/** Phone bottom tabs (design.md §4), within thumb reach. Hidden from md up. */
export function BottomTabs({ inboxCount }: { inboxCount: number }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main"
      className="border-line bg-surface fixed inset-x-0 bottom-0 z-40 flex border-t pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {BOTTOM_TABS.map((item) => {
        const Icon = ICONS[item.label] ?? MoreHorizontal;
        const active = isActive(item, pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold",
              active ? "text-ink" : "text-ink-3",
            )}
          >
            <Icon className="size-[22px]" strokeWidth={active ? 2.2 : 1.8} aria-hidden />
            {item.label}
            {item.href === "/inbox" && inboxCount > 0 && (
              <span className="bg-honey absolute top-1.5 left-[calc(50%+6px)] rounded-full px-1.5 text-[10px] leading-4 font-bold text-[#17140f]">
                {inboxCount}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
