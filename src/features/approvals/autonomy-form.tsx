"use client";

import { Check } from "lucide-react";
import { useActionState, useRef, useState } from "react";
import { UpgradeLink } from "@/features/billing/client";
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
  autoAllowed = true,
}: {
  category: ConfigurableCategory;
  label: string;
  hint: string;
  mode: AutonomyMode;
  /** Free approves every reply (19 Nov): Auto-reply shows, locked. */
  autoAllowed?: boolean;
}) {
  const [state, action, pending] = useActionState<AutonomyFormState, FormData>(
    updateAutonomyMode,
    {},
  );
  const [value, setValue] = useState(mode);
  // A refused save goes back to what's stored, so the switch never shows a mode that isn't on.
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state.error) setValue(mode);
  }
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={action} className="@container p-5">
      <input type="hidden" name="category" value={category} />
      <fieldset className="grid grid-cols-1 items-center gap-x-6 gap-y-3 @xl:grid-cols-[minmax(0,1fr)_auto]">
        <legend className="sr-only">{label}</legend>
        <span className="flex flex-col" aria-hidden>
          <span className="font-semibold">{label}</span>
          <span className="text-ink-2 text-sm">
            {hint} {MODE_DESCRIPTIONS[value]}
          </span>
        </span>
        <span className="segmented justify-self-start" role="radiogroup" aria-label={label}>
          {AUTONOMY_MODES.map((m) =>
            m === "auto" && !autoAllowed ? (
              // Free (23 Nov): the locked mode opens the Worker Bee pop-up for this kind.
              <UpgradeLink
                key={m}
                reason="auto_reply"
                extra={{ topic: category }}
                className="opacity-60 hover:opacity-100"
              >
                {MODE_LABELS[m]}
              </UpgradeLink>
            ) : (
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
            ),
          )}
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
