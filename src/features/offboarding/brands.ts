import { emailsOf } from "@/lib/supabase/users";
import type { ServiceClient } from "@/lib/supabase/service";
import { accountsSummary, type BrandFilter, brandState, type BrandState, daysLeft } from "./rows";

// The staff Brands page (T21): every brand not yet deleted for good, by name.

export const BRANDS_PAGE = 50;

export interface BrandRow {
  id: string;
  name: string;
  state: BrandState;
  owner: string | null;
  createdAt: string;
  offboardedAt: string | null;
  offboardedBy: string | null;
  purgeAfter: string | null;
  daysLeft: number | null;
  issue: string | null;
  accounts: string[];
}

/** The filter methods both tenant queries share (the row list and the counts). */
interface Filterable<T> {
  is(column: string, value: null): T;
  ilike(column: string, pattern: string): T;
  not(column: string, operator: string, value: null): T;
}

function narrow<Q extends Filterable<Q>>(q: Q, filter: BrandFilter, term: string): Q {
  let out = q.is("purged_at", null);
  if (term) out = out.ilike("name", `%${term}%`);
  if (filter === "active") out = out.is("offboarded_at", null);
  if (filter === "offboarded")
    out = out.not("offboarded_at", "is", null).is("offboard_issue", null);
  if (filter === "attention") out = out.not("offboard_issue", "is", null);
  return out;
}

export async function loadBrandRows(
  db: ServiceClient,
  input: { q: string; filter: BrandFilter },
  now: Date,
): Promise<{ rows: BrandRow[]; more: boolean; counts: Record<BrandFilter, number> }> {
  const term = input.q
    .trim()
    .replace(/[%_,()]/g, " ")
    .trim();
  const count = async (f: BrandFilter) => {
    const { count: n } = await narrow(
      db.from("tenants").select("id", { count: "exact", head: true }),
      f,
      term,
    );
    return n ?? 0;
  };
  const [list, all, active, offboarded, attention] = await Promise.all([
    narrow(
      db
        .from("tenants")
        .select(
          "id, name, created_at, offboarded_at, offboarded_by, purge_after, offboard_issue, social_accounts(platform, status, released_at)",
        ),
      input.filter,
      term,
    )
      .order("name")
      .limit(BRANDS_PAGE + 1),
    count("all"),
    count("active"),
    count("offboarded"),
    count("attention"),
  ]);
  if (list.error) throw new Error(`brands: reading failed: ${list.error.message}`);
  const counts = { all, active, offboarded, attention };
  const tenants = (list.data ?? []).slice(0, BRANDS_PAGE);
  const more = (list.data ?? []).length > BRANDS_PAGE;
  if (!tenants.length) return { rows: [], more, counts };

  const { data: owners } = await db
    .from("tenant_members")
    .select("tenant_id, user_id, created_at")
    .in(
      "tenant_id",
      tenants.map((t) => t.id),
    )
    .order("created_at");
  const ownerOf = new Map<string, string>();
  for (const m of owners ?? []) if (!ownerOf.has(m.tenant_id)) ownerOf.set(m.tenant_id, m.user_id);
  const emails = await emailsOf(db, [
    ...ownerOf.values(),
    ...tenants.flatMap((t) => (t.offboarded_by ? [t.offboarded_by] : [])),
  ]);

  const rows = tenants.map((t): BrandRow => {
    const state = brandState(t);
    return {
      id: t.id,
      name: t.name,
      state,
      owner: emails.get(ownerOf.get(t.id) ?? "") ?? null,
      createdAt: t.created_at,
      offboardedAt: t.offboarded_at,
      offboardedBy: t.offboarded_by
        ? (emails.get(t.offboarded_by)?.split("@")[0] ?? "a staff member")
        : null,
      purgeAfter: t.purge_after,
      daysLeft: t.purge_after ? daysLeft(t.purge_after, now) : null,
      issue: t.offboard_issue,
      accounts: accountsSummary(
        state,
        [...(t.social_accounts ?? [])].sort((a, b) => a.platform.localeCompare(b.platform)),
      ),
    };
  });
  return { rows, more, counts };
}
