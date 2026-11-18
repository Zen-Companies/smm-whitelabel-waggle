"use client";

import { useActionState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { FrequencyState } from "./email-frequency-actions";
import { FREQUENCIES, FREQUENCY_LABELS, type Frequency } from "./digest";

/** Right away / Every hour / Every 2 hours, saved in place (no toasts, design.md §4). */
export function EmailFrequencyForm({
  initial,
  action,
  note,
  withLines = true,
}: {
  initial: Frequency;
  action: (prev: FrequencyState, formData: FormData) => Promise<FrequencyState>;
  note: string;
  withLines?: boolean;
}) {
  const [state, formAction, pending] = useActionState<FrequencyState, FormData>(action, {});
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">How often</legend>
        {FREQUENCIES.map((f) => (
          <label
            key={f}
            className={cn(
              "border-line has-[:checked]:border-honey-border has-[:checked]:bg-honey-tint flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-2.5",
            )}
          >
            <input
              type="radio"
              name="frequency"
              value={f}
              defaultChecked={initial === f}
              className="accent-ink mt-1"
            />
            <span className="flex flex-col">
              <span className="text-sm font-semibold">{FREQUENCY_LABELS[f].label}</span>
              {withLines && (
                <span className="text-ink-3 text-[13px]">{FREQUENCY_LABELS[f].line}</span>
              )}
            </span>
          </label>
        ))}
      </fieldset>
      <p className="meta">{note}</p>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        {state.saved && (
          <span role="status" className="text-success inline-flex items-center gap-1.5 text-sm">
            <Check className="size-4" aria-hidden /> {state.saved}
          </span>
        )}
        {state.error && (
          <p role="alert" className="text-danger text-sm">
            {state.error}
          </p>
        )}
      </div>
    </form>
  );
}
