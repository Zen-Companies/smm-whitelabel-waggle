"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { updateAutonomyMode, type AutonomyFormState } from "./actions";
import { AUTONOMY_MODES, MODE_LABELS, type ConfigurableCategory } from "./autonomy";
import type { AutonomyMode } from "./policy";

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
  return (
    <form action={action} className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <input type="hidden" name="category" value={category} />
      <label htmlFor={`mode-${category}`} className="font-medium">
        {label}
      </label>
      <span className="flex items-center gap-2">
        <select
          id={`mode-${category}`}
          name="mode"
          defaultValue={mode}
          className="border-input bg-background h-8 rounded-md border px-2"
        >
          {AUTONOMY_MODES.map((m) => (
            <option key={m} value={m}>
              {MODE_LABELS[m]}
            </option>
          ))}
        </select>
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        {state.saved && <span className="text-muted-foreground">Saved</span>}
        {state.error && (
          <span role="alert" className="text-destructive">
            {state.error}
          </span>
        )}
      </span>
    </form>
  );
}
