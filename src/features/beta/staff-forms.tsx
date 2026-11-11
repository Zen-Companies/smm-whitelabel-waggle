"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { createBetaCode, updateBetaCode, type CodeFormState } from "./actions";

/** Staff → Beta codes → New code (design v3 BetaCodes). */
export function NewCodeForm() {
  const [state, action, pending] = useActionState<CodeFormState, FormData>(createBetaCode, {});
  const [own, setOwn] = useState(false);
  return (
    <form action={action} className="card flex flex-col gap-4 p-5" key={state.created}>
      <h2 className="text-base font-semibold">New code</h2>
      <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
        <legend className="pb-2 text-sm font-semibold">Code</legend>
        <label className="flex min-h-9 items-center gap-2.5">
          <input
            type="radio"
            name="kind"
            value="generate"
            checked={!own}
            onChange={() => setOwn(false)}
            className="size-4 accent-[var(--ink)]"
          />
          Generate one
        </label>
        <label className="flex min-h-9 items-center gap-2.5">
          <input
            type="radio"
            name="kind"
            value="own"
            checked={own}
            onChange={() => setOwn(true)}
            className="size-4 accent-[var(--ink)]"
          />
          Type my own
        </label>
        {own && (
          <input
            name="code"
            aria-label="Code"
            placeholder="FBGROUP"
            className="field mt-1 uppercase"
            autoComplete="off"
          />
        )}
      </fieldset>
      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        Label
        <input
          name="label"
          maxLength={120}
          placeholder="Facebook group, batch 2"
          className="field font-normal"
        />
        <span className="meta font-normal">
          Where this code goes. Shown with everyone who used it.
        </span>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Uses
          <input
            name="maxUses"
            inputMode="numeric"
            placeholder="No limit"
            className="field font-normal"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Until
          <input name="until" type="date" className="field font-normal" />
        </label>
      </div>
      <Button type="submit" variant="primary" disabled={pending}>
        {pending ? "Creating…" : "Create code"}
      </Button>
      {state.error && (
        <p role="alert" className="text-danger text-sm">
          {state.error}
        </p>
      )}
      {state.created && (
        <p role="status" className="text-success text-sm">
          Created <b className="font-mono font-semibold">{state.created}</b>.
        </p>
      )}
      <span className="meta">One person: Uses 1. A group: a higher number. Empty: no limit.</span>
    </form>
  );
}

/** "Edit" on a code's row, opened in place. */
export function EditCodeForm({
  id,
  label,
  maxUses,
  until,
}: {
  id: string;
  label: string;
  maxUses: number | null;
  until: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<CodeFormState, FormData>(updateBetaCode, {});
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="border-line-strong hover:bg-subtle bg-surface min-h-8 rounded-md border px-2.5 text-xs font-medium"
      >
        Edit
      </button>
    );
  }
  return (
    <form action={action} className="card mt-2 flex w-72 flex-col gap-2 p-3 text-left">
      <input type="hidden" name="id" value={id} />
      <label className="flex flex-col gap-1 text-xs font-semibold">
        Label
        <input name="label" defaultValue={label} className="field font-normal" />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-xs font-semibold">
          Uses
          <input
            name="maxUses"
            defaultValue={maxUses ?? ""}
            placeholder="No limit"
            className="field font-normal"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold">
          Until
          <input name="until" type="date" defaultValue={until} className="field font-normal" />
        </label>
      </div>
      <div className="flex gap-2">
        <Button type="submit" variant="primary" disabled={pending}>
          Save
        </Button>
        <Button type="button" variant="quiet" onClick={() => setOpen(false)}>
          Close
        </Button>
      </div>
      {state.error && (
        <p role="alert" className="text-danger text-xs">
          {state.error}
        </p>
      )}
      {state.created && !state.error && <span className="text-success text-xs">Saved</span>}
    </form>
  );
}
