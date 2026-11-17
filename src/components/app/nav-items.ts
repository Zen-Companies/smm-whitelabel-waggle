// The app's tabs (design.md §4). Today is the home (T71). Each tab owns its paths: Contacts covers
// /contacts/… (People, Leads, Ad leads, Broadcasts), Teach Waggle /teach/… and Insights
// /insights/… (routes, 16 Nov; src/lib/routes.ts).

export type NavItem = { href: string; label: string; also?: readonly string[] };

export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/today", label: "Today" },
  { href: "/inbox", label: "Inbox" },
  { href: "/contacts", label: "Contacts" },
  { href: "/posts", label: "Posts" },
  { href: "/teach", label: "Teach Waggle" },
  { href: "/insights", label: "Insights" },
];

/** Phone bottom tabs: the daily ones; Posts, Insights and Settings live under More. */
export const BOTTOM_TABS: readonly NavItem[] = [
  { href: "/today", label: "Today" },
  { href: "/inbox", label: "Inbox" },
  { href: "/contacts", label: "Contacts" },
  { href: "/teach", label: "Teach" },
  { href: "/more", label: "More", also: ["/posts", "/insights", "/settings"] },
];

export function isActive(item: NavItem, pathname: string): boolean {
  return [item.href, ...(item.also ?? [])].some(
    (href) => pathname === href || pathname.startsWith(`${href}/`),
  );
}
