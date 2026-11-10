import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { buttonVariants } from "@/components/ui/button";
import { can, initialsOf, isOrgRole, respondToInvite, ROLE_LABEL } from "@/features/orgs";
import { AddBrandForm, getOpenOrg } from "@/features/tenants";
import { createServerSupabase, getCurrentUser } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";

export const metadata = { title: "Welcome" };

function firstName(meta: Record<string, unknown> | undefined, email: string | undefined): string {
  const full = typeof meta?.full_name === "string" ? meta.full_name.trim() : "";
  return full.split(/\s+/)[0] || email?.split("@")[0] || "there";
}

/** Open invites to this login's email, with who sent them (T56, design OrgSignup). */
async function loadInvites(userId: string) {
  const db = getServiceClient();
  const { data } = await db.rpc("invites_for_user", { p_user: userId });
  return Promise.all(
    (data ?? []).map(async (i) => {
      const inviter = i.invited_by
        ? (await db.auth.admin.getUserById(i.invited_by)).data.user
        : null;
      const full = inviter?.user_metadata?.full_name;
      return {
        id: i.invite_id,
        orgName: i.organization_name,
        role: isOrgRole(i.role) ? ROLE_LABEL[i.role] : "Member",
        scope: i.all_brands ? "all brands" : `only ${i.brand_names.join(", ")}`,
        inviter:
          typeof full === "string" && full.trim() ? full.trim() : (inviter?.email ?? "Someone"),
      };
    }),
  );
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
  const invites = await loadInvites(user.id);
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

      {invites.length > 0 && (
        <section
          aria-labelledby="invites-heading"
          className="border-honey bg-honey-tint/60 flex flex-col gap-3 rounded-xl border p-5"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="invites-heading" className="text-base font-semibold">
              {invites.length === 1 ? "An invite is" : `${invites.length} invites are`} waiting for
              you
            </h2>
            <span className="text-honey-text text-xs">Sent to {user.email}</span>
          </div>
          {invites.map((i) => (
            <div
              key={i.id}
              className="border-line bg-surface flex flex-wrap items-center gap-3 rounded-lg border p-3"
            >
              <span
                aria-hidden
                className="bg-honey-tint text-honey-text inline-flex size-9 shrink-0 items-center justify-center rounded-md text-xs font-bold"
              >
                {initialsOf(i.orgName)}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <b className="font-semibold">{i.orgName}</b>
                <span className="text-ink-2 text-sm">
                  {i.inviter} invited you as {i.role} · {i.scope}
                </span>
              </span>
              <form action={respondToInvite} className="flex gap-2">
                <input type="hidden" name="inviteId" value={i.id} />
                <button
                  type="submit"
                  name="intent"
                  value="join"
                  className={buttonVariants({ variant: "primary" })}
                >
                  Join
                </button>
                <button
                  type="submit"
                  name="intent"
                  value="decline"
                  className={buttonVariants({ variant: "secondary" })}
                >
                  Decline
                </button>
              </form>
            </div>
          ))}
        </section>
      )}

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
