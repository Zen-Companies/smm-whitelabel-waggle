"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { createOrganization, type CreateOrgState } from "./actions";
import { ORG_NAME_MAX } from "./copy";

/** "Create an organization": the name; the user becomes its Owner. Errors under the field. */
export function CreateOrgForm({ cancelHref }: { cancelHref: string }) {
  const [state, action, pending] = useActionState<CreateOrgState, FormData>(createOrganization, {});
  return (
    <form action={action} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="org-name" className="font-semibold">
          Organization name
        </label>
        <input
          id="org-name"
          name="name"
          defaultValue={state.name}
          key={state.name}
          required
          maxLength={ORG_NAME_MAX}
          autoComplete="organization"
          autoFocus
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "org-name-error org-name-hint" : "org-name-hint"}
          className="field"
        />
        <span id="org-name-hint" className="text-ink-3 text-sm">
          A group of shops, an agency or a client. It has its own brands, team and bill.
        </span>
        {state.error && (
          <p id="org-name-error" role="alert" className="text-danger text-sm">
            {state.error}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Button type="submit" variant="primary" disabled={pending} data-busy={pending || undefined}>
          {pending ? "Creating…" : "Create organization"}
        </Button>
        <Link href={cancelHref} className={buttonVariants({ variant: "quiet" })}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
