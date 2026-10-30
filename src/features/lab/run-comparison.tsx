import type { ReactNode } from "react";
import { cn } from "cn";
import { differences, outcomeOf, outcomeText, type CompareField } from "./compare";
import type { VariantRun } from "./run";

// Lab results, A next to B (T24). Operator view: scores, models and costs are the point here,
// unlike the owner's practice box.

const usd = (n: number) =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 5 })}`;

function setupText(run: VariantRun, classifierLabels: Record<string, string>) {
  const v = run.variant;
  const context =
    v.context.mode === "custom"
      ? `Description: “${v.context.text.slice(0, 80)}${v.context.text.length > 80 ? "…" : ""}”`
      : "Business name only";
  return [
    classifierLabels[v.classifier] ?? v.classifier,
    `questions ${v.questionsVersion} · LLM prompt ${v.classifyPromptVersion}`,
    `draft prompt ${v.draftPromptVersion}`,
    v.classifyModel || v.draftModel
      ? `models: ${[v.classifyModel, v.draftModel].filter(Boolean).join(", ")}`
      : null,
    context,
  ].filter(Boolean) as string[];
}

function Cell({ run, field }: { run: VariantRun; field: string }) {
  const r = run.result;
  const c = r.classification;
  switch (field) {
    case "category":
      return c ? (
        <div className="flex flex-col gap-0.5">
          <span className="font-semibold">
            {c.category} <span className="tabular-nums">· {c.confidence.toFixed(2)}</span>
          </span>
          <span className="meta">
            {c.provider} · {c.model}
            {c.reason ? ` · ${c.reason.replace("_", " ")}` : ""}
            {c.fallbackReason ? ` · fallback: ${c.fallbackReason}` : ""}
          </span>
        </div>
      ) : (
        <span className="meta">–</span>
      );
    case "scores":
      return c?.scores ? (
        <span className="text-sm tabular-nums">
          {Object.entries(c.scores)
            .map(([k, v]) => `${k} ${Number(v).toFixed(2)}`)
            .join(" · ")}
        </span>
      ) : (
        <span className="meta">{c ? "LLM: no per-question scores" : "–"}</span>
      );
    case "outcome": {
      const o = outcomeOf(r);
      return o.kind === "error" ? (
        <span className="text-danger text-sm">
          Failed at {o.step}: {o.message}
        </span>
      ) : (
        <span className="font-medium">{outcomeText(o)}</span>
      );
    }
    case "facts":
      return r.facts ? (
        r.facts.length ? (
          <ul className="flex flex-col gap-0.5 text-sm">
            {r.facts.map((f) => (
              <li key={f.id}>
                {f.title} <span className="meta tabular-nums">{f.similarity.toFixed(2)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <span className="meta">Nothing found</span>
        )
      ) : (
        <span className="meta">Not run</span>
      );
    case "reply":
      return r.draft ? (
        <div className="flex flex-col gap-1">
          <p className="text-sm whitespace-pre-wrap">{r.draft.reply}</p>
          {r.draft.needsHuman && (
            <span className="text-amber-text text-sm">
              Needs the owner{r.draft.reason ? `: ${r.draft.reason}` : ""}
            </span>
          )}
          {r.groundingIssues.length > 0 && (
            <span className="meta">
              Grounding: {r.groundingIssues.join(", ").replaceAll("_", " ")}
            </span>
          )}
        </div>
      ) : (
        <span className="meta">Not run</span>
      );
    case "cost":
      return (
        <span className="meta tabular-nums">
          {run.usage.calls} calls · {run.usage.inputTokens + run.usage.outputTokens} tokens ·{" "}
          {usd(run.usage.costUsd)} · {(run.totalMs / 1000).toFixed(1)} s
        </span>
      );
    default:
      return null;
  }
}

const ROWS: { field: string; label: string; compare?: CompareField }[] = [
  { field: "category", label: "Category", compare: "category" },
  { field: "scores", label: "Jev answers" },
  { field: "outcome", label: "What happens", compare: "outcome" },
  { field: "facts", label: "Business info found", compare: "facts" },
  { field: "reply", label: "Draft", compare: "reply" },
  { field: "cost", label: "Cost" },
];

export function RunComparison({
  a,
  b,
  classifierLabels,
  footer,
}: {
  a: VariantRun;
  b: VariantRun;
  classifierLabels: Record<string, string>;
  footer?: ReactNode;
}) {
  const diff = differences(a.result, b.result);
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-b align-top">
            <th className="meta w-40 p-3 font-medium">Setup</th>
            {[a, b].map((run, i) => (
              <th key={i} className="p-3 font-normal">
                <span className="font-semibold">{i === 0 ? "A" : "B"}</span>
                <ul className="meta mt-1 flex flex-col">
                  {setupText(run, classifierLabels).map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => {
            const differs = row.compare ? diff.has(row.compare) : false;
            return (
              <tr
                key={row.field}
                className={cn("border-b align-top last:border-0", differs && "bg-lavender")}
              >
                <th scope="row" className="meta p-3 font-medium">
                  {row.label}
                  {differs && <span className="text-violet-strong block">Differs</span>}
                </th>
                <td className="p-3">
                  <Cell run={a} field={row.field} />
                </td>
                <td className="p-3">
                  <Cell run={b} field={row.field} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {footer}
    </div>
  );
}
