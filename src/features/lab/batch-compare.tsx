"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "cn";
import { runBatchChunk } from "./actions";
import {
  batchEstimate,
  BATCH_CATEGORIES,
  BATCH_CHUNK,
  summarizeBatch,
  type BatchRow,
} from "./batch";
import { VariantFields, type LabOptions } from "./lab-form";
import type { Variant } from "./variants";

// Lab tab 2 (T28): a labeled set through setups A and B, chunk by chunk, with accuracy per
// category and the messages whose answer changed. Classification only.

/** The plain variant from the form; the server validates it (variantSchema). */
function variantFrom(form: FormData, side: "a" | "b"): Variant {
  const f = (k: string) => String(form.get(`${side}_${k}`) ?? "");
  const mode = f("contextMode");
  return {
    classifier: f("classifier"),
    questionsVersion: f("questionsVersion"),
    classifyPromptVersion: f("classifyPromptVersion"),
    draftPromptVersion: f("draftPromptVersion"),
    context:
      mode === "custom"
        ? { mode, text: f("contextText") }
        : { mode: mode === "name" ? "name" : "profile" },
    classifyModel: f("classifyModel") || undefined,
    draftModel: f("draftModel") || undefined,
  } as Variant;
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

export function BatchCompare({
  tenants,
  sets,
  options,
  defaults,
}: {
  tenants: { id: string; name: string }[];
  sets: { key: string; label: string; count: number }[];
  options: LabOptions;
  defaults: Variant;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const stopRef = useRef(false);
  const [setKey, setSetKey] = useState(sets[0]?.key ?? "");
  const [classifiers, setClassifiers] = useState<[string, string]>([
    defaults.classifier,
    defaults.classifier,
  ]);
  const [confirmed, setConfirmed] = useState(false);
  const [running, setRunning] = useState(false);
  const [rows, setRows] = useState<BatchRow[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const count = sets.find((s) => s.key === setKey)?.count ?? 0;
  const estimate = batchEstimate(count, classifiers);
  const needsConfirm = estimate.overFreeLimit || estimate.mayExceed;

  async function run() {
    const form = new FormData(formRef.current!);
    const input = {
      tenantId: String(form.get("tenantId")),
      setKey,
      a: variantFrom(form, "a"),
      b: variantFrom(form, "b"),
    };
    stopRef.current = false;
    setRunning(true);
    setError(null);
    setRows([]);
    setTotal(count);
    let start = 0;
    for (;;) {
      const res = await runBatchChunk({ ...input, start });
      if (res.error) {
        setError(res.error);
        break;
      }
      setRows((prev) => [...prev, ...(res.rows ?? [])]);
      if (res.total !== undefined) setTotal(res.total);
      if (res.done || stopRef.current) break;
      start += BATCH_CHUNK;
    }
    setRunning(false);
  }

  const summary = rows.length ? summarizeBatch(rows) : null;

  return (
    <div className="flex flex-col gap-6">
      <form
        ref={formRef}
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
        onChange={() => {
          const form = new FormData(formRef.current!);
          setClassifiers([String(form.get("a_classifier")), String(form.get("b_classifier"))]);
        }}
        className="flex flex-col gap-5"
      >
        <div className="card grid gap-4 p-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="batch-set" className="text-sm font-medium">
              Labeled set
            </label>
            <select
              id="batch-set"
              value={setKey}
              onChange={(e) => setSetKey(e.target.value)}
              className="field"
            >
              {sets.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label} · {s.count} messages
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="batch-tenant" className="text-sm font-medium">
              Business (settings, cost record)
            </label>
            <select
              id="batch-tenant"
              name="tenantId"
              className="field"
              defaultValue={tenants[0]?.id}
            >
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <span className="meta">Repository sets use their own business name and profile.</span>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <VariantFields side="a" options={options} defaults={defaults} last={{}} />
          <VariantFields side="b" options={options} defaults={defaults} last={{}} />
        </div>

        <div className="card flex flex-col gap-2 p-4 text-sm">
          <span className="font-medium">
            {count} messages × 2 setups = {estimate.calls} classifier calls (classification only).
          </span>
          <span className="text-gray-700">
            OpenRouter requests: {estimate.openRouterCalls}
            {estimate.openRouterIfJevDown > estimate.openRouterCalls
              ? `, up to ${estimate.openRouterIfJevDown} if Jev is down (production falls back to the LLM)`
              : ""}
            . Free without credits: about 50 a day. Jev on jevos is free.
          </span>
          {needsConfirm && (
            <label className="text-amber-text flex min-h-11 items-center gap-2 font-medium">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="size-4"
              />
              This can go over today&apos;s free OpenRouter requests. Run anyway.
            </label>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="submit"
            variant="primary"
            disabled={running || !setKey || (needsConfirm && !confirmed)}
            data-busy={running || undefined}
          >
            {running ? `Running… ${rows.length}/${total}` : "Compare on this set"}
          </Button>
          {running && (
            <Button type="button" variant="quiet" onClick={() => (stopRef.current = true)}>
              Stop after this chunk
            </Button>
          )}
          {error && (
            <span role="alert" className="text-danger text-sm">
              {error}
            </span>
          )}
        </div>
      </form>

      {summary && (
        <section aria-label="Batch results" className="flex flex-col gap-4">
          <h2 className="section-title">
            Results {rows.length < total ? `(${rows.length} of ${total})` : ""}
          </h2>
          <div className="card overflow-x-auto">
            <table className="w-full text-left text-sm tabular-nums">
              <thead className="meta">
                <tr className="border-b">
                  <th className="p-3 font-medium">Category</th>
                  <th className="p-3 font-medium">Messages</th>
                  <th className="p-3 font-medium">A right</th>
                  <th className="p-3 font-medium">B right</th>
                </tr>
              </thead>
              <tbody>
                {BATCH_CATEGORIES.map((c) => {
                  const a = summary.a.perCategory[c];
                  const b = summary.b.perCategory[c];
                  if (!a.total) return null;
                  return (
                    <tr key={c} className="border-b">
                      <td className="p-3">{c}</td>
                      <td className="p-3">{a.total}</td>
                      <td className={cn("p-3", a.correct > b.correct && "font-semibold")}>
                        {a.correct} ({pct(a.correct / a.total)})
                      </td>
                      <td className={cn("p-3", b.correct > a.correct && "font-semibold")}>
                        {b.correct} ({pct(b.correct / b.total)})
                      </td>
                    </tr>
                  );
                })}
                <tr>
                  <th scope="row" className="p-3">
                    All
                  </th>
                  <td className="p-3">{summary.total}</td>
                  <td className="p-3 font-semibold">
                    {pct(summary.a.accuracy)}
                    {summary.a.errors ? ` · ${summary.a.errors} failed` : ""}
                  </td>
                  <td className="p-3 font-semibold">
                    {pct(summary.b.accuracy)}
                    {summary.b.errors ? ` · ${summary.b.errors} failed` : ""}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <h3 className="font-semibold">Changed answers ({summary.changed.length})</h3>
          {summary.changed.length === 0 ? (
            <p className="meta">A and B agree on every message so far.</p>
          ) : (
            <div className="card overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="meta">
                  <tr className="border-b">
                    <th className="p-3 font-medium">Message</th>
                    <th className="p-3 font-medium">Right answer</th>
                    <th className="p-3 font-medium">A</th>
                    <th className="p-3 font-medium">B</th>
                    <th className="p-3 font-medium">B</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.changed.map((r) => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="max-w-96 p-3">{r.text}</td>
                      <td className="p-3">{r.expected}</td>
                      <td className="p-3">{r.a ?? `failed${r.aError ? `: ${r.aError}` : ""}`}</td>
                      <td className="p-3">{r.b ?? `failed${r.bError ? `: ${r.bError}` : ""}`}</td>
                      <td
                        className={cn(
                          "p-3 font-medium",
                          r.verdict === "fixed" && "text-success",
                          r.verdict === "broke" && "text-danger",
                        )}
                      >
                        {r.verdict === "fixed"
                          ? "Fixed"
                          : r.verdict === "broke"
                            ? "Broke"
                            : "Both wrong"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
