import Link from "next/link";
import { shortTime } from "@/components/app/time";
import { requireOperator } from "@/features/billing";
import { DRAFT_PROMPTS } from "@/features/drafting";
import { CATEGORIES, JEV_QUESTION_SETS, LLM_CLASSIFY_PROMPTS } from "@/lib/classifier";
import { getServiceClient } from "@/lib/supabase/service";
import { cn } from "cn";
import { outcomeOf, outcomeText } from "./compare";
import { LAB_TEXT_MAX } from "./form";
import { LabForm, type LabOptions } from "./lab-form";
import { RunComparison } from "./run-comparison";
import type { VariantRun } from "./run";
import { CLASSIFIER_CHOICES, CLASSIFIER_LABELS, CONTEXT_MAX, currentVariant } from "./variants";

// The operator's Lab (docs/tdd.md §19, T24): one message through two setups side by side, and
// the history of runs. Batch comparison is T28.

const TABS = [
  { key: "try", label: "Try a message" },
  { key: "history", label: "History" },
] as const;

const options: LabOptions = {
  classifiers: CLASSIFIER_CHOICES.map((value) => ({ value, label: CLASSIFIER_LABELS[value] })),
  questionsVersions: Object.keys(JEV_QUESTION_SETS),
  classifyPromptVersions: Object.keys(LLM_CLASSIFY_PROMPTS),
  draftPromptVersions: Object.keys(DRAFT_PROMPTS),
  categories: [...CATEGORIES],
  contextMax: CONTEXT_MAX,
  textMax: LAB_TEXT_MAX,
};

interface StoredRun {
  id: string;
  created_at: string;
  kind: string;
  text: string;
  results: { a: VariantRun; b: VariantRun };
  tenants: { name: string } | null;
}

function short(run: VariantRun) {
  const c = run.result.classification;
  return `${c ? c.category : "–"} · ${outcomeText(outcomeOf(run.result))}`;
}

async function History({ runId }: { runId?: string }) {
  const db = getServiceClient();
  const { data } = await db
    .from("lab_runs")
    .select("id, created_at, kind, text, results, tenants (name)")
    .eq("origin", "operator")
    .order("created_at", { ascending: false })
    .limit(30);
  const runs = (data ?? []) as unknown as StoredRun[];
  const selected = runId ? runs.find((r) => r.id === runId) : undefined;

  if (runs.length === 0) {
    return <p className="meta">No runs yet. Try a message first.</p>;
  }
  return (
    <div className="flex flex-col gap-6">
      {selected && (
        <section aria-label="Run" className="flex flex-col gap-3">
          <p className="text-sm">
            <span className="font-semibold">{selected.tenants?.name}</span> ·{" "}
            {selected.kind === "dm" ? "DM" : "comment"} · {shortTime(selected.created_at)}
          </p>
          <blockquote className="card p-4 text-sm whitespace-pre-wrap">{selected.text}</blockquote>
          <RunComparison
            a={selected.results.a}
            b={selected.results.b}
            classifierLabels={CLASSIFIER_LABELS}
          />
        </section>
      )}
      <div className="card overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="meta">
            <tr className="border-b">
              <th className="p-3 font-medium">When</th>
              <th className="p-3 font-medium">Business</th>
              <th className="p-3 font-medium">Message</th>
              <th className="p-3 font-medium">A</th>
              <th className="p-3 font-medium">B</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => {
              const a = short(r.results.a);
              const b = short(r.results.b);
              return (
                <tr
                  key={r.id}
                  className={cn("border-b last:border-0", r.id === selected?.id && "bg-lavender")}
                >
                  <td className="meta p-3 whitespace-nowrap">{shortTime(r.created_at)}</td>
                  <td className="p-3">{r.tenants?.name}</td>
                  <td className="max-w-80 p-3">
                    <Link
                      href={`/admin/lab?tab=history&run=${r.id}`}
                      className="line-clamp-2 hover:underline"
                    >
                      {r.text}
                    </Link>
                  </td>
                  <td className="p-3">{a}</td>
                  <td className={cn("p-3", a !== b && "text-violet-strong font-medium")}>{b}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export async function LabView({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireOperator();
  const params = await searchParams;
  const tab = params.tab === "history" ? "history" : "try";
  const runId = typeof params.run === "string" ? params.run : undefined;

  const { data: tenants } = await getServiceClient()
    .from("tenants")
    .select("id, name")
    .order("name");

  return (
    <div className="flex flex-col gap-5">
      <nav aria-label="Lab sections" className="segmented self-start">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/admin/lab?tab=${t.key}`}
            data-active={t.key === tab || undefined}
            aria-current={t.key === tab ? "page" : undefined}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {tab === "try" ? (
        <LabForm
          tenants={tenants ?? []}
          options={options}
          defaults={currentVariant()}
          classifierLabels={CLASSIFIER_LABELS}
        />
      ) : (
        <History runId={runId} />
      )}
    </div>
  );
}
