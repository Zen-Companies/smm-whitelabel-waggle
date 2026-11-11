import { requirePermission } from "@/features/staff";
import { getServiceClient } from "@/lib/supabase/service";
import { setBetaCodeActive, setBetaRequired } from "./actions";
import { betaRequired } from "./server";
import { EditCodeForm, NewCodeForm } from "./staff-forms";

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

/**
 * Staff → Beta codes (design v3 BetaCodes): every code with its label, uses, end date and status,
 * who used it, the "Beta code required" switch, and a form for new codes. Admins only.
 */
export async function BetaCodesView() {
  await requirePermission("beta.manage");
  const db = getServiceClient();
  const [{ data: codes }, { data: access }, required, { data: users }] = await Promise.all([
    db.from("beta_codes").select("*").order("created_at", { ascending: false }),
    db
      .from("beta_access")
      .select("user_id, via, code_id, invited_by, joined_at")
      .order("joined_at"),
    betaRequired(db),
    db.auth.admin.listUsers({ perPage: 1000 }),
  ]);
  const people = new Map(
    (users?.users ?? []).map((u) => [
      u.id,
      {
        email: u.email ?? "",
        name: typeof u.user_metadata?.full_name === "string" ? u.user_metadata.full_name : "",
      },
    ]),
  );
  const label = (id: string | null) => {
    const p = id ? people.get(id) : null;
    return p ? p.name || p.email : "a deleted login";
  };
  const rows = access ?? [];
  const count = (via: string) => rows.filter((r) => r.via === via).length;
  const now = new Date().getTime();
  const TH =
    "text-ink-3 bg-subtle/60 border-line border-b px-3.5 py-2.5 text-left text-xs font-semibold";
  const TD = "border-line border-b px-3.5 py-3 align-top";

  return (
    <main className="mx-auto grid w-full max-w-[1320px] items-start gap-8 px-4 py-6 md:px-8 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="page-title">Beta codes</h1>
          <span className="meta">
            {rows.length} beta logins · {count("code")} by code · {count("invite")} by invite ·{" "}
            {count("existing")} existing
          </span>
        </div>

        <div className="card overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th scope="col" className={TH}>
                  Code
                </th>
                <th scope="col" className={TH}>
                  Label
                </th>
                <th scope="col" className={TH}>
                  Used
                </th>
                <th scope="col" className={TH}>
                  Until
                </th>
                <th scope="col" className={TH}>
                  Status
                </th>
                <th scope="col" className={TH}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {(codes ?? []).length === 0 && (
                <tr>
                  <td colSpan={6} className={`${TD} text-ink-2`}>
                    No codes yet. Create the first one on the right.
                  </td>
                </tr>
              )}
              {(codes ?? []).map((c) => {
                const expired = c.expires_at !== null && new Date(c.expires_at).getTime() <= now;
                const usedUp = c.max_uses !== null && c.uses >= c.max_uses;
                const status = !c.active ? "Off" : expired ? "Expired" : usedUp ? "Used up" : "On";
                const used = rows.filter((r) => r.code_id === c.id);
                return (
                  <tr key={c.id}>
                    <td className={`${TD} font-mono font-semibold`}>{c.code}</td>
                    <td className={TD}>
                      {c.label || <span className="text-ink-4">No label</span>}
                      {used.length > 0 && (
                        <details className="mt-1">
                          <summary className="text-honey-text cursor-pointer text-xs font-medium">
                            Who used it ({used.length})
                          </summary>
                          <ul className="mt-1 flex flex-col gap-0.5 text-xs">
                            {used.map((u) => (
                              <li key={u.user_id} className="text-ink-2">
                                {label(u.user_id)} · {people.get(u.user_id)?.email} ·{" "}
                                {when(u.joined_at)}
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </td>
                    <td className={TD}>
                      {c.uses} of {c.max_uses ?? "—"}
                    </td>
                    <td className={`${TD} text-ink-2`}>
                      {c.expires_at
                        ? new Date(c.expires_at).toLocaleDateString("en-PH", {
                            timeZone: "Asia/Manila",
                            month: "short",
                            day: "numeric",
                          })
                        : "—"}
                    </td>
                    <td
                      className={`${TD} font-medium ${status === "On" ? "text-success" : status === "Off" ? "text-ink-3" : "text-honey-text"}`}
                    >
                      {status}
                    </td>
                    <td className={`${TD} text-right whitespace-nowrap`}>
                      <div className="flex justify-end gap-1.5">
                        <form action={setBetaCodeActive}>
                          <input type="hidden" name="id" value={c.id} />
                          <input type="hidden" name="active" value={c.active ? "false" : "true"} />
                          <button
                            type="submit"
                            className="border-line-strong hover:bg-subtle bg-surface min-h-8 rounded-md border px-2.5 text-xs font-medium"
                          >
                            {c.active ? "Turn off" : "Turn on"}
                          </button>
                        </form>
                        <EditCodeForm
                          id={c.id}
                          label={c.label}
                          maxUses={c.max_uses}
                          until={c.expires_at ? c.expires_at.slice(0, 10) : ""}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {count("invite") > 0 && (
          <details className="card p-4">
            <summary className="cursor-pointer font-semibold">
              Joined by invite ({count("invite")})
            </summary>
            <ul className="mt-2 flex flex-col gap-1 text-sm">
              {rows
                .filter((r) => r.via === "invite")
                .map((r) => (
                  <li key={r.user_id} className="text-ink-2">
                    {label(r.user_id)} · invited by {label(r.invited_by)} · {when(r.joined_at)}
                  </li>
                ))}
            </ul>
          </details>
        )}

        <form
          action={setBetaRequired}
          className="card flex flex-wrap items-center justify-between gap-3 p-5"
        >
          <span className="flex flex-col">
            <b className="font-semibold">Beta code required</b>
            <span className="text-ink-2 text-sm">
              {required
                ? "On: new logins must enter a code (or join a team by invite)."
                : "Off: anyone can sign up."}
            </span>
          </span>
          <input type="hidden" name="on" value={required ? "false" : "true"} />
          <button
            type="submit"
            role="switch"
            aria-checked={required}
            aria-label="Beta code required"
            className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${required ? "bg-ink" : "bg-line-strong"}`}
          >
            <span
              className={`bg-surface absolute top-[3px] size-[18px] rounded-full transition-all ${required ? "right-[3px]" : "left-[3px]"}`}
            />
          </button>
        </form>
      </section>
      <NewCodeForm />
    </main>
  );
}
