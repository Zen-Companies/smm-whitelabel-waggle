// The app's tabs (design.md §4). Today joins with T71; the routes keep their old paths until
// their pages are redesigned (Contacts T78, Teach Waggle T73, Insights T74).

export type NavItem = { href: string; label: string; also?: readonly string[] };

export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/inbox", label: "Inbox" },
  { href: "/leads", label: "Contacts" },
  { href: "/posts", label: "Posts" },
  { href: "/knowledge-base", label: "Teach Waggle", also: ["/lab", "/automations"] },
  { href: "/analytics", label: "Insights" },
];

/** Phone bottom tabs: the daily ones; Posts, Insights and Settings live under More. */
export const BOTTOM_TABS: readonly NavItem[] = [
  { href: "/inbox", label: "Inbox" },
  { href: "/leads", label: "Contacts" },
  { href: "/knowledge-base", label: "Teach", also: ["/lab", "/automations"] },
  { href: "/more", label: "More", also: ["/posts", "/analytics", "/settings"] },
];

export function isActive(item: NavItem, pathname: string): boolean {
  return [item.href, ...(item.also ?? [])].some(
    (href) => pathname === href || pathname.startsWith(`${href}/`),
  );
}
