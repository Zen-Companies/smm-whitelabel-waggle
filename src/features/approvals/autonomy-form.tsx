"use client";

import { Check } from "lucide-react";
import { useActionState, useRef, useState } from "react";
import { updateAutonomyMode, type AutonomyFormState } from "./actions";
import {
  AUTONOMY_MODES,
  MODE_DESCRIPTIONS,
  MODE_LABELS,
  type ConfigurableCategory,
} from "./autonomy";
import type { AutonomyMode } from "./policy";

/**
 * One category's reply mode as a segmented control (docs/design.md §3: Off / Ask me first /
 * Auto-send). Saves on change; the result shows in place, never as a toast.
 */
export function AutonomyForm({
  category,
  label,
  mode,
}: {
  category: ConfigurableCategory;
  label: string;
  mode: AutonomyMode;
}) {
  const [state, action, pending] = useActionState<AutonomyFormState, FormData>(
    updateAutonomyMode,
    {},
  );
  const [value, setValue] = useState(mode);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-2 py-4">
      <input type="hidden" name="category" value={category} />
      <fieldset className="flex flex-wrap items-center justify-between gap-3">
        <legend className="sr-only">{label}</legend>
        <span className="font-medium" aria-hidden>
          {label}
        </span>
        <span className="segmented" role="radiogroup" aria-label={label}>
          {AUTONOMY_MODES.map((m) => (
            <label key={m} data-active={value === m || undefined}>
              <input
                type="radio"
                name="mode"
                value={m}
                checked={value === m}
                onChange={() => {
                  setValue(m);
                  // Save right away.
                  queueMicrotask(() => formRef.current?.requestSubmit());
                }}
                className="sr-only"
              />
              {MODE_LABELS[m]}
            </label>
          ))}
        </span>
      </fieldset>
      <p className="meta flex items-center gap-2">
        {MODE_DESCRIPTIONS[value]}
        {pending && <span>Saving…</span>}
        {!pending && state.saved && (
          <span role="status" className="inline-flex items-center gap-1 text-gray-700">
            <Check className="text-success size-4" strokeWidth={1.75} aria-hidden />
            Saved
          </span>
        )}
      </p>
      {state.error && (
        <p role="alert" className="text-danger text-sm">
          {state.error}
        </p>
      )}
    </form>
  );
}
