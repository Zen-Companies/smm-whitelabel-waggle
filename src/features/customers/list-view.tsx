import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Chip } from "@/components/app/chip";
import { requirePermission } from "@/features/staff";
import { getServiceClient } from "@/lib/supabase/service";
import {
  ago,
  BROWSER_LABEL,
  BROWSERS,
  browserLabel,
  listHref,
  type ListParams,
  PAGE_SIZE,
  parseListParams,
  PLAN_KINDS,
  RANGE_LABEL,
  RANGES,
  SOURCE_LABEL,
  SOURCES,
  STAGE_LABEL,
  STAGES,
  type Stage,
} from "./derive";
import { FilterForm } from "./filter-form";
import { connectStatusLabel } from "./connect-story";
import { type CustomerRow, LIST_WINDOW, loadCustomerList } from "./load";

const PLAN_LABEL = { free: "Free", trial: "Trial", paid: "Paid" } as const;

const STAGE_TONE: Record<Stage, "red" | "honey" | "blue" | "green"> = {
  connect: "red",
  step2: "honey",
  step3: "honey",
  checkout: "blue",
  active: "green",
};

const TILE_LABEL: Record<Stage, string> = {
  connect: "Stuck at Connect",
  step2: "Stuck at Step 2",
  step3: "Stuck at Step 3",
  checkout: "Left checkout",
  active: "Active",
};

