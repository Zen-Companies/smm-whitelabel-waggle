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
  skipHref,
  skipAction,
}: {
  action: (prev: State, fd: FormData) => Promise<State>;
  children: ReactNode;
  submitLabel: string;
  backHref: string | null;
  /** "Skip for now" (every setup step can be skipped, approved 17 Nov): where it goes. */
  skipHref?: string;
  /** Skip for now as a submit (Setup first, then free, 20 Nov): the first one passes setup. */
  skipAction?: (fd: FormData) => Promise<void>;
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
        <span className="flex items-center gap-4">
          {skipHref && skipAction ? (
            <>
              <input type="hidden" name="how" value="skipped" />
              <input type="hidden" name="to" value={skipHref} />
              <button
                type="submit"
                formAction={skipAction}
                formNoValidate
                disabled={pending}
                className="action-link cursor-pointer"
              >
                Skip for now
              </button>
            </>
          ) : (
            skipHref && (
              <Link href={skipHref} className="action-link">
                Skip for now
              </Link>
            )
          )}
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? "Saving…" : submitLabel}
          </Button>
        </span>
      </div>
    </form>
  );
}
