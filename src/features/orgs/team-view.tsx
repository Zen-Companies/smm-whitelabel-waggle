import { getCurrentUser } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import { assignableRoles, can, canManageMember, ROLE_LABEL, type OrgRole } from "./abilities";
import { initialsOf } from "./copy";
import { brandsPhrase } from "./invite-email";
import { listMyOrgs } from "./server";
import { loadTeam } from "./team";
import { InviteActions, InviteForm, MemberManage, RoleSelect } from "./team-client";

function lastActive(iso: string | null, now: Date): string {
  if (!iso) return "Not yet";
  const days = Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const TH =
  "text-ink-3 bg-subtle/60 border-line border-b px-3.5 py-2.5 text-left text-xs font-semibold";
const TD = "border-line border-b px-3.5 py-3 align-top";

/**
 * Settings → Team (T56, design v3 "Organizations", OrgTeam): who works on this organization's
 * brands, with role and brands; owners and admins also see invites and the invite panel.
 * Everyone else sees the list without controls.
 */
export async function TeamSection({ orgId }: { orgId: string }) {
  const [user, orgs] = await Promise.all([getCurrentUser(), listMyOrgs()]);
  const org = orgs.find((o) => o.id === orgId);
  if (!org) return null;
  const manages = can(org.role, "team.manage");
  const team = await loadTeam(getServiceClient(), org.id, manages);
  const brandName = new Map(team.brands.map((b) => [b.id, b.name]));
  const now = new Date();
  const open = team.invites.filter((i) => !i.declinedAt);

  const brandsOf = (all: boolean, ids: string[]) =>
    all
      ? "All brands"
      : brandsPhrase(
          false,
          ids.map((id) => brandName.get(id) ?? "a closed brand"),
        );

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section aria-labelledby="team-heading" className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <h2 id="team-heading" className="section-title">
              Team
            </h2>
            <span className="meta">
              {team.members.length} {team.members.length === 1 ? "member" : "members"}
              {manages && ` · ${open.length} ${open.length === 1 ? "invite" : "invites"}`}
            </span>
          </div>
          <p className="text-ink-2">
            Everyone here works on {org.name}&apos;s brands. Members limited to some brands see only
            those.
          </p>
        </div>

        <div className="card overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th scope="col" className={TH}>
                  Member
                </th>
                <th scope="col" className={TH}>
                  Role
                </th>
                <th scope="col" className={TH}>
                  Brands
                </th>
                <th scope="col" className={TH}>
                  Last active
                </th>
                {manages && (
                  <th scope="col" className={TH}>
                    <span className="sr-only">Actions</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {team.members.map((m) => {
                const isSelf = m.userId === user.id;
                const name = m.name ?? m.email;
                const editable = canManageMember(org.role, m.role, isSelf);
                return (
                  <tr key={m.userId}>
                    <td className={TD}>
                      <span className="flex items-center gap-2.5">
                        <span
                          aria-hidden
                          className="bg-subtle text-ink-2 inline-flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                        >
                          {initialsOf(name)}
                        </span>
                        <span className="flex min-w-0 flex-col">
                          <b className="truncate font-semibold">
                            {name}
                            {isSelf && <span className="text-ink-3 font-normal"> (you)</span>}
                          </b>
                          {m.name && <span className="meta truncate">{m.email}</span>}
                        </span>
                      </span>
                    </td>
                    <td className={TD}>
                      {editable ? (
                        <RoleSelect
                          orgId={org.id}
                          userId={m.userId}
                          role={m.role}
                          roles={assignableRoles(org.role).concat(
                            assignableRoles(org.role).includes(m.role) ? [] : [m.role],
                          )}
                          label={`Role of ${name}`}
                        />
                      ) : (
                        ROLE_LABEL[m.role as OrgRole]
                      )}
                    </td>
                    <td className={`${TD} text-ink-2`}>{brandsOf(m.allBrands, m.brandIds)}</td>
                    <td className={`${TD} text-ink-3 whitespace-nowrap`}>
                      {lastActive(m.lastSignInAt, now)}
                    </td>
                    {manages && (
                      <td className={`${TD} text-right`}>
                        {editable && m.role !== "owner" && (
                          <MemberManage
                            orgId={org.id}
                            userId={m.userId}
                            name={name}
                            allBrands={m.allBrands}
                            brandIds={m.brandIds}
                            brands={team.brands}
                          />
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {manages && team.invites.length > 0 && (
          <>
            <h3 className="mt-2 text-base font-semibold">Invites</h3>
            <div className="card overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <tbody>
                  {team.invites.map((i) => {
                    const expired = new Date(i.expiresAt) <= now;
                    const status = i.declinedAt
                      ? "Declined"
                      : expired
                        ? `Expired ${lastActive(i.expiresAt, now).toLowerCase()}`
                        : `Sent ${lastActive(i.createdAt, now).toLowerCase()} · expires ${new Date(
                            i.expiresAt,
                          ).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
                    return (
                      <tr key={i.id}>
                        <td className={TD}>
                          <span className="flex flex-col">
                            <b className="font-semibold">{i.email}</b>
                            <span
                              className={
                                expired || i.declinedAt ? "text-honey-text text-xs" : "meta"
                              }
                            >
                              {status}
                            </span>
                          </span>
                        </td>
                        <td className={TD}>{ROLE_LABEL[i.role]}</td>
                        <td className={`${TD} text-ink-2`}>{brandsOf(i.allBrands, i.brandIds)}</td>
                        <td className={`${TD} text-right`}>
                          {!i.declinedAt && (
                            <InviteActions orgId={org.id} inviteId={i.id} expired={expired} />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
        {manages && org.role === "admin" && (
          <p className="meta">
            You&apos;re an Admin, so Owners&apos; rows are locked and Owner isn&apos;t offered as a
            role. Your own role is changed by another Owner or Admin.
          </p>
        )}
      </section>

      {manages && (
        <InviteForm
          orgId={org.id}
          roles={assignableRoles(org.role).filter(
            (r): r is Exclude<OrgRole, "owner"> => r !== "owner",
          )}
          brands={team.brands}
        />
      )}
    </div>
  );
}
