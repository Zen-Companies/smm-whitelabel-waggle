"use client";

import { usePathname } from "next/navigation";
import { SectionTabs } from "./section-tabs";

const TABS = [
  { key: "/teach", href: "/teach", label: "Overview" },
  { key: "/teach/business-info", href: "/teach/business-info", label: "Business info" },
  { key: "/teach/automations", href: "/teach/automations", label: "Automations" },
  { key: "/teach/lab", href: "/teach/lab", label: "Lab" },
] as const;

/** Pure: the tab for a path. Overview only on /teach itself; the parts own their sub-paths. */
export function teachTab(pathname: string): (typeof TABS)[number]["key"] {
  return (
    TABS.find((t) => t.key !== "/teach" && (pathname === t.key || pathname.startsWith(`${t.key}/`)))
      ?.key ?? "/teach"
  );
}

/**
 * The top of every Teach Waggle part (design.md §4 "Beyond text", rule 2): the title, one line,
 * and the parts as tabs instead of "← Teach Waggle" and underlined links. `children` sits under the
 * tabs on every part (the "Get Waggle ready" line until setup is done).
 */
export function TeachHeader({ line, children }: { line?: string; children?: React.ReactNode }) {
  const active = teachTab(usePathname());
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
      {children}
    </header>
  );
}
