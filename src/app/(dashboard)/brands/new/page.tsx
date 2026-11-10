import Link from "next/link";
import { Suspense } from "react";
import { can, listMyOrgs } from "@/features/orgs";
import { AddBrandForm, getCurrentTenant, getOpenOrg } from "@/features/tenants";

export const metadata = { title: "Add a brand" };

async function Content({ searchParams }: { searchParams: PageProps<"/brands/new">["searchParams"] }) {
  const { org: orgParam } = await searchParams;
  const [tenant, orgs, open] = await Promise.all([getCurrentTenant(), listMyOrgs(), getOpenOrg()]);
  const org = orgs.find((o) => o.id === orgParam) ?? open;
  return (
    <>
      <div className="flex flex-col gap-2">
        <Link href="/inbox" className="text-ink-2 hover:text-ink text-sm no-underline">
          ← Back to {tenant.name}
        </Link>
        <h1 className="page-title">Add a brand</h1>
        <p className="text-ink-2 text-[15px]">
          A brand is one business. It gets its own Instagram and Facebook accounts, Business info,
          inbox and reply rules.{org ? ` It belongs to ${org.name}.` : ""}
        </p>
      </div>
      {org && can(org.role, "brands.add") ? (
        <AddBrandForm orgId={org.id} orgName={org.name} />
      ) : (
        <p role="status" className="text-ink-2">
          Only Owners and Admins of {org?.name ?? "this organization"} can add brands.
        </p>
      )}
    </>
  );
}

// T47 / T54 (design v3 "Brands", "Organizations"): another business in an organization.
export default function AddBrandPage({ searchParams }: PageProps<"/brands/new">) {
  return (
    <main className="mx-auto flex w-full max-w-[560px] flex-col gap-7 px-4 py-10 md:py-14">
      <Suspense fallback={<div className="skeleton h-24 rounded-xl" />}>
        <Content searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