/** Staff → Customers, the list (board "Staff → Customers: trace every business", 24 Nov). */
export async function CustomersList({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission("customers.view");
  const p = parseListParams(await searchParams);
  const now = new Date();
  const list = await loadCustomerList(getServiceClient(), p, now);
  const filtered = !!(p.q || p.source || p.stuck || p.plan || p.browser || p.range !== "all");

  return (
    <section className="flex flex-col gap-4" aria-label="Customers">
      <p className="meta">
        {list.totalBusinesses} businesses · {list.thisWeek} this week
      </p>
      <FilterForm>
        <span className="flex flex-[0_1_320px] flex-col gap-1">
          <label htmlFor="cust-q" className="text-[13px] font-semibold">
            Find a business
          </label>
          <input
            id="cust-q"
            name="q"
            type="search"
            defaultValue={p.q ?? ""}
            placeholder="Business, owner email or @instagram"
            className="field"
          />
        </span>
        <Select
          name="range"
          label="Signed up"
          value={p.range}
          options={RANGES.map((r) => [r, RANGE_LABEL[r]])}
        />
        <Select
          name="source"
          label="Source"
          value={p.source}
          options={SOURCES.map((s) => [s, SOURCE_LABEL[s]])}
        />
        <Select
          name="stuck"
          label="Stuck at"
          value={p.stuck}
          options={STAGES.map((s) => [s, STAGE_LABEL[s]])}
        />
        <Select
          name="plan"
          label="Plan"
          value={p.plan}
          options={PLAN_KINDS.map((k) => [k, PLAN_LABEL[k]])}
        />
        <Select
          name="browser"
          label="Browser"
          value={p.browser}
          options={BROWSERS.map((b) => [b, BROWSER_LABEL[b]])}
        />
        <button type="submit" className="sr-only">
          Search
        </button>
        {filtered && (
          <Link
            href="/admin/customers"
            className="text-ink-2 hover:text-ink flex min-h-10 items-center px-2 text-[13px] underline underline-offset-4"
          >
            Clear
          </Link>
        )}
      </FilterForm>

      <Tiles p={p} counts={list.counts} />
      {p.stuck === "connect" && list.connectInApp.of > 0 && (
        <p className="text-ink-2">
          {list.connectInApp.inApp} of the {list.connectInApp.of} stuck at Connect opened Waggle
          inside an app&apos;s own browser (Instagram, Facebook or TikTok).
        </p>
      )}

      {list.rows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="meta text-left text-xs">
              <tr className="border-line border-b">
                {[
                  "Business",
                  "Owner",
                  "Signed up",
                  "Source",
                  "Where they are",
                  "Last activity",
                  "Plan",
                  "Flags",
                ].map((h) => (
                  <th key={h} scope="col" className="px-2.5 py-2 font-medium">
                    {h}
                  </th>
                ))}
                <th scope="col" className="px-2.5 py-2">
                  <span className="sr-only">Open</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {list.rows.map((r) => (
                <Row key={r.id} row={r} now={now} />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="meta">
          {p.q
            ? `No business matches “${p.q}”. Search looks at business name, owner email and connected Instagram or Facebook handle. A sign-up that never connected has no handle yet.`
            : "No businesses match these filters."}
        </p>
      )}

      {list.rows.length > 0 && (
        <div className="flex items-center gap-3">
          <p className="meta">
            Showing {list.rows.length} of {list.matching}
          </p>
          {list.matching > list.rows.length && (
            <Link
              href={listHref(p, { shown: String(p.shown + PAGE_SIZE) })}
              className="border-line-strong bg-surface hover:bg-subtle inline-flex min-h-10 items-center rounded-md border px-3.5 text-sm"
            >
              Show more
            </Link>
          )}
        </div>
      )}
      {list.windowFull && (
        <p className="meta">
          Looking through the newest {LIST_WINDOW} sign-ups. Narrow the dates to see older ones.
        </p>
      )}
    </section>
  );
}

function Select({
  name,
  label,
  value,
  options,
}: {
  name: string;
  label: string;
  value: string | undefined;
  options: [string, string][];
}) {
  const id = `cust-${name}`;
  return (
    <span className="flex flex-col gap-1">
      <label htmlFor={id} className="text-[13px] font-semibold">
        {label}
      </label>
      <select id={id} name={name} defaultValue={value ?? ""} className="field min-w-32">
        {name !== "range" && <option value="">Any</option>}
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </span>
  );
}

function Tiles({
  p,
  counts,
}: {
  p: ListParams;
  counts: Awaited<ReturnType<typeof loadCustomerList>>["counts"];
}) {
  const tile =
    "border-line bg-surface hover:bg-subtle flex min-w-32 flex-col rounded-xl border px-3.5 py-2.5";
  return (
    <nav aria-label="Count by where they are" className="flex flex-wrap gap-2.5">
      <Link
        href={listHref(p, { stuck: undefined })}
        aria-current={!p.stuck ? "page" : undefined}
        className={`${tile} ${!p.stuck ? "ring-ink ring-1" : ""}`}
      >
        <b className="text-xl font-semibold">{counts.total}</b>
        <span className="meta">
          Signed up {p.range === "all" ? "" : RANGE_LABEL[p.range].toLowerCase()}
        </span>
      </Link>
      {STAGES.map((s) => (
        <Link
          key={s}
          href={listHref(p, { stuck: p.stuck === s ? undefined : s })}
          aria-current={p.stuck === s ? "page" : undefined}
          className={`${tile} ${p.stuck === s ? "ring-ink ring-1" : ""}`}
        >
          <b className="text-xl font-semibold">{counts[s]}</b>
          <span className="meta">{TILE_LABEL[s]}</span>
        </Link>
      ))}
    </nav>
  );
}

function Row({ row, now }: { row: CustomerRow; now: Date }) {
  const status = connectStatusLabel({
    stage: row.stage,
    stageLabel: STAGE_LABEL[row.stage],
    lastTry: row.lastTry,
    now,
  });
  const td = "px-2.5 py-3 align-top";
  const href = `/admin/customers/${row.id}`;
  const browser = browserLabel(row.browser);
  return (
    <tr className="border-subtle hover:bg-subtle/50 border-b">
      <td className={td}>
        <Link href={href} className="font-semibold hover:underline">
          {row.name}
        </Link>
        {row.kind && <span className="meta block">{row.kind}</span>}
      </td>
      <td className={td}>
        {row.ownerEmail ?? <span className="meta">No owner login</span>}
        {row.emailUnconfirmed && (
          <span className="mt-1 block">
            <Chip tone="honey">Not confirmed</Chip>
          </span>
        )}
      </td>
      <td className={`${td} whitespace-nowrap`}>{ago(row.signedUpAt, now)}</td>
      <td className={td}>
        {SOURCE_LABEL[row.source]}
        {row.sourceLabel && <span className="meta block">{row.sourceLabel}</span>}
      </td>
      <td className={td}>
        <Chip tone={status.inProgress ? "honey" : STAGE_TONE[row.stage]}>{status.label}</Chip>
        <span className="text-ink-2 mt-1 block">{row.where}</span>
      </td>
      <td className={td}>
        {row.lastActivityAt ? ago(row.lastActivityAt, now) : "–"}
        {browser && <span className="meta block">{browser}</span>}
      </td>
      <td className={td}>{row.planLabel}</td>
      <td className={td}>
        {row.flags.length ? (
          <span className="flex flex-wrap gap-1">
            {row.flags.map((f) => (
              <Chip key={f.key} tone={f.tone}>
                {f.label}
              </Chip>
            ))}
          </span>
        ) : (
          "–"
        )}
      </td>
      <td className={`${td} text-right`}>
        <Link
          href={href}
          aria-label={`Open ${row.name}`}
          className="text-ink-2 hover:text-ink inline-flex min-h-10 items-center"
        >
          <ChevronRight className="size-4" aria-hidden />
        </Link>
      </td>
    </tr>
  );
}
