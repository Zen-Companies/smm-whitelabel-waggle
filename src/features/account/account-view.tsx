import Link from "next/link";
import { getCurrentUser } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import {
  DeleteLoginForm,
  DisconnectGoogle,
  EmailRow,
  NameForm,
  PasswordRow,
  SignOutEverywhere,
} from "./account-forms";

const notice: Record<string, string> = {
  changed: "Your email is changed. Sign in with the new one from now on.",
  expired:
    "That confirmation link didn't work. It may be old or already used. Try the change again.",
};

/**
 * Settings → Account (design v3 "Sign-in and account", AuthAccount): this login's name and email,
 * how it signs in (Google, password), sessions, and deleting it. Per login, not per brand.
 */
export async function AccountSection({ emailNotice }: { emailNotice?: string }) {
  const user = await getCurrentUser();
  const db = getServiceClient();
  const [{ data: hasPassword }, { data: blockers }] = await Promise.all([
    db.rpc("login_has_password", { p_user: user.id }),
    db.rpc("login_deletion_blockers", { p_user: user.id }),
  ]);
  const google = (user.identities ?? []).find((i) => i.provider === "google");
  const googleEmail =
    typeof google?.identity_data?.email === "string" ? google.identity_data.email : user.email;
  const name =
    typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : "";
  const email = user.email ?? "";

  return (
    <div className="flex max-w-[720px] flex-col gap-5">
      <h2 className="section-title">Account</h2>
      {emailNotice && notice[emailNotice] && (
        <p role="status" className={emailNotice === "changed" ? "banner" : "danger-box"}>
          {notice[emailNotice]}
        </p>
      )}

      <section className="card flex flex-col gap-4 p-5">
        <h3 className="text-base font-semibold">Profile</h3>
        <NameForm name={name} />
        <EmailRow email={email} />
      </section>

      <section className="card flex flex-col gap-4 p-5">
        <h3 className="text-base font-semibold">How you sign in</h3>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="flex flex-col">
            <b className="font-semibold">Google</b>
            <span className="text-ink-2 text-sm">
              {google
                ? `Connected · ${googleEmail}`
                : `Not connected. Sign in once with Google as ${email} to connect it.`}
            </span>
          </span>
          {google && hasPassword && <DisconnectGoogle />}
        </div>
        <PasswordRow hasPassword={hasPassword === true} />
        {google && !hasPassword && (
          <span className="meta">
            Disconnect Google is offered once a password is set, so you can always sign in.
          </span>
        )}
      </section>

      <section className="card flex flex-col gap-3 p-5">
        <h3 className="text-base font-semibold">Sessions</h3>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-ink-2">Sign out on every phone and computer at once.</span>
          <SignOutEverywhere />
        </div>
      </section>

      <section className="card flex flex-col gap-3 border-red-200 p-5">
        <h3 className="text-base font-semibold">Delete login</h3>
        <p className="text-ink-2">
          Removes you from every organization. Brands and their data stay with their organizations;
          brands in your own organization can be restored for 3 months.
        </p>
        {blockers && blockers.length > 0 ? (
          <div className="border-honey bg-honey-tint/60 rounded-lg border p-3 text-sm">
            You&apos;re the only Owner of{" "}
            <b className="font-semibold">{blockers.map((b) => b.organization_name).join(", ")}</b>.
            Make another member Owner on its{" "}
            <Link href="/settings?section=team" className="font-medium">
              Team page
            </Link>{" "}
            first, or close it.
          </div>
        ) : (
          <DeleteLoginForm email={email} />
        )}
      </section>
    </div>
  );
}
