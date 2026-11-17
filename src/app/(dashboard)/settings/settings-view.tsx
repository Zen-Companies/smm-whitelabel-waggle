import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { AccountSection } from "@/features/account";
import { AccountsCard, ConnectedCount } from "@/features/accounts";
import { NotificationSettings } from "@/features/alerts";
import { AssistantsCard } from "@/features/mcp";
import { YourPlanSection } from "@/features/billing";
import { can, listMyOrgs, OrgGeneralSection, TeamSection } from "@/features/orgs";
import { BusinessSettings, getCurrentTenant } from "@/features/tenants";
import { messagingOn, MessagingSection } from "@/features/messaging";
import { phoneOn, PhoneSection } from "@/features/phone";
import { whatsappAccount, WhatsAppTemplatesSection } from "@/features/whatsapp";
import {
  DEFAULT_SETTINGS_SECTION,
  isSettingsSection,
  settingsHref,
  type SettingsSection,
} from "@/lib/routes";
import { getServiceClient } from "@/lib/supabase/service";
import { cn } from "cn";

// Design v2: sections, not one long scroll. Each section is its own path, /settings/<section>
// (routes, 16 Nov); /settings is Connected accounts. T54–T57 (design v3 "Organizations"): two groups,
// the organization's (general, team, plan) and the open brand's. T74c (design "7 · Settings"):
// the redesign's names; how Waggle replies lives in Teach Waggle (/settings/replies goes there).
const ORG_SECTIONS = [
  { key: "general", label: "General" },
  { key: "team", label: "Team" },
  { key: "billing", label: "Your plan" },
] as const;
const BRAND_SECTIONS = [
  { key: "accounts", label: "Connected accounts" },
  { key: "notifications", label: "Tell me when" },
  { key: "business", label: "Business profile" },
  // MCP (docs/mcp/PLAN.md §4.2): per login, not per brand.
  { key: "ai-assistants", label: "AI assistants" },
  // T67: only listed while the brand has WhatsApp connected.
  { key: "whatsapp", label: "WhatsApp templates" },
  // T82a: only listed once staff switch Phone on for the brand.
  { key: "phone", label: "Phone" },
  // T83: only listed once staff switch Messaging (RCS, iMessage) on for the brand.
  { key: "messaging", label: "Messaging" },
] as const;
type Section = SettingsSection;

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

/** Stripe's return to Your plan: after checkout, or after buying more replies. */
function planNotice(
  params: Record<string, string | string[] | undefined>,
): "done" | "cancelled" | "top_up" | undefined {
  if (params.top_up === "done") return "top_up";
  if (params.checkout === "done") return "done";
  if (params.checkout === "cancelled") return "cancelled";
  return undefined;
}

// Plain props type: the generated route types need `next typegen`.
type SearchParams = Promise<Record<string, string | string[] | undefined>>;
export type SettingsProps = {
  params?: Promise<{ section?: string }>;
  searchParams: SearchParams;
};

async function Body({ params: route, searchParams }: SettingsProps) {
  const [{ section: raw } = {}, params] = await Promise.all([route, searchParams]);
  if (raw === "replies") redirect("/teach#replies");
  if (raw !== undefined && !isSettingsSection(raw)) notFound();
  const section: Section = raw ?? DEFAULT_SETTINGS_SECTION;
  const [tenant, orgs] = await Promise.all([getCurrentTenant(), listMyOrgs()]);
  const org = orgs.find((o) => o.id === tenant.organizationId);
  const hasWhatsApp = !!(await whatsappAccount(getServiceClient(), tenant.id));
  const [hasPhone, hasMessaging] = await Promise.all([
    phoneOn(getServiceClient(), tenant.id),
    messagingOn(getServiceClient(), tenant.id),
  ]);
  return (
    <div className="flex flex-col gap-6 md:flex-row md:items-start">
      <nav aria-label="Settings sections" className="flex flex-col gap-0.5 md:w-56 md:shrink-0">
        <span className="text-ink-4 truncate px-3 pt-1 pb-1 text-xs">You</span>
        <NavLink href={settingsHref("account")} active={section === "account"}>
          Your account
        </NavLink>
        <span className="text-ink-4 truncate px-3 pt-4 pb-1 text-xs">
          Organization · {org?.name}
        </span>
        {ORG_SECTIONS.map((s) => (
          <NavLink key={s.key} href={settingsHref(s.key)} active={s.key === section}>
            {s.label}
          </NavLink>
        ))}
        <span className="text-ink-4 truncate px-3 pt-4 pb-1 text-xs">Brand · {tenant.name}</span>
        {BRAND_SECTIONS.filter(
          (s) =>
            (s.key !== "whatsapp" || hasWhatsApp) &&
            (s.key !== "phone" || hasPhone) &&
            (s.key !== "messaging" || hasMessaging),
        ).map((s) => (
          <NavLink key={s.key} href={settingsHref(s.key)} active={s.key === section}>
            {s.label}
            {s.key === "accounts" && <ConnectedCount />}
          </NavLink>
        ))}
      </nav>
      <div className="min-w-0 flex-1">
        {section === "account" && (
          <AccountSection
            emailNotice={typeof params.email === "string" ? params.email : undefined}
          />
        )}
        {section === "general" && <OrgGeneralSection orgId={tenant.organizationId} />}
        {section === "team" && <TeamSection orgId={tenant.organizationId} />}
        {section === "billing" && org && (
          <YourPlanSection
            org={{ id: org.id, name: org.name, isOwner: can(org.role, "billing.view") }}
            notice={planNotice(params)}
          />
        )}
        {section === "accounts" && <AccountsCard searchParams={searchParams} />}
        {section === "notifications" && <NotificationSettings />}
        {section === "business" && (
          <div className="flex flex-col gap-4">
            <BusinessSettings />
            <Link href="/teach" className="action-link with-arrow">
              Write answers in Teach Waggle
            </Link>
          </div>
        )}
        {section === "ai-assistants" && <AssistantsCard />}
        {section === "whatsapp" && <WhatsAppTemplatesSection />}
        {section === "phone" && hasPhone && <PhoneSection />}
        {section === "messaging" && hasMessaging && <MessagingSection />}
      </div>
    </div>
  );
}

export function SettingsView(props: SettingsProps) {
  return (
    <main className="mx-auto flex w-full max-w-[1240px] flex-col gap-5 px-4 py-6 md:px-8">
      <div className="flex flex-col gap-1">
        <h1 className="page-title">Settings</h1>
        <p className="text-ink-2">
          How Waggle replies lives in{" "}
          <Link href="/teach" className="link-inline">
            Teach Waggle
          </Link>
          . Everything else is here.
        </p>
      </div>
      <Suspense fallback={<div className="skeleton h-96 rounded-xl" />}>
        <Body {...props} />
      </Suspense>
    </main>
  );
}
