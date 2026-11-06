"use client";

import { useState } from "react";
import type { LeadStatus } from "../_demo/data";
import { useDemo } from "../_demo/store";
import { Empty, PageHead, Tabs, card, field } from "../_demo/ui";

const NAMES: Record<LeadStatus, string> = { new: "New", contacted: "Contacted", done: "Done" };

export function LeadsView() {
  const { demo, update } = useDemo();
  const [tab, setTab] = useState<LeadStatus | "all">("all");
  const about = "Customers ready to buy. Waggle pulls out who they are and what they want, and emails you each one.";
  if (!demo.leads.length) {
    return (
      <>
        <PageHead title="Leads" about={about} />
        <Empty title="Your first lead is on its way" body="When someone asks to book, order or get a quote, their details land here and in your email." />
      </>
    );
  }
  const n = (s: LeadStatus) => demo.leads.filter((l) => l.status === s).length;
  const list = tab === "all" ? demo.leads : demo.leads.filter((l) => l.status === tab);
  return (
    <>
      <PageHead title="Leads" about={about} />
      <Tabs
        label="Filter leads"
        value={tab}
        onChange={setTab}
        options={[
          { id: "all", label: "All", count: demo.leads.length },
          { id: "new", label: "New", count: n("new") },
          { id: "contacted", label: "Contacted", count: n("contacted") },
          { id: "done", label: "Done", count: n("done") },
        ]}
      />
      <ul className={`${card} mt-4`}>
        {list.length === 0 && <li className="p-4 text-[15px] text-soft">No leads here.</li>}
        {list.map((l) => (
          <li key={l.id} className="grid items-center gap-x-6 gap-y-2 border-b border-line p-4 last:border-b-0 md:grid-cols-[minmax(0,1fr)_minmax(0,220px)_150px]">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                {l.status === "new" && <span aria-hidden="true" className="size-1.5 rounded-full bg-honey" />}
                <span className="font-semibold">{l.name}</span>
              </div>
              <p className="mt-0.5 text-[15px] text-soft">{l.ask}</p>
            </div>
            <div className="min-w-0 text-[13px] text-muted">
              <div className="truncate text-[15px] text-ink">{l.contact}</div>
              {l.from} · {l.at}
            </div>
            <label className="block text-[13px] text-muted">
              <span className="sr-only">Status for {l.name}</span>
              <select
                value={l.status}
                onChange={(e) => update((d) => ({ ...d, leads: d.leads.map((x) => (x.id === l.id ? { ...x, status: e.target.value as LeadStatus } : x)) }))}
                className={`${field} min-h-11`}
              >
                {(Object.keys(NAMES) as LeadStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {NAMES[s]}
                  </option>
                ))}
              </select>
            </label>
          </li>
        ))}
      </ul>
    </>
  );
}
