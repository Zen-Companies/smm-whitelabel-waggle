"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";

const ITEMS = [
  { href: "/inbox", label: "Inbox" },
  { href: "/posts", label: "Posts" },
  { href: "/leads", label: "Leads" },
  { href: "/knowledge-base", label: "Business info" },
  { href: "/lab", label: "Lab" },
  { href: "/settings", label: "Settings" },
] as const;

/**
 * The top bar's links (docs/design.md §4): active = ink text with a 2px ink underline. A honey dot
 * on Inbox while replies wait for approval. Scrolls sideways on phones.
 */
export function TopNav({ showAdmin, inboxCount }: { showAdmin: boolean; inboxCount: number }) {
  const pathname = usePathname();
  // Admin pages only for the operator role (T34).
  const items: { href: string; label: string }[] = showAdmin
    ? [
        ...ITEMS,
        { href: "/admin/lab", label: "Admin lab" },
        { href: "/admin/costs", label: "Costs" },
      ]
    : [...ITEMS];
  return (
    <nav aria-label="Main" className="-mx-1 flex self-stretch overflow-x-auto">
      {items.map(({ href, label }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-11 shrink-0 items-center gap-1.5 px-3 text-sm transition-colors duration-150",
              active
                ? "text-ink font-semibold shadow-[inset_0_-2px_0_var(--ink)]"
                : "text-ink-2 hover:text-ink",
            )}
          >
            {label}
            {href === "/inbox" && inboxCount > 0 && (
              <span
                className="bg-honey size-1.5 rounded-full"
                aria-label={`${inboxCount} waiting for your OK`}
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
