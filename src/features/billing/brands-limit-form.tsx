"use client";

import { Check } from "lucide-react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateBrandsLimit, type BrandsLimitState } from "./actions";
import type { PlanId } from "./plans";

/** One plan's brands; blank is no limit. The result shows in place. */
export function BrandsLimitForm({
  plan,
  name,
  limit,
}: {
  plan: PlanId;
  name: string;
  limit: number | null;
}) {
  const [state, action, pending] = useActionState<BrandsLimitState, FormData>(
    updateBrandsLimit,
    {},
  );
  return (
    <form action={action} className="flex flex-wrap items-center justify-end gap-2">
      <input type="hidden" name="plan" value={plan} />
      <label className="sr-only" htmlFor={`brands-${plan}`}>
        Brands included in {name}
      </label>
      <Input
        id={`brands-${plan}`}
        name="brands"
        inputMode="numeric"
        defaultValue={limit ?? ""}
        placeholder="No limit"
        className="w-28 text-right tabular-nums"
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
