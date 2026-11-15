// The app's tabs (design.md §4). Today is the home (T71); Teach Waggle and Insights keep their old
// paths until their pages are redesigned (T73, T74). Contacts covers /contacts and /leads (T78).

export type NavItem = { href: string; label: string; also?: readonly string[] };

export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/today", label: "Today" },
  { href: "/inbox", label: "Inbox" },
  { href: "/contacts", label: "Contacts", also: ["/leads"] },
  { href: "/posts", label: "Posts" },
  { href: "/teach", label: "Teach Waggle", also: ["/knowledge-base", "/lab", "/automations"] },
  { href: "/analytics", label: "Insights" },
];

/** Phone bottom tabs: the daily ones; Posts, Insights and Settings live under More. */
export const BOTTOM_TABS: readonly NavItem[] = [
  { href: "/today", label: "Today" },
  { href: "/inbox", label: "Inbox" },
  { href: "/contacts", label: "Contacts", also: ["/leads"] },
  { href: "/teach", label: "Teach", also: ["/knowledge-base", "/lab", "/automations"] },
  { href: "/more", label: "More", also: ["/posts", "/analytics", "/settings"] },
];

export function isActive(item: NavItem, pathname: string): boolean {
  return [item.href, ...(item.also ?? [])].some(
    (href) => pathname === href || pathname.startsWith(`${href}/`),
  );
}
