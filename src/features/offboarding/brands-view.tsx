import Link from "next/link";
import { requirePermission } from "@/features/staff";
import { getServiceClient } from "@/lib/supabase/service";
import { BrandRows } from "./brand-rows";
import { BRANDS_PAGE, loadBrandRows } from "./brands";
import { type BrandFilter, parseBrandFilter } from "./rows";

const FILTER_LABELS: Record<BrandFilter, string> = {
  all: "All",
  active: "Active",
  offboarded: "Offboarded",
  attention: "Needs attention",
};

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Staff "Brands" (T21, design v3): offboard a brand, restore one within 3 months. */
export async function BrandsView({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[]; show?: string | string[] }>;
}) {
  await requirePermission("brands.manage");
  const sp = await searchParams;
  const q = first(sp.q) ?? "";
  const filter = parseBrandFilter(first(sp.show));
  const { rows, more, counts } = await loadBrandRows(getServiceClient(), { q, filter }, new Date());
  const href = (f: BrandFilter) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (f !== "all") p.set("show", f);
    const s = p.toString();
    return s ? `/admin/brands?${s}` : "/admin/brands";
  };
  const th = "px-2.5 py-2 font-medium";

  return (
    <section className="flex flex-col gap-4" aria-label="Brands">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <form className="flex flex-[0_1_320px] flex-col gap-1" role="search">
          <label htmlFor="brand-q" className="text-[13px] font-semibold">
            Find a brand
          </label>
          <input
            id="brand-q"
            name="q"
            type="search"
            defaultValue={q}
            placeholder="Brand name"
            className="field"
          />
          {filter !== "all" && <input type="hidden" name="show" value={filter} />}
        </form>
        <nav
          aria-label="Show"
          className="border-line-strong inline-flex flex-wrap overflow-hidden rounded-md border"
        >
          {(Object.keys(FILTER_LABELS) as BrandFilter[]).map((f, i) => (
            <Link
              key={f}
              href={href(f)}
              aria-current={f === filter ? "page" : undefined}
              className={`inline-flex min-h-10 items-center px-3.5 text-[13px] ${
                i ? "border-line-strong border-l" : ""
              } ${f === filter ? "bg-ink text-surface font-medium" : "text-ink hover:bg-subtle"}`}
            >
              {FILTER_LABELS[f]} {counts[f]}
            </Link>
          ))}
        </nav>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead className="meta text-left text-xs">
            <tr className="border-line border-b">
              <th scope="col" className={th}>
                Brand
              </th>
              <th scope="col" className={th}>
                Owner
              </th>
              <th scope="col" className={th}>
                Status
              </th>
              <th scope="col" className={th}>
                Accounts
              </th>
              <th scope="col" className={th}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <BrandRows rows={rows} />
        </table>
      </div>
      {!rows.length && <p className="text-ink-2 py-6 text-center">No brands match.</p>}
      {more && (
        <p className="meta">Showing the first {BRANDS_PAGE} by name. Search to find others.</p>
      )}
      <p className="meta">
        Only admins can offboard or restore. Owners who want to leave email
        help@zencompaniesinc.com. Every step is written to the audit log; the deletion after 3
        months runs on its own.
      </p>
    </section>
  );
}
