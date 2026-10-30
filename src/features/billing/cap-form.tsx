"use client";

import { Check } from "lucide-react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateAiCap, type CapFormState } from "./actions";

/** One business's monthly AI cap; blank uses the default. The result shows in place. */
export function CapForm({
  tenantId,
  name,
  cap,
  defaultCap,
}: {
  tenantId: string;
  name: string;
  cap: number | null;
  defaultCap: number;
}) {
  const [state, action, pending] = useActionState<CapFormState, FormData>(updateAiCap, {});
  return (
    <form action={action} className="flex flex-wrap items-center justify-end gap-2">
      <input type="hidden" name="tenantId" value={tenantId} />
      <label className="sr-only" htmlFor={`cap-${tenantId}`}>
        Monthly AI cap for {name} in dollars
      </label>
      <Input
        id={`cap-${tenantId}`}
        name="cap"
        inputMode="decimal"
        defaultValue={cap ?? ""}
        placeholder={`${defaultCap} (default)`}
        className="w-32 text-right tabular-nums"
      />
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
      {state.saved && !pending && (
        <span role="status" className="meta inline-flex items-center gap-1">
          <Check className="text-success size-4" strokeWidth={1.75} aria-hidden />
          Saved
        </span>
      )}
      {state.error && (
        <span role="alert" className="text-danger basis-full text-right text-sm">
          {state.error}
        </span>
      )}
    </form>
  );
}
