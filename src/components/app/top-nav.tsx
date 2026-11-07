"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";

const ITEMS = [
  { href: "/inbox", label: "Inbox" },
  { href: "/posts", label: "Posts" },
  { href: "/analytics", label: "Analytics" },
  { href: "/leads", label: "Leads" },
  { href: "/knowledge-base", label: "Business info" },
  { href: "/lab", label: "Lab" },
  { href: "/settings", label: "Settings" },
] as const;

/**
 * The top bar's links (docs/design.md §4): active = ink text with a 2px ink underline. A honey dot
 * on Inbox while replies wait for approval. Scrolls sideways on phones.
 */
export function TopNav({
  staffHref,
  inboxCount,
}: {
  /** The first staff page the signed-in user's role may open (features/staff), or none. */
  staffHref: string | null;
  inboxCount: number;
}) {
  const pathname = usePathname();
  const items: { href: string; label: string }[] = [
    ...ITEMS,
    ...(staffHref ? [{ href: staffHref, label: "Staff" }] : []),
  ];
  return (
    <nav aria-label="Main" className="-mx-1 flex self-stretch overflow-x-auto">
      {items.map(({ href, label }) => {
        const active =
          href === staffHref
            ? pathname.startsWith("/admin/")
            : pathname === href || pathname.startsWith(`${href}/`);
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
