"use client";

import { Fragment, useState } from "react";
import { Chip } from "@/components/app/chip";
import type { ActivityRow } from "./admin";

const time = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

function Result({ row }: { row: ActivityRow }) {
  if (row.status === "ok") return <Chip tone="green">ok</Chip>;
  if (row.status === "running") return <Chip>running</Chip>;
  // Refused by a limit (rejected) vs. refused or failed by the tool (error).
  return <Chip tone={row.status === "rejected" ? "honey" : "red"}>{row.errorCode ?? "error"}</Chip>;
}

/** The calls table; a row opens to show its stored (redacted) input. */
export function ActivityRows({ rows }: { rows: ActivityRow[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const th = "px-2.5 py-2 font-medium";
  const td = "px-2.5 py-2";
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead className="meta text-left text-xs">
          <tr className="border-line border-b">
            <th scope="col" className={th}>
              Time
            </th>
            <th scope="col" className={th}>
              Tool
            </th>
            <th scope="col" className={th}>
              Brand
            </th>
            <th scope="col" className={th}>
              User
            </th>
            <th scope="col" className={th}>
              Assistant
            </th>
            <th scope="col" className={th}>
              Result
            </th>
            <th scope="col" className={`${th} text-right`}>
              ms
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const expanded = open === r.id;
            return (
              <Fragment key={r.id}>
                <tr className="border-subtle hover:bg-subtle border-b align-top">
                  <td className={`${td} whitespace-nowrap tabular-nums`}>
                    <button
                      type="button"
                      aria-expanded={expanded}
                      aria-controls={`args-${r.id}`}
                      onClick={() => setOpen(expanded ? null : r.id)}
                      className="text-left underline-offset-4 hover:underline"
                    >
                      {time(r.at)}
                      <span className="sr-only">, show input</span>
                    </button>
                  </td>
                  <td className={`${td} font-mono text-xs`}>{r.tool}</td>
                  <td className={td}>{r.brand ?? <span className="text-ink-3">–</span>}</td>
                  <td className={td}>{r.user}</td>
                  <td className={td}>
                    {r.playground ? <Chip tone="blue">{r.assistant}</Chip> : r.assistant}
                  </td>
                  <td className={td}>
                    <Result row={r} />
                  </td>
                  <td className={`${td} text-right tabular-nums`}>{r.latencyMs ?? "–"}</td>
                </tr>
                {expanded && (
                  <tr id={`args-${r.id}`} className="border-subtle border-b">
                    <td colSpan={7} className="px-2.5 pb-3">
                      <pre className="bg-ink text-surface overflow-x-auto rounded-[10px] px-3.5 py-3 font-mono text-xs leading-relaxed">
                        {JSON.stringify(r.args, null, 2)}
                      </pre>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
