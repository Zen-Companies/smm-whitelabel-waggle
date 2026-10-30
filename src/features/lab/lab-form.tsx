"use client";

import { Check } from "lucide-react";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { runLab, saveLabCase, type LabCaseState, type LabRun, type LabRunState } from "./actions";
import { RunComparison } from "./run-comparison";
import type { Variant } from "./variants";

const CONTEXT_LABELS = {
  profile: "Saved profile",
  name: "Name only",
  custom: "A description",
} as const;

export interface LabOptions {
  classifiers: { value: string; label: string }[];
  questionsVersions: string[];
  classifyPromptVersions: string[];
  draftPromptVersions: string[];
  categories: string[];
  contextMax: number;
  textMax: number;
}

export function VariantFields({
  side,
  options,
  defaults,
  last,
}: {
  side: "a" | "b";
  options: LabOptions;
  defaults: Variant;
  /** The last submitted values: React resets a form after its action, back to these defaults. */
  last: Record<string, string>;
}) {
  const val = (key: string, fallback: string) => last[`${side}_${key}`] ?? fallback;
  const [mode, setMode] = useState(val("contextMode", defaults.context.mode));
  const id = (k: string) => `${side}-${k}`;
  const select = (
    key: string,
    label: string,
    values: string[],
    value: string,
    current?: string,
  ) => (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id(key)} className="text-sm font-medium">
        {label}
      </label>
      <select id={id(key)} name={`${side}_${key}`} defaultValue={val(key, value)} className="field">
        {values.map((v) => (
          <option key={v} value={v}>
            {v}
            {v === current ? " (current)" : ""}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <fieldset className="card flex flex-col gap-4 p-4">
      <legend className="sr-only">Setup {side.toUpperCase()}</legend>
      <p className="font-semibold">Setup {side.toUpperCase()}</p>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={id("classifier")} className="text-sm font-medium">
          Classifier
        </label>
        <select
          id={id("classifier")}
          name={`${side}_classifier`}
          defaultValue={val("classifier", defaults.classifier)}
          className="field"
        >
          {options.classifiers.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {select(
          "questionsVersion",
          "Jev questions",
          options.questionsVersions,
          defaults.questionsVersion,
          defaults.questionsVersion,
        )}
        {select(
          "classifyPromptVersion",
          "LLM classifier prompt",
          options.classifyPromptVersions,
          defaults.classifyPromptVersion,
          defaults.classifyPromptVersion,
        )}
      </div>
      {select(
        "draftPromptVersion",
        "Draft prompt",
        options.draftPromptVersions,
        defaults.draftPromptVersion,
        defaults.draftPromptVersion,
      )}
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">
          What the classifier knows about the business
        </legend>
        <span className="segmented self-start" role="radiogroup">
          {(["profile", "name", "custom"] as const).map((m) => (
            <label key={m} data-active={mode === m || undefined}>
              <input
                type="radio"
                name={`${side}_contextMode`}
                value={m}
                checked={mode === m}
                onChange={() => setMode(m)}
                className="sr-only"
              />
              {CONTEXT_LABELS[m]}
            </label>
          ))}
        </span>
        {mode === "custom" && (
          <textarea
            name={`${side}_contextText`}
            defaultValue={val("contextText", "")}
            aria-label={`Setup ${side.toUpperCase()} business description`}
            rows={3}
            maxLength={options.contextMax}
            placeholder="e.g. Sells Lightroom presets and Canva templates as instant downloads. “Link?” means they want to buy."
            className="field"
          />
        )}
      </fieldset>
      <details className="text-sm">
        <summary className="meta cursor-pointer">Models (optional)</summary>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          {(["classifyModel", "draftModel"] as const).map((k) => (
            <div key={k} className="flex flex-col gap-1.5">
              <label htmlFor={id(k)} className="text-sm font-medium">
                {k === "classifyModel" ? "Classify model" : "Draft model"}
              </label>
              <input
                id={id(k)}
                name={`${side}_${k}`}
                defaultValue={val(k, "")}
                placeholder="configured model"
                className="field"
              />
            </div>
          ))}
        </div>
      </details>
    </fieldset>
  );
}

function SaveCase({ run, categories }: { run: LabRun; categories: string[] }) {
  const [state, action, pending] = useActionState<LabCaseState, FormData>(saveLabCase, {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-3 border-t p-4">
      <input type="hidden" name="tenantId" value={run.tenantId} />
      <input type="hidden" name="kind" value={run.kind} />
      <input type="hidden" name="text" value={run.text} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="case-set" className="text-sm font-medium">
          Test set
        </label>
        <input id="case-set" name="setName" defaultValue={run.tenantName} className="field" />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="case-category" className="text-sm font-medium">
          The right category
        </label>
        <select id="case-category" name="expectedCategory" className="field" defaultValue="">
          <option value="" disabled>
            Pick one
          </option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save as test case"}
      </Button>
      {state.saved && (
        <span role="status" className="inline-flex items-center gap-1 text-sm">
          <Check className="text-success size-4" strokeWidth={1.75} aria-hidden />
          Saved to {state.saved.setName}
        </span>
      )}
      {state.error && (
        <span role="alert" className="text-danger text-sm">
          {state.error}
        </span>
      )}
    </form>
  );
}

export function LabForm({
  tenants,
  options,
  defaults,
  classifierLabels,
}: {
  tenants: { id: string; name: string }[];
  options: LabOptions;
  defaults: Variant;
  classifierLabels: Record<string, string>;
}) {
  const [state, action, pending] = useActionState<LabRunState, FormData>(runLab, {});
  const [kind, setKind] = useState<"comment" | "dm">("comment");
  const [last, setLast] = useState<Record<string, string>>({});
  const [runs, setRuns] = useState(0);

  return (
    <div className="flex flex-col gap-6">
      <form
        action={action}
        onSubmit={(e) => {
          setLast(
            Object.fromEntries([...new FormData(e.currentTarget)].map(([k, v]) => [k, String(v)])),
          );
          setRuns((n) => n + 1);
        }}
        className="flex flex-col gap-5"
      >
        <div className="card flex flex-col gap-4 p-4">
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="lab-tenant" className="text-sm font-medium">
                Business
              </label>
              <select
                key={last.tenantId ?? "first"}
                id="lab-tenant"
                name="tenantId"
                className="field"
                defaultValue={last.tenantId ?? tenants[0]?.id}
              >
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <fieldset className="flex flex-col gap-1.5">
              <legend className="text-sm font-medium">Kind</legend>
              <span className="segmented" role="radiogroup">
                {(["comment", "dm"] as const).map((k) => (
                  <label key={k} data-active={kind === k || undefined}>
                    <input
                      type="radio"
                      name="kind"
                      value={k}
                      checked={kind === k}
                      onChange={() => setKind(k)}
                      className="sr-only"
                    />
                    {k === "dm" ? "DM" : "Comment"}
                  </label>
                ))}
              </span>
            </fieldset>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="lab-text" className="text-sm font-medium">
              Customer message
            </label>
            <textarea
              id="lab-text"
              name="text"
              rows={3}
              required
              defaultValue={last.text ?? ""}
              maxLength={options.textMax}
              placeholder="e.g. hm for the preset pack? link pls"
              className="field"
            />
          </div>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="draft"
              defaultChecked={last.draft === "on"}
              className="size-4"
            />
            Also find business info and draft a reply (more AI calls)
          </label>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {/* Remounted on each run: React applies a select's new default only on mount. */}
          <VariantFields
            key={`a-${runs}`}
            side="a"
            options={options}
            defaults={defaults}
            last={last}
          />
          <VariantFields
            key={`b-${runs}`}
            side="b"
            options={options}
            defaults={defaults}
            last={last}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="submit"
            variant="primary"
            disabled={pending}
            data-busy={pending || undefined}
          >
            {pending ? "Running both…" : "Run A and B"}
          </Button>
          <span className="meta">
            Real AI calls, recorded as lab use. Nothing is sent and the inbox isn&apos;t touched.
          </span>
        </div>
        {state.error && (
          <p role="alert" className="text-danger text-sm">
            {state.error}
          </p>
        )}
      </form>

      {state.run && (
        <section aria-label="Results" className="flex flex-col gap-3">
          <h2 className="section-title">Results</h2>
          <RunComparison
            a={state.run.a}
            b={state.run.b}
            classifierLabels={classifierLabels}
            footer={
              <SaveCase
                key={state.run.id ?? "run"}
                run={state.run}
                categories={options.categories}
              />
            }
          />
        </section>
      )}
    </div>
  );
}
