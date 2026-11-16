import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { AccountSection } from "@/features/account";
import { OrgBillingSection, OrgGeneralSection, TeamSection } from "@/features/orgs";
import { getOpenOrg } from "@/features/tenants";
import { DEFAULT_ORG_SETTINGS_SECTION, isOrgSettingsSection, orgSettingsHref } from "@/lib/routes";
import { cn } from "cn";

const SECTIONS = [
  { key: "account", label: "Account" },
  { key: "general", label: "General" },
  { key: "team", label: "Team" },
  { key: "billing", label: "Billing" },
] as const;
type Section = (typeof SECTIONS)[number]["key"];

// Plain props type: the generated route types need `next typegen`.
export type OrgSettingsProps = { params?: Promise<{ section?: string }> };

async function Body({ params }: OrgSettingsProps) {
  const [{ section: raw } = {}, org] = await Promise.all([params, getOpenOrg()]);
  if (!org) redirect("/welcome");
  if (raw !== undefined && !isOrgSettingsSection(raw)) notFound();
  const section: Section = raw ?? DEFAULT_ORG_SETTINGS_SECTION;
  return (
    <div className="flex flex-col gap-6 md:flex-row md:items-start">
      <nav aria-label="Organization settings" className="flex flex-col gap-0.5 md:w-56 md:shrink-0">
        <span className="text-ink-4 truncate px-3 pt-1 pb-1 text-xs">
          Organization · {org.name}
        </span>
        {SECTIONS.map((s) => (
          <Link
            key={s.key}
            href={orgSettingsHref(s.key)}
            aria-current={s.key === section ? "page" : undefined}
            className={cn(
              "flex min-h-11 items-center rounded-md px-3 text-sm font-medium",
              s.key === section ? "bg-subtle text-honey-text" : "text-ink-2 hover:bg-subtle",
            )}
          >
            {s.label}
          </Link>
        ))}
        <Link
          href="/welcome"
          className="text-ink-2 hover:bg-subtle mt-4 flex min-h-11 items-center rounded-md px-3 text-sm"
        >
          ← Add a brand
        </Link>
      </nav>
      <div className="min-w-0 flex-1">
        {section === "account" && <AccountSection />}
        {section === "general" && <OrgGeneralSection orgId={org.id} />}
        {section === "team" && <TeamSection orgId={org.id} />}
        {section === "billing" && <OrgBillingSection orgId={org.id} />}
      </div>
    </div>
  );
}

// "Skip for now" on /welcome: the organization's settings work without a brand, so a new
// Owner can invite the team (or wait for an invite) before adding a brand. Each section is its own
// path, /orgs/settings/<section>; /orgs/settings is Team.
export function OrgSettingsView(props: OrgSettingsProps) {
  return (
    <main className="mx-auto flex w-full max-w-[1240px] flex-col gap-5 px-4 py-6 md:px-8">
      <h1 className="page-title">Settings</h1>
      <Suspense fallback={<div className="skeleton h-96 rounded-xl" />}>
        <Body {...props} />
      </Suspense>
    </main>
  );
}
