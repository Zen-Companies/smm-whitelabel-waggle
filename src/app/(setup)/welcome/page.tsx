import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { buttonVariants } from "@/components/ui/button";
import { can, ROLE_LABEL } from "@/features/orgs";
import { AddBrandForm, getOpenOrg } from "@/features/tenants";
import { createServerSupabase, getCurrentUser } from "@/lib/supabase/server";

export const metadata = { title: "Welcome" };

function firstName(meta: Record<string, unknown> | undefined, email: string | undefined): string {
  const full = typeof meta?.full_name === "string" ? meta.full_name.trim() : "";
  return full.split(/\s+/)[0] || email?.split("@")[0] || "there";
}

async function Content() {
  const [user, org] = await Promise.all([getCurrentUser(), getOpenOrg()]);
  if (!org) redirect("/login");
  // An organization with a brand of the user's opens on that brand.
  const supabase = await createServerSupabase();
  const { count } = await supabase
    .from("tenants")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", org.id);
  if ((count ?? 0) > 0) redirect("/inbox");

  const mayAdd = can(org.role, "brands.add");
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <h1 className="page-title">Welcome, {firstName(user.user_metadata, user.email)}</h1>
        <p className="text-ink-2 text-[15px]">
          {org.personal ? (
            <>
              We made <b className="text-ink font-semibold">{org.name}</b> for you. You&apos;re its
              Owner.
            </>
          ) : (
            <>
              You&apos;re {org.role === "admin" || org.role === "owner" ? "an" : "a"}{" "}
              {ROLE_LABEL[org.role]} of <b className="text-ink font-semibold">{org.name}</b>.
            </>
          )}
        </p>
      </div>

      <section aria-labelledby="first-brand" className="card flex flex-col gap-4 p-5 md:p-6">
        <h2 id="first-brand" className="text-base font-semibold">
          {org.personal ? "Set up your own business" : `${org.name} has no brands yet`}
        </h2>
        {mayAdd ? (
          <>
            <p className="text-ink-2">
              {org.name} has no brands yet, so there&apos;s nothing to pay. Add the business whose
              Instagram and Facebook Waggle should answer.
            </p>
            <AddBrandForm
              orgId={org.id}
              orgName={org.name}
              cancelHref={null}
              submitLabel="Add your first brand"
              autoFocus={false}
            />
          </>
        ) : (
          <p className="text-ink-2">
            Only its Owners and Admins can add a brand. Once they do, it shows up here.
          </p>
        )}
      </section>

      <div className="flex flex-col gap-2">
        <Link
          href="/orgs/new"
          className={buttonVariants({ variant: "secondary", className: "w-fit" })}
        >
          Create another organization
        </Link>
        <span className="text-ink-3 text-sm">
          Another organization is for a separate business or client that pays its own bill.
        </span>
      </div>
    </>
  );
}

// T54 (design v3 "Organizations", OrgSignup): the first screen after sign-up, and the page for
// an organization with no brands yet.
export default function WelcomePage() {
  return (
    <main className="mx-auto flex w-full max-w-[720px] flex-col gap-6 px-4 py-10 md:px-8 md:py-12">
      <Suspense fallback={<div className="skeleton h-64 rounded-xl" />}>
        <Content />
      </Suspense>
    </main>
  );
}
