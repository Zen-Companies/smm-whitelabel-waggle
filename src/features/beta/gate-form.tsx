"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { redeemBetaCode, type RedeemState } from "./actions";

/** "Enter your beta code" (design v3 BetaGate). Errors stay under the field. */
export function BetaCodeForm() {
  const [state, action, pending] = useActionState<RedeemState, FormData>(redeemBetaCode, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="beta-code" className="text-sm font-medium">
          Beta code
        </label>
        <Input
          id="beta-code"
          name="code"
          required
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          defaultValue={state.code}
          aria-invalid={state.error ? true : undefined}
          aria-describedby="beta-code-hint"
        />
        {state.error ? (
          <p role="alert" className="text-danger text-sm">
            {state.error}
          </p>
        ) : (
          <p id="beta-code-hint" className="text-ink-3 text-xs">
            Letters and numbers; capitals don&apos;t matter.
          </p>
        )}
      </div>
      <Button type="submit" variant="primary" disabled={pending} className="w-full">
        {pending ? "Checking…" : "Continue"}
      </Button>
    </form>
  );
}
