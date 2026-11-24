import Link from "next/link";
import { notFound } from "next/navigation";
import { hasPermission } from "@/features/staff";
import { getServiceClient, type ServiceClient } from "@/lib/supabase/service";
import { PromotionCreateForm, PromotionEditForm, PromotionToggle } from "./promotion-forms";
import { bothZones, rowToFields, rowToPromotion, type PromotionRow } from "./promotion-records";
import { promotionStatus, type PromotionStatus } from "./promotions";

// Staff → Promotions (docs/plans/promotions.md, 24 Nov), on the Staff → Plans pattern: admins only
// (`admin.caps.manage`), read straight from the table with the service role.

const STATUS: Record<PromotionStatus, { label: string; cls: string }> = {
  running: { label: "Running", cls: "bg-success-soft text-success" },
  scheduled: { label: "Scheduled", cls: "bg-honey-tint text-honey-text" },
  ended: { label: "Ended", cls: "bg-subtle text-ink-2" },
  off: { label: "Off", cls: "bg-subtle text-ink-2" },
};

const AUDIENCE: Record<string, string> = {
  never_paid_owners: "Owners who never paid",
  paying_owners: "Paying Owners",
  all_owners: "All Owners",
  everyone: "Everyone",
};

function StatusChip({ status }: { status: PromotionStatus }) {
  const s = STATUS[status];
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${s.cls}`}>{s.label}</span>
  );
}

const when = (iso: string | null, empty: string) => (iso ? bothZones(new Date(iso)) : empty);

async function emails(db: ServiceClient, ids: (string | null)[]): Promise<Map<string, string>> {
  const list = [...new Set(ids.filter((x): x is string => !!x))];
  if (!list.length) return new Map();
  const { data } = await db.rpc("user_emails", { p_ids: list });
  return new Map((data ?? []).map((r) => [r.id, r.email]));
}

function stamp(iso: string): string {
  return `${new Date(iso).toLocaleString("en-US", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  })} UTC`;
}

/** The list: every promotion with its status, dates, bar and on/off switch; then New promotion. */
export async function PromotionsView() {
  if (!(await hasPermission("admin.caps.manage"))) notFound();
  const db = getServiceClient();
  const { data: rows } = await db.from("promotions").select("*").order("created_at");
  const now = new Date();
  return (
    <>
      <div className="card overflow-hidden p-0">
        {!rows?.length ? (
          <p className="meta px-5 py-6">
            No promotions saved. The app runs the code’s defaults (Black Friday and Give a month,
            get a month) until one is created here.
          </p>
        ) : (
          <ul className="divide-line divide-y">
            {rows.map((r: PromotionRow) => {
              const p = rowToPromotion(r);
              return (
                <li
                  key={r.id}
                  className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center"
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/admin/promotions/${r.id}`}
                        className="font-display text-base font-semibold hover:underline"
                      >
                        {r.name}
                      </Link>
                      <StatusChip status={promotionStatus(p, now)} />
                      <span className="meta text-xs">
                        {r.kind === "referral" ? "Referral program" : "Seasonal"} · {r.trial_days}{" "}
                        days free
                      </span>
                    </span>
                    <span className="meta text-xs">
                      From {when(r.starts_at, "now")} · until {when(r.ends_at, "no end")}
                    </span>
                    <span className="meta text-xs">
                      Bar {r.bar_enabled ? `on, for ${AUDIENCE[r.audience] ?? r.audience}` : "off"}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <PromotionToggle id={r.id} name={r.name} enabled={r.enabled} />
                    <Link
                      href={`/admin/promotions/${r.id}`}
                      className="text-ink-2 hover:text-ink text-sm font-medium"
                    >
                      Edit
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <PromotionCreateForm />
    </>
  );
}

const ACTION_LABEL: Record<string, string> = {
  created: "Created",
  updated: "Changed",
  enabled: "Switched on",
  disabled: "Switched off",
};

/** One promotion: the edit form with its preview, then who changed what and when. */
export async function PromotionEditView({ id }: { id: string }) {
  if (!(await hasPermission("admin.caps.manage"))) notFound();
  const db = getServiceClient();
  const [{ data: row }, { data: changes }] = await Promise.all([
    db.from("promotions").select("*").eq("id", id).maybeSingle(),
    db
      .from("promotion_changes")
      .select("id, created_at, changed_by, action, after")
      .eq("promotion_id", id)
      .order("created_at", { ascending: false })
      .limit(30),
  ]);
  if (!row) notFound();
  const who = await emails(db, [row.updated_by, ...(changes ?? []).map((c) => c.changed_by)]);
  const lastBy = row.updated_by ? who.get(row.updated_by) : null;
  const lastChanged = `${stamp(row.updated_at)}${lastBy ? ` by ${lastBy}` : ""}`;
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <StatusChip status={promotionStatus(rowToPromotion(row), new Date())} />
        <PromotionToggle id={row.id} name={row.name} enabled={row.enabled} />
        <span className="meta text-sm">
          {row.kind === "referral" ? "Referral program" : "Seasonal"} · {row.id}
        </span>
      </div>
      <PromotionEditForm initial={rowToFields(row)} lastChanged={lastChanged} />
      <section className="card flex flex-col gap-3">
        <b className="font-display text-lg font-semibold">History</b>
        {!changes?.length ? (
          <p className="meta">No changes recorded yet.</p>
        ) : (
          <ul className="divide-line flex flex-col divide-y text-sm">
            {changes.map((c) => {
              const fieldsChanged =
                c.action === "updated" && c.after && typeof c.after === "object"
                  ? Object.keys(c.after as Record<string, unknown>)
                  : [];
              return (
                <li key={c.id} className="flex flex-col gap-0.5 py-2.5">
                  <span>
                    <b className="font-medium">{ACTION_LABEL[c.action] ?? c.action}</b>
                    {fieldsChanged.length > 0 && (
                      <span className="text-ink-2">
                        : {fieldsChanged.join(", ").replace(/_/g, " ")}
                      </span>
                    )}
                  </span>
                  <span className="meta text-xs">
                    {stamp(c.created_at)}
                    {c.changed_by && who.get(c.changed_by) ? ` by ${who.get(c.changed_by)}` : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
