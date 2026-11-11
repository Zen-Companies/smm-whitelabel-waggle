import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Brand } from "@/components/app/brand";
import { buttonVariants } from "@/components/ui/button";
import { BetaCodeForm, betaRequired, hasBetaAccess } from "@/features/beta";
import { respondToInvite } from "@/features/orgs";
import { signOut } from "@/features/tenants";
import { getCurrentUser } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";

export const metadata = { title: "Beta code" };

async function Gate() {
  const user = await getCurrentUser();
  const db = getServiceClient();
  if ((await hasBetaAccess(db, user.id)) || !(await betaRequired(db))) redirect("/welcome");
  // Invited to a team? Joining counts as beta access, so those invites are offered here too.
  const { data: invites } = await db.rpc("invites_for_user", { p_user: user.id });

  return (
    <div className="card w-full max-w-md p-6 md:p-8">
      <div className="mb-6 flex flex-col gap-2">
        <span className="bg-honey-tint text-honey-text w-fit rounded-full px-2 py-0.5 text-[11px] font-bold tracking-wide">
          BETA
        </span>
        <h1 className="display-title">Enter your beta code</h1>
        <p className="text-ink-2">
          Waggle is in private beta. Your code came with your invitation email.
        </p>
      </div>
      {(invites ?? []).length > 0 && (
        <div className="border-honey bg-honey-tint/60 mb-5 flex flex-col gap-2 rounded-xl border p-4">
          <b className="font-semibold">Or join the team that invited you</b>
          {(invites ?? []).map((i) => (
            <form
              key={i.invite_id}
              action={respondToInvite}
              className="flex items-center justify-between gap-3"
            >
              <input type="hidden" name="inviteId" value={i.invite_id} />
              <span className="min-w-0 truncate">{i.organization_name}</span>
              <button
                type="submit"
                name="intent"
                value="join"
                className={buttonVariants({ variant: "primary" })}
              >
                Join
              </button>
            </form>
          ))}
        </div>
      )}
      <BetaCodeForm />
      <div className="text-ink-2 mt-5 flex flex-col gap-1 text-sm">
        <span>
          No code yet? <a href="https://gowaggle.ai">Join the waitlist on gowaggle.ai</a>
        </span>
        <form action={signOut}>
          Signed in as {user.email} ·{" "}
          <button
            type="submit"
            className="text-honey-text font-medium underline-offset-4 hover:underline"
          >
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}

// The beta gate (design v3 "Beta access and feedback", BetaGate): the only page a login without
// beta access can open while beta codes are required.
export default function BetaPage() {
  return (
    <main className="bg-page flex min-h-dvh flex-col items-center gap-8 px-4 py-10 md:py-14">
      <Brand />
      <Suspense fallback={<div className="card h-80 w-full max-w-md" />}>
        <Gate />
      </Suspense>
    </main>
  );
}
