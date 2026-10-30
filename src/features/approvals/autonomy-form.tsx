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
 * Auto-reply). Saves on change; the result shows in place, never as a toast.
 */
export function AutonomyForm({
  category,
  label,
  hint,
  mode,
}: {
  category: ConfigurableCategory;
  label: string;
  hint: string;
  mode: AutonomyMode;
}) {
  const [state, action, pending] = useActionState<AutonomyFormState, FormData>(
    updateAutonomyMode,
    {},
  );
  const [value, setValue] = useState(mode);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={action} className="p-5">
      <input type="hidden" name="category" value={category} />
      <fieldset className="grid grid-cols-1 items-center gap-x-6 gap-y-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        <legend className="sr-only">{label}</legend>
        <span className="flex flex-col" aria-hidden>
          <span className="font-semibold">{label}</span>
          <span className="text-ink-2 text-sm">
            {hint} {MODE_DESCRIPTIONS[value]}
          </span>
        </span>
        <span className="segmented justify-self-start" role="radiogroup" aria-label={label}>
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
      {(pending || state.saved) && (
        <p className="meta mt-2 flex items-center gap-2">
          {pending ? (
            "Saving…"
          ) : (
            <span role="status" className="text-ink-2 inline-flex items-center gap-1">
              <Check className="text-success size-4" strokeWidth={1.75} aria-hidden />
              Saved
            </span>
          )}
        </p>
      )}
      {state.error && (
        <p role="alert" className="text-danger mt-2 text-sm">
          {state.error}
        </p>
      )}
    </form>
  );
}
