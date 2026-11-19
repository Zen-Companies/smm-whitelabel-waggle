"use client";

import { Check } from "lucide-react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { CheckInState } from "./check-in-actions";

/** The morning-after email on or off, saved in place (no toasts, design.md §4). */
export function CheckInForm({
  initial,
  action,
}: {
  initial: boolean;
  action: (prev: CheckInState, formData: FormData) => Promise<CheckInState>;
}) {
  const [state, formAction, pending] = useActionState<CheckInState, FormData>(action, {});
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3">
      <label className="flex flex-1 cursor-pointer items-center gap-2.5 text-sm">
        <input
          type="checkbox"
          name="checkIn"
          defaultChecked={initial}
          className="accent-ink size-4"
        />
        Email me the morning after I connect
      </label>
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
      {state.saved && (
        <span role="status" className="text-success inline-flex items-center gap-1.5 text-sm">
          <Check className="size-4" aria-hidden /> {state.saved}
        </span>
      )}
      {state.error && (
        <p role="alert" className="text-danger w-full text-sm">
          {state.error}
        </p>
      )}
    </form>
  );
}
