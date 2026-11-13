import Link from "next/link";

const TABS = [
  { href: "/contacts", label: "People" },
  { href: "/leads", label: "Leads" },
  { href: "/contacts/broadcasts", label: "Broadcasts" },
] as const;

/** Contacts' sections (design "Contacts"): people, leads, broadcasts; lead forms join next. */
export function ContactsTabs({ active }: { active: (typeof TABS)[number]["href"] }) {
  return (
    <nav aria-label="Contacts sections" className="tabs">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} aria-current={t.href === active ? "page" : undefined}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
