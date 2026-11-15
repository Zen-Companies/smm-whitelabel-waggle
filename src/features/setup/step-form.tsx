"use client";

import Link from "next/link";
import { useActionState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

type State = { error?: string };

/** One setup step: its fields, then Back and the step's main button. Errors show in place. */
export function StepForm({
  action,
  children,
  submitLabel,
  backHref,
}: {
  action: (prev: State, fd: FormData) => Promise<State>;
  children: ReactNode;
  submitLabel: string;
  backHref: string | null;
}) {
  const [state, act, pending] = useActionState(action, {});
  return (
    <form action={act} className="flex flex-col gap-5">
      {children}
      {state.error && (
        <p role="alert" className="text-danger text-sm">
          {state.error}
        </p>
      )}
      <div className="flex items-center justify-between gap-3">
        {backHref ? (
          <Link href={backHref} className="text-ink-2 hover:text-ink text-sm font-medium">
            Back
          </Link>
        ) : (
          <span />
        )}
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
