import Link from "next/link";
import { Suspense } from "react";
import { AccountsCard, ConnectedCount } from "@/features/accounts";
import { NotificationSettings } from "@/features/alerts";
import { AutonomyCard } from "@/features/approvals";
import { AssistantsCard } from "@/features/mcp";
import { listMyOrgs, OrgBillingSection, OrgGeneralSection, TeamSection } from "@/features/orgs";
import { BusinessSettings, getCurrentTenant } from "@/features/tenants";
import { cn } from "cn";

export const metadata = { title: "Settings" };

// Design v2: sections, not one long scroll. T54–T57 (design v3 "Organizations"): two groups,
// the organization's (general, team, billing) and the open brand's.
const ORG_SECTIONS = [
  { key: "general", label: "General" },
  { key: "team", label: "Team" },
  { key: "billing", label: "Billing" },
] as const;
const BRAND_SECTIONS = [
  { key: "accounts", label: "Accounts" },
  { key: "replies", label: "Replies" },
  { key: "notifications", label: "Notifications" },
  { key: "business", label: "Business" },
  // MCP (docs/mcp/PLAN.md §4.2): per login, not per brand.
  { key: "ai-assistants", label: "AI assistants" },
] as const;
type Section = (typeof ORG_SECTIONS)[number]["key"] | (typeof BRAND_SECTIONS)[number]["key"];
const ALL: readonly Section[] = [...ORG_SECTIONS, ...BRAND_SECTIONS].map((s) => s.key);

function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-11 items-center justify-between rounded-md px-3 text-sm font-medium",
        active ? "bg-subtle text-honey-text" : "text-ink-2 hover:bg-subtle",
      )}
    >
      {children}
    </Link>
  );
}

async function Body({ searchParams }: PageProps<"/settings">) {
  const params = await searchParams;
  const section: Section = ALL.find((s) => s === params.section) ?? "accounts";
  const [tenant, orgs] = await Promise.all([getCurrentTenant(), listMyOrgs()]);
  const org = orgs.find((o) => o.id === tenant.organizationId);
  return (
    <div className="flex flex-col gap-6 md:flex-row md:items-start">
      <nav aria-label="Settings sections" className="flex flex-col gap-0.5 md:w-56 md:shrink-0">
        <span className="text-ink-4 truncate px-3 pt-1 pb-1 text-xs">
          Organization · {org?.name}
        </span>
        {ORG_SECTIONS.map((s) => (
          <NavLink key={s.key} href={`/settings?section=${s.key}`} active={s.key === section}>
            {s.label}
          </NavLink>
        ))}
        <span className="text-ink-4 truncate px-3 pt-4 pb-1 text-xs">Brand · {tenant.name}</span>
        {BRAND_SECTIONS.map((s) => (
          <NavLink key={s.key} href={`/settings?section=${s.key}`} active={s.key === section}>
            {s.label}
            {s.key === "accounts" && <ConnectedCount />}
          </NavLink>
        ))}
      </nav>
      <div className="min-w-0 flex-1">
        {section === "general" && <OrgGeneralSection orgId={tenant.organizationId} />}
        {section === "team" && <TeamSection orgId={tenant.organizationId} />}
        {section === "billing" && <OrgBillingSection orgId={tenant.organizationId} />}
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
