import { BarChart3, ChevronRight, Send, Settings } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { ThemeChoice } from "@/components/app/theme-choice";
import { PlanMoreRow } from "@/features/billing";
import { can, listMyOrgs } from "@/features/orgs";
import { getCurrentTenant } from "@/features/tenants";

async function Plan() {
  const [tenant, orgs] = await Promise.all([getCurrentTenant(), listMyOrgs()]);
  const org = orgs.find((o) => o.id === tenant.organizationId);
  return (
    <PlanMoreRow orgId={tenant.organizationId} isOwner={!!org && can(org.role, "billing.view")} />
  );
}

export const metadata = { title: "More" };

const LINKS = [
  { href: "/posts", label: "Posts", Icon: Send },
  { href: "/insights", label: "Insights", Icon: BarChart3 },
  { href: "/settings", label: "Settings", Icon: Settings },
] as const;

/** The phone's More tab (design.md §4): Your plan first (18 Nov), Posts, Insights, Settings, Appearance. */
export default function MorePage() {
  return (
    <main className="mx-auto flex w-full max-w-[640px] flex-col gap-4 px-4 py-6">
      <h1 className="page-title">More</h1>
      <Suspense fallback={null}>
        <Plan />
      </Suspense>
      <ul className="card divide-line flex flex-col divide-y overflow-hidden">
        {LINKS.map(({ href, label, Icon }) => (
          <li key={href}>
            <Link
              href={href}
              className="hover:bg-subtle flex min-h-14 items-center gap-3 px-4 text-base font-medium"
            >
              <Icon className="text-ink-2 size-[22px]" strokeWidth={1.8} aria-hidden />
              <span className="flex-1">{label}</span>
              <ChevronRight className="text-ink-3 size-4" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
      <section className="card flex flex-col gap-3 p-4" aria-labelledby="more-appearance">
        <h2 id="more-appearance" className="text-base font-semibold">
          Appearance
        </h2>
        <ThemeChoice className="flex w-full" />
      </section>
    </main>
  );
}
