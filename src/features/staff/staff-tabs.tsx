"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";

/** The staff pages' tabs; active = ink with a honey underline (design v3 "Staff pages"). */
export function StaffTabs({ pages }: { pages: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Staff" className="-mx-1 flex overflow-x-auto">
      {pages.map(({ href, label }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-10 shrink-0 items-center px-3 text-sm transition-colors duration-150",
              active
                ? "text-ink font-semibold shadow-[inset_0_-2px_0_var(--honey)]"
                : "text-ink-2 hover:text-ink",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
