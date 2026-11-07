"use client";

import { useRouter } from "next/navigation";
import {
  activityHref,
  ASSISTANTS,
  WINDOWS,
  type ActivityFilters,
  type WindowKey,
} from "./admin-filters";

/** The activity filters: each change loads the page with the new URL (newest first again). */
export function ActivityFilterBar({
  filters,
  tools,
  brands,
}: {
  filters: ActivityFilters;
  tools: string[];
  brands: { id: string; name: string }[];
}) {
  const router = useRouter();
  const go = (patch: Partial<ActivityFilters>) =>
    router.push(activityHref({ ...filters, before: null, ...patch }));
  const select = "field min-h-10 w-auto min-w-44 text-[13px]";
  const label = "text-ink-3 text-xs font-semibold";

  return (
    <form
      className="flex flex-wrap items-end gap-3"
      aria-label="Filter calls"
      onSubmit={(e) => e.preventDefault()}
    >
      <span className="flex flex-col gap-1">
        <label htmlFor="f-tool" className={label}>
          Tool
        </label>
        <select
          id="f-tool"
          className={select}
          value={filters.tool ?? ""}
          onChange={(e) => go({ tool: e.target.value || null })}
        >
          <option value="">All tools</option>
          {tools.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </span>
      <span className="flex flex-col gap-1">
        <label htmlFor="f-brand" className={label}>
          Brand
        </label>
        <select
          id="f-brand"
          className={`${select} min-w-56`}
          value={filters.brand ?? ""}
          onChange={(e) => go({ brand: e.target.value || null })}
        >
          <option value="">All brands</option>
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </span>
      <span className="flex flex-col gap-1">
        <label htmlFor="f-assistant" className={label}>
          Assistant
        </label>
        <select
          id="f-assistant"
          className={select}
          value={filters.assistant ?? ""}
          onChange={(e) =>
            go({ assistant: (e.target.value || null) as ActivityFilters["assistant"] })
          }
        >
          <option value="">All assistants</option>
          {ASSISTANTS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </span>
      <span className="flex flex-col gap-1">
        <label htmlFor="f-when" className={label}>
          When
        </label>
        <select
          id="f-when"
          className={select}
          value={filters.window}
          onChange={(e) => go({ window: e.target.value as WindowKey })}
        >
          {Object.entries(WINDOWS).map(([k, w]) => (
            <option key={k} value={k}>
              {w.label}
            </option>
          ))}
        </select>
      </span>
      <label htmlFor="f-errors" className="inline-flex min-h-10 items-center gap-2 text-[13px]">
        <input
          id="f-errors"
          type="checkbox"
          checked={filters.errorsOnly}
          onChange={(e) => go({ errorsOnly: e.target.checked })}
          className="accent-honey size-[18px]"
        />
        Errors only
      </label>
    </form>
  );
}
