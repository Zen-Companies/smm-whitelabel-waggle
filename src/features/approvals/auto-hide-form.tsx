"use client";

import { Check } from "lucide-react";
import { useActionState, useRef, useState } from "react";
import { setAutoHideSpam, type AutoHideFormState } from "./actions";

/**
 * "Hide spam comments for me" (T40), Settings → Replies. Off by default; saves on change and
 * says so in place, never as a toast.
 */
export function AutoHideForm({ on }: { on: boolean }) {
  const [state, action, pending] = useActionState<AutoHideFormState, FormData>(setAutoHideSpam, {});
  const [checked, setChecked] = useState(on);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={action} className="card flex flex-col gap-2 p-5">
      <label htmlFor="auto-hide-spam" className="flex cursor-pointer items-start gap-3">
        <input
          id="auto-hide-spam"
          type="checkbox"
          name="autoHide"
          checked={checked}
          disabled={pending}
          onChange={(e) => {
            setChecked(e.target.checked);
            queueMicrotask(() => formRef.current?.requestSubmit());
          }}
          className="accent-ink mt-0.5 size-4"
        />
        <span className="flex flex-col">
          <span className="font-semibold">Hide spam comments for me</span>
          <span className="text-ink-2 text-sm">
            Only when Waggle is sure. Off until you turn it on. You can unhide any of them in
            Ignored.
          </span>
        </span>
      </label>
      {state.saved && !pending && (
        <p role="status" className="text-ink-2 inline-flex items-center gap-1.5 pl-7 text-sm">
          <Check className="text-success size-4" strokeWidth={2} aria-hidden />
          Saved
        </p>
      )}
      {state.error && (
        <p role="alert" className="text-danger pl-7 text-sm">
          {state.error}
        </p>
      )}
    </form>
  );
}
