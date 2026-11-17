import Link from "next/link";

/**
 * A page's parts as tabs under its title (design.md §4 "Beyond text", rule 2, approved 16 Nov):
 * places are tabs, never a row of underlined links. Uses the `.tabs` style of the Inbox.
 */
export function SectionTabs({
  label,
  items,
  active,
}: {
  label: string;
  items: readonly { key: string; href: string; label: string }[];
  active: string;
}) {
  return (
    <nav aria-label={label} className="tabs">
      {items.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          data-active={t.key === active || undefined}
          aria-current={t.key === active ? "page" : undefined}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
