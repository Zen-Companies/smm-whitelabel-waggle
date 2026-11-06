import Link from "next/link";
import { Suspense } from "react";
import { AccountsCard, ConnectedCount } from "@/features/accounts";
import { NotificationSettings } from "@/features/alerts";
import { AutonomyCard } from "@/features/approvals";
import { AssistantsCard } from "@/features/mcp";
import { BusinessSettings } from "@/features/tenants";
import { cn } from "cn";

export const metadata = { title: "Settings" };

// Design v2: sections, not one long scroll. Settings are visited for one thing at a time.
const SECTIONS = [
  { key: "accounts", label: "Accounts" },
  { key: "replies", label: "Replies" },
  { key: "notifications", label: "Notifications" },
  { key: "business", label: "Business" },
  // MCP (docs/mcp/PLAN.md §4.2): per login, not per brand.
  { key: "ai-assistants", label: "AI assistants" },
] as const;
type Section = (typeof SECTIONS)[number]["key"];

async function Body({ searchParams }: PageProps<"/settings">) {
  const params = await searchParams;
  const section: Section = SECTIONS.find((s) => s.key === params.section)?.key ?? "accounts";
  return (
    <div className="flex flex-col gap-6 md:flex-row md:items-start">
      <nav aria-label="Settings sections" className="flex flex-col gap-0.5 md:w-56 md:shrink-0">
        {SECTIONS.map((s) => (
          <Link
            key={s.key}
            href={`/settings?section=${s.key}`}
            aria-current={s.key === section ? "page" : undefined}
            className={cn(
              "flex min-h-11 items-center justify-between rounded-md px-3 text-sm font-medium",
              s.key === section ? "bg-subtle text-honey-text" : "text-ink-2 hover:bg-subtle",
            )}
          >
            {s.label}
            {s.key === "accounts" && <ConnectedCount />}
          </Link>
        ))}
      </nav>
      <div className="min-w-0 flex-1">
        {section === "accounts" && <AccountsCard searchParams={searchParams} />}
        {section === "replies" && <AutonomyCard />}
        {section === "notifications" && <NotificationSettings />}
        {section === "business" && <BusinessSettings />}
        {section === "ai-assistants" && <AssistantsCard />}
      </div>
    </div>
  );
}

export default function SettingsPage(props: PageProps<"/settings">) {
  return (
    <main className="mx-auto flex w-full max-w-[1240px] flex-col gap-5 px-4 py-6 md:px-8">
      <h1 className="page-title">Settings</h1>
      <Suspense fallback={<div className="skeleton h-96 rounded-xl" />}>
        <Body {...props} />
      </Suspense>
    </main>
  );
}
