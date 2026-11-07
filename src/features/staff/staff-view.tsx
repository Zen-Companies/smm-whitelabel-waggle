import { Check } from "lucide-react";
import { getServiceClient } from "@/lib/supabase/service";
import { listStaff, loadRoleMatrix } from "./members";
import { PERMISSION_LABELS, ROLE_LABELS } from "./pages";
import { PERMISSIONS, STAFF_ROLES } from "./permissions";
import { requirePermission } from "./staff";
import { AddStaffForm, RemoveStaff, RoleSelect } from "./staff-forms";

const added = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

/** Staff page (design v3 "Staff"): who has a role, add by email, and what each role can do. */
export async function StaffView() {
  const access = await requirePermission("staff.manage");
  const db = getServiceClient();
  const [staff, matrix] = await Promise.all([listStaff(db), loadRoleMatrix(db)]);
  const roles = STAFF_ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }));

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <section className="flex flex-col gap-3.5" aria-label="Staff">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="meta text-left text-xs">
              <tr className="border-line border-b">
                <th scope="col" className="px-2.5 py-2 font-medium">
                  Person
                </th>
                <th scope="col" className="px-2.5 py-2 font-medium">
                  Role
                </th>
                <th scope="col" className="px-2.5 py-2 font-medium">
                  Added
                </th>
                <th scope="col" className="px-2.5 py-2 font-medium">
                  <span className="sr-only">Remove</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {staff.map((m) => {
                const me = m.userId === access.userId;
                return (
                  <tr key={m.userId} className="border-subtle border-b align-middle">
                    <td className="px-2.5 py-2">{m.email}</td>
                    <td className="px-2.5 py-2">
                      {me ? (
                        ROLE_LABELS[m.role]
                      ) : (
                        <RoleSelect userId={m.userId} name={m.email} role={m.role} roles={roles} />
                      )}
                    </td>
                    <td className="px-2.5 py-2 tabular-nums">{added(m.addedAt)}</td>
                    <td className="px-2.5 py-2 text-right">
                      {me ? (
                        <span className="meta text-xs">You</span>
                      ) : (
                        <RemoveStaff userId={m.userId} name={m.email} />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <AddStaffForm roles={roles} />
      </section>

      <section aria-labelledby="matrix" className="card flex flex-col gap-2 p-4">
        <h2 id="matrix" className="font-semibold">
          What each role can do
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="meta text-left text-xs">
              <tr className="border-line border-b">
                <th scope="col" className="px-2.5 py-2 font-medium">
                  Can…
                </th>
                {STAFF_ROLES.map((r) => (
                  <th key={r} scope="col" className="px-2.5 py-2 font-medium">
                    {ROLE_LABELS[r]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERMISSIONS.map((p) => (
                <tr key={p} className="border-subtle border-b last:border-0">
                  <th scope="row" className="px-2.5 py-2 text-left font-normal">
                    {PERMISSION_LABELS[p]}
                  </th>
                  {STAFF_ROLES.map((r) => (
                    <td key={r} className="px-2.5 py-2">
                      {matrix[r].has(p) ? (
                        <Check className="text-success size-4" strokeWidth={2.5} aria-label="Yes" />
                      ) : (
                        <span className="text-ink-4" aria-label="No">
                          –
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="meta text-xs">
          Changing what a role can do is a database change (migration).
        </p>
      </section>
    </div>
  );
}
