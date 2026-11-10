import Link from "next/link";
import { PicturePicker } from "@/components/app/picture-picker";
import { pictureUrl } from "@/lib/pictures";
import { getCurrentUser } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import { can } from "./abilities";
import { initialsOf } from "./copy";
import { CloseOrgForm, LeaveOrgForm, OrgNameForm } from "./org-settings-client";
import { listMyOrgs } from "./server";
import { saveOrgPicture } from "./settings-actions";

async function load(orgId: string) {
  const [user, orgs] = await Promise.all([getCurrentUser(), listMyOrgs()]);
  const org = orgs.find((o) => o.id === orgId);
  if (!org) return null;
  const db = getServiceClient();
  const [{ data: row }, { data: team }, { data: brands }] = await Promise.all([
    db.from("organizations").select("picture_path").eq("id", org.id).single(),
    db.rpc("organization_team", { p_org: org.id }),
    db.from("tenants").select("id").eq("organization_id", org.id).is("offboarded_at", null),
  ]);
  const brandIds = (brands ?? []).map((b) => b.id);
  const { count: accounts } = brandIds.length
    ? await db
        .from("social_accounts")
        .select("id", { count: "exact", head: true })
        .in("tenant_id", brandIds)
        .eq("status", "active")
    : { count: 0 };
  const owners = (team ?? []).filter((m) => m.role === "owner");
  return {
    org,
    userId: user.id,
    picture: pictureUrl(row?.picture_path),
    brands: brandIds.length,
    accounts: accounts ?? 0,
    owners: owners.map((o) => o.full_name ?? o.email),
    onlyOwner: org.role === "owner" && owners.length === 1,
  };
}

/** Settings → Organization → General (T57, design OrgGeneral + OrgPictures). */
export async function OrgGeneralSection({ orgId }: { orgId: string }) {
  const data = await load(orgId);
  if (!data) return null;
  const { org } = data;
  const mayEdit = can(org.role, "org.settings");
  return (
    <div className="flex max-w-[720px] flex-col gap-5">
      <h2 className="section-title">{org.name}</h2>
      <section className="card flex flex-col gap-4 p-5">
        <h3 className="text-base font-semibold">Picture and name</h3>
        {mayEdit ? (
          <PicturePicker
            action={saveOrgPicture}
            fields={{ orgId: org.id }}
            currentUrl={data.picture}
            initials={initialsOf(org.name)}
            shape="square"
            canRemove
          />
        ) : (
          <span className="meta">Owners and Admins change the picture and name.</span>
        )}
        <OrgNameForm orgId={org.id} name={org.name} disabled={!mayEdit} />
        <span className="meta">
          Shown in the switcher, on invites and on the invite page.
          {org.personal && " This is your personal organization: rename it to whatever suits you."}
        </span>
      </section>

      {org.personal ? null : data.onlyOwner ? (
        <section className="border-honey bg-honey-tint/60 flex flex-col gap-2 rounded-xl border p-5">
          <h3 className="text-base font-semibold">You&apos;re the only Owner</h3>
          <p className="text-ink-2">
            Make another member Owner on the{" "}
            <Link href="/settings?section=team" className="font-medium">
              Team page
            </Link>{" "}
            before you leave, or close the organization.
          </p>
        </section>
      ) : (
        <LeaveOrgForm orgId={org.id} orgName={org.name} brands={data.brands} />
      )}
      {can(org.role, "org.close") && !org.personal && (
        <CloseOrgForm orgId={org.id} orgName={org.name} brands={data.brands} />
      )}
    </div>
  );
}

/** Settings → Organization → Billing (T57): one bill for every brand; Owner only for details. */
export async function OrgBillingSection({ orgId }: { orgId: string }) {
  const data = await load(orgId);
  if (!data) return null;
  const { org } = data;
  const owner = can(org.role, "billing.view");
  const row = "border-line flex justify-between gap-4 border-b py-2.5 last:border-b-0";
  return (
    <div className="flex max-w-[720px] flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 className="section-title">Billing</h2>
        <p className="text-ink-2">
          One bill for the whole of {org.name}, covering all its brands.{" "}
          {owner
            ? "You manage it as its Owner."
            : `Managed by ${data.owners.join(" and ")} (Owner).`}
        </p>
      </div>
      <section className="card flex flex-col p-5">
        <div className={row}>
          <span className="text-ink-2">Brands</span>
          <b className="font-semibold">{data.brands}</b>
        </div>
        <div className={row}>
          <span className="text-ink-2">Connected accounts</span>
          <b className="font-semibold">{data.accounts}</b>
        </div>
        <div className={row}>
          <span className="text-ink-2">Plan and price</span>
          <span className="text-ink-3">Comes with billing (T15)</span>
        </div>
        {owner && (
          <>
            <div className={row}>
              <span className="text-ink-2">Payment method</span>
              <span className="text-ink-3">Not set up yet</span>
            </div>
            <div className={row}>
              <span className="text-ink-2">Invoices</span>
              <span className="text-ink-3">None yet</span>
            </div>
          </>
        )}
      </section>
      {!owner && <p className="meta">You see what&apos;s counted, not the card or invoices.</p>}
    </div>
  );
}
