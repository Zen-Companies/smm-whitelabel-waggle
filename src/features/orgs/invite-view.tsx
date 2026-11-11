import Link from "next/link";
import { GoogleButton, OrDivider } from "@/features/auth";
import { Button, buttonVariants } from "@/components/ui/button";
import { createServerSupabase } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import { ROLE_LABEL, isOrgRole } from "./abilities";
import { initialsOf } from "./copy";
import { brandsPhrase } from "./invite-email";
import { declineFromInvite, joinFromInvite, signOutForInvite } from "./join-actions";
import { JoinSignUpForm } from "./join-form";
import { displayName, hashInviteToken } from "./team";

function Card({
  title,
  children,
  actions,
}: {
  title: string;
  children?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <section className="card flex flex-col gap-4 p-6 md:p-7">
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      {children && <div className="text-ink-2 flex flex-col gap-3">{children}</div>}
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </section>
  );
}

const home = (
  <Link href="/welcome" className={buttonVariants({ variant: "quiet" })}>
    Go to Waggle
  </Link>
);

/**
 * The invite link (T56, design v3 "Organizations", OrgInviteJoin + OrgInviteStates). Every
 * state is a full page with one clear way out; no pop-ups, no toasts.
 */
export async function InviteView({ token, declined }: { token: string; declined: boolean }) {
  const invitePath = `/invite/${token}`;
  const db = getServiceClient();
  const { data } = await db.rpc("invite_by_token", { p_token_hash: hashInviteToken(token) });
  const invite = data?.[0];
  if (!invite) {
    return (
      <Card title="This invite link isn't valid" actions={home}>
        <p>It may have been copied only in part, or replaced by a newer invite.</p>
      </Card>
    );
  }

  const supabase = await createServerSupabase();
  const [{ data: auth }, inviter, brands] = await Promise.all([
    supabase.auth.getUser(),
    invite.invited_by ? db.auth.admin.getUserById(invite.invited_by) : null,
    invite.all_brands
      ? Promise.resolve({ data: [] as { name: string }[] })
      : db.from("tenants").select("name").in("id", invite.tenant_ids).order("name"),
  ]);
  const user = auth.user;
  const inviterName = inviter?.data.user ? displayName(inviter.data.user) : "Someone";
  const org = invite.organization_name;
  const role = isOrgRole(invite.role) ? ROLE_LABEL[invite.role] : "Member";
  const scope = brandsPhrase(
    invite.all_brands,
    (brands.data ?? []).map((b) => b.name),
  );

  const orgRow = (
    <div className="border-line flex items-center gap-3 rounded-xl border p-3.5">
      <span
        aria-hidden
        className="bg-honey-tint text-honey-text inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-sm font-bold"
      >
        {initialsOf(org)}
      </span>
      <span className="flex flex-col">
        <b className="text-ink font-semibold">{org}</b>
        <span className="text-sm">
          {inviterName} invited you as {role} · {scope}
        </span>
      </span>
    </div>
  );

  if (declined || invite.status === "declined") {
    return (
      <Card title="Invite declined" actions={home}>
        <p>{org} has been told. If you change your mind, ask them for a new invite.</p>
      </Card>
    );
  }
  if (invite.status === "accepted") {
    return (
      <Card
        title={`You're already in ${org}`}
        actions={
          user ? (
            <form action={joinFromInvite}>
              <input type="hidden" name="token" value={token} />
              <Button type="submit" variant="primary">
                Open {org}
              </Button>
            </form>
          ) : (
            <Link href="/login" className={buttonVariants({ variant: "primary" })}>
              Sign in
            </Link>
          )
        }
      >
        <p>This invite was accepted before.</p>
      </Card>
    );
  }
  if (invite.status === "expired") {
    return (
      <Card title="This invite has expired" actions={home}>
        <p>
          Ask {inviterName} at {org} to send a new one. Their Team page has a Resend button.
        </p>
      </Card>
    );
  }
  if (invite.status === "cancelled" || invite.status === "closed") {
    return (
      <Card title="This invite is no longer valid" actions={home}>
        <p>
          {org} {invite.status === "closed" ? "was closed" : "cancelled it"}. If you think
          that&apos;s a mistake, contact the person who invited you.
        </p>
      </Card>
    );
  }

  // Open invite.
  if (user) {
    if (user.email?.toLowerCase() !== invite.email) {
      return (
        <Card
          title="This invite is for another email"
          actions={
            <>
              <form action={signOutForInvite}>
                <input type="hidden" name="token" value={token} />
                <Button type="submit" variant="primary">
                  Sign out and continue
                </Button>
              </form>
              <Link href="/inbox" className={buttonVariants({ variant: "quiet" })}>
                Go to my inbox
              </Link>
            </>
          }
        >
          <p>
            You&apos;re signed in as {user.email}, but the invite was sent to {invite.email}. Sign
            out and sign in (or create a login) with that address.
          </p>
          <GoogleButton label="Use another Google account" next={invitePath} hint={invite.email} />
        </Card>
      );
    }
    return (
      <Card
        title={`Join ${org}?`}
        actions={
          <>
            <form action={joinFromInvite}>
              <input type="hidden" name="token" value={token} />
              <Button type="submit" variant="primary">
                Join
              </Button>
            </form>
            <form action={declineFromInvite}>
              <input type="hidden" name="token" value={token} />
              <Button type="submit" variant="secondary">
                Decline
              </Button>
            </form>
          </>
        }
      >
        {orgRow}
        <p>You&apos;ll keep your other organizations.</p>
      </Card>
    );
  }

  const { data: hasLogin } = await db.rpc("email_has_login", { p_email: invite.email });
  if (hasLogin) {
    return (
      <Card
        title={`Join ${org}`}
        actions={
          <Link
            href={`/login?next=${encodeURIComponent(invitePath)}`}
            className={buttonVariants({ variant: "secondary" })}
          >
            Sign in with email
          </Link>
        }
      >
        {orgRow}
        <p>{invite.email} already has a Waggle login. Sign in with it, then join.</p>
        <GoogleButton next={invitePath} hint={invite.email} />
      </Card>
    );
  }
  return (
    <section className="flex flex-col gap-6">
      {orgRow}
      <h1 className="page-title">Create your login to join</h1>
      <GoogleButton
        label={`Continue with Google as ${invite.email}`}
        next={invitePath}
        hint={invite.email}
      />
      <OrDivider />
      <JoinSignUpForm token={token} email={invite.email} />
      <p className="meta">
        You&apos;ll also get your own organization, empty and free, for any business of your own
        later.
      </p>
    </section>
  );
}
