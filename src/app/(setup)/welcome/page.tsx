import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { SetupLoading } from "@/components/app/setup-loading";
import { buttonVariants } from "@/components/ui/button";
import {
  ConversionTag,
  conversionEventId,
  isNewRegistration,
  matchKeys,
} from "@/features/ad-tracking";
import { can, initialsOf, isOrgRole, respondToInvite, ROLE_LABEL } from "@/features/orgs";
import { headers } from "next/headers";
import { connectBanner } from "@/features/accounts";
import { freeAccountsFull, TrialConversionTag } from "@/features/billing";
import { loadPlatformStatuses } from "@/features/platforms";
import {
  connectProblem,
  deviceOf,
  isDesktop,
  isInAppBrowser,
  WelcomeConnect,
} from "@/features/setup";
import { AddBrandForm, getCurrentTenant, getOpenOrg } from "@/features/tenants";
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

type Invite = Awaited<ReturnType<typeof loadInvites>>[number];

/** Invites to this login's email, on top of /welcome in both versions. */
function InviteList({ invites, email }: { invites: Invite[]; email: string | undefined }) {
  if (invites.length === 0) return null;
  return (
    <section
      aria-labelledby="invites-heading"
      className="border-honey bg-honey-tint/60 flex flex-col gap-3 rounded-xl border p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="invites-heading" className="text-base font-semibold">
          {invites.length === 1 ? "An invite is" : `${invites.length} invites are`} waiting for you
        </h2>
        <span className="text-honey-text text-xs">Sent to {email}</span>
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
  );
}

async function Content({
  beta,
  params,
}: {
  beta: boolean;
  params: Record<string, string | string[] | undefined>;
}) {
  const [user, org] = await Promise.all([getCurrentUser(), getOpenOrg()]);
  if (!org) redirect("/login");
  const supabase = await createServerSupabase();
  const { count } = await supabase
    .from("tenants")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", org.id);
  const hasBrand = (count ?? 0) > 0;
  const db = getServiceClient();

  // Setup step 1 (Walter's flow, 20 Nov): Connect. A business that already has an account goes
  // on to setup (or Today once setup is finished); one that can't connect goes to Today.
  let connected: string[] = [];
  if (hasBrand) {
    const tenant = await getCurrentTenant();
    if (!can(tenant.role, "accounts.manage")) redirect("/today");
    const [{ data: accounts }, { data: t }] = await Promise.all([
      db.from("social_accounts").select("platform, status").eq("tenant_id", tenant.id),
      db.from("tenants").select("setup_done_at").eq("id", tenant.id).single(),
    ]);
    connected = (accounts ?? []).filter((a) => a.status === "active").map((a) => a.platform);
    if (connected.length) redirect(t?.setup_done_at ? "/today" : "/setup");
  }

  const mayAdd = can(org.role, "brands.add");
  const invites = await loadInvites(user.id);
  const name = firstName(user.user_metadata, user.email);
  const betaBanner = beta && (
    <p role="status" className="banner">
      You&apos;re in the beta. Thanks for trying Waggle early: tell us anything with the Feedback
      button on every page.
    </p>
  );

  if (hasBrand || (org.personal && mayAdd)) {
    // A new owner's own signup, for the ads (17 Nov). Not someone who came to join a team.
    const keys =
      !hasBrand && invites.length === 0 && isNewRegistration(user.created_at, new Date())
        ? matchKeys(user.id, user.email)
        : null;
    const h = await headers();
    const banner = connectBanner(params);
    const [statuses, free] = await Promise.all([
      loadPlatformStatuses(db),
      freeAccountsFull(db, org.id),
    ]);
    return (
      <>
        {keys && (
          <ConversionTag
            event="CompleteRegistration"
            eventId={conversionEventId("CompleteRegistration", user.id)}
            em={keys.em}
            externalId={keys.externalId}
          />
        )}
        {betaBanner}
        <WelcomeConnect
          firstName={name}
          free={free}
          hasBrand={hasBrand}
          connected={connected}
          statuses={statuses}
          all={params.all === "1"}
          before={typeof params.before === "string" ? params.before : null}
          problem={connectProblem(params, banner?.tone === "error" ? banner.text : null)}
          inApp={isInAppBrowser(h.get("user-agent"))}
          device={deviceOf(h.get("user-agent"))}
          desktop={isDesktop(h.get("user-agent"))}
          invites={<InviteList invites={invites} email={user.email} />}
          email={user.email}
        />
      </>
    );
  }

  return (
    <>
      {betaBanner}
      <div className="flex flex-col gap-1.5">
        <h1 className="page-title">Welcome, {name}</h1>
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

      <InviteList invites={invites} email={user.email} />

      <section aria-labelledby="first-brand" className="card flex flex-col gap-4 p-5 md:p-6">
        <h2 id="first-brand" className="text-base font-semibold">
          {org.personal ? "Set up your own business" : `${org.name} has no brands yet`}
        </h2>
        {mayAdd ? (
          <>
            <p className="text-ink-2">
              {org.name} has no brands yet. Add the business whose Instagram and Facebook Waggle
              should answer.
            </p>
            <AddBrandForm
              orgId={org.id}
              orgName={org.name}
              cancelHref="/orgs/settings/team"
              cancelLabel="Skip for now"
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
async function WithParams({ searchParams }: PageProps<"/welcome">) {
  const params = await searchParams;
  const { beta, trial, session_id } = params;
  return (
    <>
      <Content beta={beta === "1"} params={params} />
      {trial === "started" && typeof session_id === "string" && (
        <Suspense fallback={null}>
          <TrialTag sessionId={session_id} />
        </Suspense>
      )}
    </>
  );
}

/** Back from the plan step's checkout: tell the ads a trial started (as Your plan does). */
async function TrialTag({ sessionId }: { sessionId: string }) {
  const org = await getOpenOrg();
  return org ? <TrialConversionTag sessionId={sessionId} orgId={org.id} /> : null;
}

export default function WelcomePage(props: PageProps<"/welcome">) {
  return (
    <main className="mx-auto flex w-full max-w-[760px] flex-col gap-6 px-4 py-10 md:px-8 md:py-12">
      <Suspense fallback={<SetupLoading />}>
        <WithParams {...props} />
      </Suspense>
    </main>
  );
}
