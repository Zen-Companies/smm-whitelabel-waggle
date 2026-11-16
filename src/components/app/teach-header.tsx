"use client";

import { usePathname } from "next/navigation";
import { SectionTabs } from "./section-tabs";

const TABS = [
  { key: "/teach", href: "/teach", label: "Overview" },
  { key: "/knowledge-base", href: "/knowledge-base", label: "Business info" },
  { key: "/automations", href: "/automations", label: "Automations" },
  { key: "/lab", href: "/lab", label: "Lab" },
] as const;

/**
 * The top of every Teach Waggle part (design.md §4 "Beyond text", rule 2): the title, one line,
 * and the parts as tabs instead of "← Teach Waggle" and underlined links.
 */
export function TeachHeader({ line }: { line?: string }) {
  const pathname = usePathname();
  const active =
    TABS.find((t) => pathname === t.key || pathname.startsWith(`${t.key}/`))?.key ?? "/teach";
  return (
    <header className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h1 className="page-title">Teach Waggle</h1>
        <p className="text-ink-2">
          {line ??
            "Waggle only says what you write here. If a customer asks something else, it comes to you."}
        </p>
      </div>
      <SectionTabs label="Teach Waggle" items={TABS} active={active} />
    </header>
  );
}
