"use client";

import { Check } from "lucide-react";
import { useActionState } from "react";
import { Switch } from "@/components/app/switch";
import { Button } from "@/components/ui/button";
import { saveDailyCap, switchBrand, switchEveryone, type SwitchFormState } from "./admin-actions";

function Problem({ state }: { state: SwitchFormState }) {
  return state.error ? (
    <span role="alert" className="text-danger text-sm">
      {state.error}
    </span>
  ) : null;
}

/** AI assistants for everyone: a click flips it (the page shows the new state). */
export function EveryoneSwitch({ on }: { on: boolean }) {
  const [state, action, pending] = useActionState<SwitchFormState, FormData>(switchEveryone, {});
  return (
    <form action={action} className="flex items-center gap-3">
      <input type="hidden" name="on" value={String(!on)} />
      <Problem state={state} />
      <Switch type="submit" on={on} label="AI assistants everywhere" disabled={pending} />
    </form>
  );
}

export function BrandSwitch({
  tenantId,
  name,
  on,
}: {
  tenantId: string;
  name: string;
  on: boolean;
}) {
  const [state, action, pending] = useActionState<SwitchFormState, FormData>(switchBrand, {});
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="tenantId" value={tenantId} />
      <input type="hidden" name="on" value={String(!on)} />
      <Switch type="submit" on={on} label={`AI assistants for ${name}`} disabled={pending} />
      <Problem state={state} />
    </form>
  );
}

/** A brand's daily limit for AI sends; blank = the default. */
export function DailyCapForm({
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
  const [state, action, pending] = useActionState<SwitchFormState, FormData>(saveDailyCap, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="tenantId" value={tenantId} />
      <input
        name="cap"
        aria-label={`Daily limit for ${name}`}
        inputMode="numeric"
        defaultValue={cap ?? ""}
        placeholder={`${defaultCap}`}
        className="field min-h-9 w-20 text-[13px] tabular-nums"
      />
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
      {state.saved && !pending && (
        <Check className="text-success size-4" strokeWidth={1.75} aria-label="Saved" role="img" />
      )}
      <Problem state={state} />
    </form>
  );
}
