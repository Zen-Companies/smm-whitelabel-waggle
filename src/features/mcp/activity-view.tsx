import Link from "next/link";
import { requirePermission } from "@/features/staff";
import { getServiceClient } from "@/lib/supabase/service";
import { activityBrandOptions, loadActivity } from "./admin";
import { activityHref, changeVsBefore, parseActivityFilters, WINDOWS } from "./admin-filters";
import { ActivityFilterBar } from "./activity-filters";
import { ActivityRows } from "./activity-rows";
import { TOOLS } from "./tools/registry";

const n = (v: number) => v.toLocaleString("en-US");

/** Staff "MCP activity" (design v3): summary for the period, filters, then the calls. */
export async function McpActivityView({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission("mcp.audit.view");
  const toolNames = TOOLS.map((t) => t.name);
  const filters = parseActivityFilters(await searchParams, toolNames);
  const db = getServiceClient();
  const [{ rows, more, oldest, summary: s }, brands] = await Promise.all([
    loadActivity(db, filters, new Date()),
    activityBrandOptions(db),
  ]);
  const period = WINDOWS[filters.window].label.toLowerCase();
  const before = WINDOWS[filters.window].label.replace("Last", "the").toLowerCase();
  const change = changeVsBefore(s.calls, s.callsBefore);
  const tiles = [
    {
      label: "Calls",
      value: n(s.calls),
      note: change ? `${change} vs ${before} before` : period,
    },
    {
      label: "Errors",
      value: n(s.errors),
      note: s.calls
        ? `${((s.errors / s.calls) * 100).toFixed(1)}% · ${n(s.limited)} were limits`
        : period,
    },
    {
      label: "Median time",
      value: s.medianMs === null ? "–" : `${n(s.medianMs)} ms`,
      note: s.p95Ms === null ? period : `p95 ${n(s.p95Ms)} ms`,
    },
    { label: "Sent by AI assistants", value: n(s.sends), note: "replies and posts, all brands" },
  ];

  return (
    <div className="flex flex-col gap-5">
      <dl className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
        {tiles.map((t) => (
          <div key={t.label} className="card flex flex-col gap-0.5 px-4 py-3.5">
            <dt className="meta">
              {t.label}, {period}
            </dt>
            <dd className="text-[22px] font-semibold tabular-nums">{t.value}</dd>
            <dd className="text-ink-2 text-xs">{t.note}</dd>
          </div>
        ))}
      </dl>
      <ActivityFilterBar filters={filters} tools={toolNames} brands={brands} />
      {rows.length ? (
        <ActivityRows rows={rows} />
      ) : (
        <p className="text-ink-2 py-8 text-center">No calls match these filters.</p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="meta">
          Inputs are stored with customer text removed; click a time to see them. Playground runs
          are marked. Kept for 90 days.
        </span>
        <span className="flex gap-3 text-sm">
          {filters.before && (
            <Link
              href={activityHref({ ...filters, before: null })}
              className="text-honey-text hover:underline"
            >
              Newest
            </Link>
          )}
          {more && oldest && (
            <Link
              href={activityHref({ ...filters, before: oldest })}
              className="text-honey-text hover:underline"
            >
              Older calls
            </Link>
          )}
        </span>
      </div>
    </div>
  );
}
